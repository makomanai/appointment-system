/**
 * パイプライン - 0次→一次→正規化→既存取り込みへの統合
 *
 * Aコネクタからのデータ取得は別途呼び出し、
 * このモジュールではフィルタリングパイプラインを実行
 */

import { createServerSupabaseClient, isSupabaseConfigured } from "../supabase";
import {
  FirstOrderResult,
  JsNextExportRow,
  NormalizedTopicRow,
  PipelineResult,
  ServiceKeywordConfig,
} from "./types";
import { runZeroOrderFilter, buildServiceKeywordConfig } from "./zero-order-filter";
import { runFirstOrderFilter } from "./first-order-filter";
import { normalizeResults, toImportPayload } from "./normalizer";
import { applyExclusionFilter } from "./exclusion-filter";

/**
 * サービスIDからキーワード設定を取得
 */
export async function getServiceKeywordConfig(
  companyId: string
): Promise<ServiceKeywordConfig | null> {
  if (!isSupabaseConfigured()) {
    console.log("[Pipeline] Supabase未設定、デフォルト設定を使用");
    return null;
  }

  const supabase = createServerSupabaseClient();

  // 企業のサービス情報を取得
  const { data: services, error } = await supabase
    .from("services")
    .select("id, name, description, target_keywords")
    .eq("company_id", companyId)
    .limit(1);

  if (error || !services || services.length === 0) {
    console.log(`[Pipeline] サービス未登録 (company_id: ${companyId})`);
    return null;
  }

  const service = services[0];
  return buildServiceKeywordConfig(
    service.id,
    service.name,
    service.description || "",
    service.target_keywords || null
  );
}

/**
 * パイプライン実行（0次→一次→正規化→DB投入）
 */
export async function runPipeline(
  rows: JsNextExportRow[],
  companyId: string,
  keywordConfig: ServiceKeywordConfig,
  options: {
    zeroOrderLimit?: number;
    firstOrderLimit?: number; // 1次判定前の足切り上限
    dryRun?: boolean;
  } = {}
): Promise<PipelineResult> {
  const {
    zeroOrderLimit = 0, // 0 = 制限なし（B評価以上を全件通過）
    firstOrderLimit = 100, // 1次判定前の足切り上限（デフォルト100件）
    dryRun = false
  } = options;
  const errors: string[] = [];

  console.log("=== パイプライン開始 ===");
  console.log(`入力データ: ${rows.length}件`);
  console.log(`企業ID: ${companyId}`);
  console.log(`サービス: ${keywordConfig.serviceName}`);
  console.log(`ドライラン: ${dryRun}`);

  // Step 0: 除外・アプローチ先フィルター（契約済み・NG自治体を除外、アプローチ先リストでフィルタ）
  console.log("\n--- Step 0: 除外・アプローチ先フィルター ---");
  const { passed: filteredRows, excluded, includedCount } = await applyExclusionFilter(rows, companyId);

  if (includedCount !== undefined) {
    console.log(`[Pipeline] アプローチ先フィルタ後: ${includedCount}件`);
  }

  if (excluded.length > 0) {
    console.log(`[Pipeline] 除外: ${excluded.length}件`);
    excluded.slice(0, 5).forEach((e) => {
      console.log(`  - ${e.row.prefecture} ${e.row.city}: ${e.reason}`);
    });
    if (excluded.length > 5) {
      console.log(`  ... 他${excluded.length - 5}件`);
    }
  }

  if (filteredRows.length === 0) {
    console.log("[Pipeline] 全件フィルタ、パイプライン終了");
    return {
      totalFetched: rows.length,
      includedCount,
      excludedCount: excluded.length,
      zeroOrderPassed: 0,
      firstOrderProcessed: 0,
      importedCount: 0,
      errors: [`全${rows.length}件がフィルタ対象でした`],
    };
  }

  // Step 1: 0次判定
  console.log("\n--- Step 1: 0次判定 ---");
  const zeroResults = runZeroOrderFilter(filteredRows, keywordConfig, zeroOrderLimit);

  if (zeroResults.length === 0) {
    console.log("[Pipeline] 0次判定通過なし、パイプライン終了");
    return {
      totalFetched: rows.length,
      includedCount,
      excludedCount: excluded.length,
      zeroOrderPassed: 0,
      firstOrderProcessed: 0,
      importedCount: 0,
      errors: ["0次判定を通過したデータがありません"],
    };
  }

  // Step 1.5: 1次判定前の足切り（100件以上ある場合は上位100件に制限）
  let zeroResultsForFirstOrder = zeroResults;
  if (firstOrderLimit > 0 && zeroResults.length > firstOrderLimit) {
    console.log(`\n[Pipeline] 1次判定前足切り: ${zeroResults.length}件 → 上位${firstOrderLimit}件`);
    zeroResultsForFirstOrder = zeroResults.slice(0, firstOrderLimit);
  }

  // Step 2: 一次判定
  console.log("\n--- Step 2: 一次判定 ---");
  let firstResults: FirstOrderResult[];
  try {
    firstResults = await runFirstOrderFilter(zeroResultsForFirstOrder, keywordConfig);
  } catch (error) {
    const msg = `一次判定エラー: ${error instanceof Error ? error.message : "Unknown"}`;
    console.error(msg);
    errors.push(msg);
    firstResults = zeroResults.map((z) => ({
      row: z.row,
      zeroOrderScore: z.score,
      evidenceSnippets: [],
      fullRangeText: "",
      hasSubtitle: false,
    }));
  }

  // Step 3: 正規化
  console.log("\n--- Step 3: 正規化 ---");
  const normalized = normalizeResults(firstResults, companyId);

  // Step 4: 既存取り込み処理へ流す
  console.log("\n--- Step 4: DB投入 ---");

  if (dryRun) {
    console.log("[Pipeline] ドライラン: DB投入をスキップ");
    return {
      totalFetched: rows.length,
      includedCount,
      excludedCount: excluded.length,
      zeroOrderPassed: zeroResults.length,
      firstOrderProcessed: firstResults.length,
      importedCount: 0,
      errors,
    };
  }

  if (!isSupabaseConfigured()) {
    errors.push("Supabaseが設定されていません");
    return {
      totalFetched: rows.length,
      includedCount,
      excludedCount: excluded.length,
      zeroOrderPassed: zeroResults.length,
      firstOrderProcessed: firstResults.length,
      importedCount: 0,
      errors,
    };
  }

  // 既存取り込みと同じ形式でDBに投入
  const importPayload = toImportPayload(normalized, companyId);
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("topics")
    .upsert(importPayload, {
      onConflict: "company_row_key",
      ignoreDuplicates: false,
    })
    .select("id");

  if (error) {
    const msg = `DB投入エラー: ${error.message}`;
    console.error(msg);
    errors.push(msg);
    return {
      totalFetched: rows.length,
      includedCount,
      excludedCount: excluded.length,
      zeroOrderPassed: zeroResults.length,
      firstOrderProcessed: firstResults.length,
      importedCount: 0,
      errors,
    };
  }

  const importedCount = data?.length || 0;
  console.log(`[Pipeline] DB投入完了: ${importedCount}件`);

  console.log("\n=== パイプライン完了 ===");

  return {
    totalFetched: rows.length,
    includedCount,
    excludedCount: excluded.length,
    zeroOrderPassed: zeroResults.length,
    firstOrderProcessed: firstResults.length,
    importedCount,
    errors,
  };
}

