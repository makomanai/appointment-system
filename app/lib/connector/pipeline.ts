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
import { runZeroOrderFilter, runAiZeroOrderFilter, buildServiceKeywordConfig, ServiceContext } from "./zero-order-filter";
import { runFirstOrderFilter } from "./first-order-filter";
import { normalizeResults, toImportPayload } from "./normalizer";
import { applyExclusionFilter } from "./exclusion-filter";
import { runAiRanking, getServiceInfoForCompany, ServiceInfo } from "./ai-ranker";

/**
 * サービスコンテキストを取得（AI 0次判定用）
 */
export async function getServiceContext(
  companyId: string
): Promise<ServiceContext | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data: services, error } = await supabase
    .from("services")
    .select("name, description, target_keywords, target_problems")
    .eq("company_id", companyId)
    .limit(1);

  if (error || !services || services.length === 0) {
    return null;
  }

  const service = services[0];
  return {
    name: service.name,
    description: service.description || "",
    targetProblems: service.target_problems || "",
    targetKeywords: service.target_keywords || "",
  };
}

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
    .select("id, name, description, target_keywords, target_problems")
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
    service.target_keywords || null,
    service.target_problems || null
  );
}

/**
 * パイプライン実行（0次→一次→AI判定→正規化→DB投入）
 */
export async function runPipeline(
  rows: JsNextExportRow[],
  companyId: string,
  keywordConfig: ServiceKeywordConfig,
  options: {
    zeroOrderLimit?: number;
    firstOrderLimit?: number; // 1次判定前の足切り上限
    enableAiRanking?: boolean; // AI判定を有効化
    useAiZeroOrder?: boolean; // AI 0次判定を使用（GPT-4o-mini）
    serviceContext?: ServiceContext | null; // AI 0次判定用サービス情報
    dryRun?: boolean;
  } = {}
): Promise<PipelineResult> {
  const {
    zeroOrderLimit = 0, // 0 = 制限なし（B評価以上を全件通過）
    firstOrderLimit = 100, // 1次判定前の足切り上限（デフォルト100件）
    enableAiRanking = true, // デフォルトでAI判定を有効化
    useAiZeroOrder = true, // デフォルトでAI 0次判定を使用
    serviceContext = null,
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

  // Step 1: 0次判定（AI or キーワード）
  console.log("\n--- Step 1: 0次判定 ---");
  let zeroResults;

  // AI 0次判定を使用（サービス情報がある場合）
  if (useAiZeroOrder && serviceContext && process.env.OPENAI_API_KEY) {
    console.log("[Pipeline] AI 0次判定（GPT-4o-mini）を使用");
    try {
      zeroResults = await runAiZeroOrderFilter(filteredRows, serviceContext, zeroOrderLimit);
    } catch (error) {
      console.error("[Pipeline] AI 0次判定エラー、キーワード判定にフォールバック:", error);
      errors.push(`AI 0次判定エラー: ${error instanceof Error ? error.message : "Unknown"}`);
      zeroResults = runZeroOrderFilter(filteredRows, keywordConfig, zeroOrderLimit);
    }
  } else {
    // キーワードベースの0次判定
    if (useAiZeroOrder && !serviceContext) {
      console.log("[Pipeline] サービス情報なし、キーワード判定を使用");
    }
    zeroResults = runZeroOrderFilter(filteredRows, keywordConfig, zeroOrderLimit);
  }

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

  // Step 2.5: AI判定（SRTテキスト + サービス情報で最終ランク付け）
  let priorityMap: Map<string, "A" | "B" | "C"> | undefined;
  let aiRankedCount = 0;
  let aiRankDistribution: { A: number; B: number; C: number } | undefined;

  if (enableAiRanking && process.env.OPENAI_API_KEY) {
    console.log("\n--- Step 2.5: AI判定 ---");

    try {
      // サービス情報を取得
      const supabase = createServerSupabaseClient();
      const serviceInfo = await getServiceInfoForCompany(companyId, supabase);

      // AI判定実行
      const aiResults = await runAiRanking(firstResults, serviceInfo, {
        maxConcurrent: 3,
        onProgress: (current, total) => {
          console.log(`[AI判定] 進捗: ${current}/${total}`);
        },
      });

      // priority マップを構築（row識別子 → priority）
      priorityMap = new Map();
      for (const result of aiResults) {
        const { row } = result;
        // company_row_key と同じロジックで識別子を生成
        let key: string;
        if (row.group_id) {
          key = `${companyId}_${row.group_id}_${row.start_sec}_${row.end_sec}`.replace(
            /[^a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF-]/g,
            ""
          );
        } else if (row.external_id) {
          key = `${companyId}_${row.external_id}_${row.start_sec}_${row.end_sec}`.replace(
            /[^a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF-]/g,
            ""
          );
        } else {
          // ハッシュベースのキー
          const base = [
            companyId,
            row.prefecture || "",
            row.city || "",
            row.council_date || "",
            row.title || "",
            String(row.start_sec || 0),
            String(row.end_sec || 0),
          ].join("_");
          let hash = 0;
          for (let i = 0; i < base.length; i++) {
            const char = base.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          key = `${companyId}_${Math.abs(hash).toString(36)}`.replace(
            /[^a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g,
            ""
          );
        }
        priorityMap.set(key, result.aiRank.priority);
      }

      // AI判定の統計
      aiRankedCount = aiResults.length;
      aiRankDistribution = { A: 0, B: 0, C: 0 };
      aiResults.forEach((r) => aiRankDistribution![r.aiRank.priority]++);
      console.log(`[AI判定] 完了:`, aiRankDistribution);
    } catch (error) {
      const msg = `AI判定エラー: ${error instanceof Error ? error.message : "Unknown"}`;
      console.error(msg);
      errors.push(msg);
      // AI判定失敗時は priority = null のまま進める
    }
  } else if (enableAiRanking && !process.env.OPENAI_API_KEY) {
    console.log("\n[Pipeline] OPENAI_API_KEY未設定、AI判定をスキップ");
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
      aiRankedCount: aiRankedCount > 0 ? aiRankedCount : undefined,
      aiRankDistribution,
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
      aiRankedCount: aiRankedCount > 0 ? aiRankedCount : undefined,
      aiRankDistribution,
      importedCount: 0,
      errors,
    };
  }

  // 既存取り込みと同じ形式でDBに投入（AI判定結果のpriorityを含む）
  // C判定はDBに保存しない（コスト削減 + 不要データ除外）
  const importPayload = toImportPayload(normalized, companyId, priorityMap);

  // C判定を除外
  const filteredPayload = importPayload.filter((item) => {
    // priorityがCのものは除外
    if (item.priority === "C") {
      return false;
    }
    return true;
  });

  const cRankCount = importPayload.length - filteredPayload.length;
  if (cRankCount > 0) {
    console.log(`[Pipeline] C判定を除外: ${cRankCount}件`);
  }

  if (filteredPayload.length === 0) {
    console.log("[Pipeline] A/B判定がないため、DB投入をスキップ");
    return {
      totalFetched: rows.length,
      includedCount,
      excludedCount: excluded.length,
      zeroOrderPassed: zeroResults.length,
      firstOrderProcessed: firstResults.length,
      aiRankedCount: aiRankedCount > 0 ? aiRankedCount : undefined,
      aiRankDistribution,
      importedCount: 0,
      cRankExcluded: cRankCount,
      errors,
    };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("topics")
    .upsert(filteredPayload, {
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
      aiRankedCount: aiRankedCount > 0 ? aiRankedCount : undefined,
      aiRankDistribution,
      cRankExcluded: cRankCount,
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
    aiRankedCount: aiRankedCount > 0 ? aiRankedCount : undefined,
    aiRankDistribution,
    cRankExcluded: cRankCount,
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