/**
 * CSVテキストをパースしてパイプラインを実行
 */
export async function runPipelineFromCSV(
  csvText: string,
  companyId: string,
  options: {
    zeroOrderLimit?: number;
    dryRun?: boolean;
  } = {}
): Promise<PipelineResult> {
  // CSVパース
  const rows = parseCSVToRows(csvText);

  // サービス設定取得
  let keywordConfig = await getServiceKeywordConfig(companyId);
  if (!keywordConfig) {
    // デフォルト設定を使用
    keywordConfig = {
      serviceId: "default",
      serviceName: "汎用",
      must: ["システム", "DX", "デジタル化"],
      should: ["予算", "導入", "効率化", "来年度"],
      not: ["導入済み", "契約済み"],
      meta: 0,
    };
  }

  return runPipeline(rows, companyId, keywordConfig, options);
}

/**
 * CSVテキストをJsNextExportRow配列に変換
 */
function parseCSVToRows(csvText: string): JsNextExportRow[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_")
  );

  const rows: JsNextExportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = values[idx] || "";
    });

    rows.push({
      group_id: raw.group_id || raw.グループid || "",
      prefecture: raw.prefecture || raw.都道府県 || "",
      city: raw.city || raw.市町村 || "",
      council_date: raw.council_date || raw.議会日付 || "",
      title: raw.title || raw.タイトル || raw.議題タイトル || "",
      summary: raw.summary || raw.概要 || raw.議題概要 || "",
      questioner: raw.questioner || raw.質問者 || "",
      answerer: raw.answerer || raw.回答者 || "",
      source_url: raw.source_url || raw.url || raw.ソースurl || "",
      start_sec: parseInt(raw.start_sec || raw.開始秒数 || "0", 10),
      end_sec: parseInt(raw.end_sec || raw.終了秒数 || "0", 10),
      external_id: raw.external_id || raw.議題id || undefined,
      category: raw.category || raw.カテゴリ || undefined,
      stance: raw.stance || raw.立場 || undefined,
    });
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
