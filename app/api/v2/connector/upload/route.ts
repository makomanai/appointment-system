/**
 * 手動CSVアップロード + 判定パイプライン
 *
 * CSVをアップロード → 0次判定 → 1次判定 → DB投入
 * JS-NEXT APIが利用可能になるまでの間、手動でデータを取り込んで判定を実行
 */

import { NextRequest, NextResponse } from "next/server";
import { runPipeline, getServiceKeywordConfig } from "../../../../lib/connector/pipeline";
import { getDefaultServiceKeywordConfig } from "../../../../lib/connector/zero-order-filter";
import { ServiceKeywordConfig, JsNextExportRow } from "../../../../lib/connector/types";
import {
  generateKeywordsForService,
  ServiceInfo,
} from "../../../../lib/connector/keyword-generator";
import { kv } from "@vercel/kv";
import { notifyPipelineComplete, isSlackConfigured } from "../../../../lib/slack";

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
      group_id: raw.group_id || raw.グループid || raw.groupid || "",
      prefecture: raw.prefecture || raw.都道府県 || "",
      city: raw.city || raw.市町村 || raw.市区町村 || "",
      council_date: raw.council_date || raw.議会日付 || raw["議会の日付"] || "",
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

export async function POST(request: NextRequest) {
  console.log("=== /api/v2/connector/upload POST ===");

  try {
    const contentType = request.headers.get("content-type") || "";

    let csvText: string;
    let companyId: string;
    let serviceId: string | null = null;
    let dryRun = false;
    let skipFirstOrder = false;

    // FormData（CSVファイルアップロード）の場合
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      companyId = formData.get("companyId") as string;
      serviceId = formData.get("serviceId") as string | null;
      dryRun = formData.get("dryRun") === "true";
      skipFirstOrder = formData.get("skipFirstOrder") === "true";

      if (!file) {
        return NextResponse.json(
          { success: false, error: "CSVファイルが必要です" },
          { status: 400 }
        );
      }

      csvText = await file.text();
    } else {
      // JSONの場合
      const body = await request.json();
      csvText = body.csvText;
      companyId = body.companyId;
      serviceId = body.serviceId || null;
      dryRun = body.dryRun || false;
      skipFirstOrder = body.skipFirstOrder || false;
    }

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "companyIdが必要です" },
        { status: 400 }
      );
    }

    if (!csvText) {
      return NextResponse.json(
        { success: false, error: "CSVデータが必要です" },
        { status: 400 }
      );
    }

    // CSVをパース
    const rows = parseCSVToRows(csvText);
    console.log(`[Upload] CSVパース完了: ${rows.length}件`);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "CSVにデータがありません" },
        { status: 400 }
      );
    }

    // キーワード設定を取得
    let keywordConfig: ServiceKeywordConfig;

    if (serviceId) {
      // サービスIDからAIでキーワード生成
      const allServices = await kv.hgetall<Record<string, ServiceInfo>>("services") || {};
      const service = allServices[serviceId];

      if (service) {
        console.log(`[Upload] サービス: ${service.name} - AIキーワード生成中...`);
        const keywords = await generateKeywordsForService(service);

        keywordConfig = {
          serviceId: service.id,
          serviceName: service.name,
          must: keywords.must,
          should: keywords.should,
          not: keywords.not,
          meta: 0,
        };
      } else {
        // サービスが見つからない場合はDBから取得を試みる
        const dbConfig = await getServiceKeywordConfig(companyId);
        keywordConfig = dbConfig || getDefaultServiceKeywordConfig("default");
      }
    } else {
      // サービス未指定の場合はDBまたはデフォルト設定
      const dbConfig = await getServiceKeywordConfig(companyId);
      keywordConfig = dbConfig || getDefaultServiceKeywordConfig("default");
    }

    console.log(`[Upload] キーワード設定:`, {
      serviceName: keywordConfig.serviceName,
      must: keywordConfig.must.length,
      should: keywordConfig.should.length,
    });

    // パイプライン実行（0次 → 1次 → DB投入）
    const result = await runPipeline(rows, companyId, keywordConfig, {
      zeroOrderLimit: 0, // B評価以上は全件通過
      firstOrderLimit: skipFirstOrder ? 0 : 100, // 1次判定の上限
      dryRun,
    });

    // Slack通知（設定されている場合のみ、ドライラン以外）
    if (isSlackConfigured() && !dryRun && result.importedCount > 0) {
      await notifyPipelineComplete({
        companyName: companyId,
        serviceName: keywordConfig.serviceName,
        totalFetched: result.totalFetched,
        zeroOrderPassed: result.zeroOrderPassed,
        importedCount: result.importedCount,
        dryRun,
        errors: result.errors,
      });
    }

    return NextResponse.json({
      success: true,
      message: dryRun
        ? `ドライラン完了: ${result.zeroOrderPassed}件が0次通過、${result.firstOrderProcessed}件を1次処理`
        : `取込完了: ${result.importedCount}件をDBに投入`,
      ...result,
      keywordConfig: {
        serviceName: keywordConfig.serviceName,
        mustCount: keywordConfig.must.length,
        shouldCount: keywordConfig.should.length,
        mustKeywords: keywordConfig.must.slice(0, 10),
      },
    });
  } catch (error) {
    console.error("[Upload] エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * 使用方法
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    description: "手動CSVアップロード + 判定パイプライン",
    usage: {
      endpoint: "/api/v2/connector/upload",
      method: "POST",
      contentType: "multipart/form-data または application/json",
      parameters: {
        file: "CSVファイル（FormDataの場合）",
        csvText: "CSVテキスト（JSONの場合）",
        companyId: "企業ID（必須）",
        serviceId: "サービスID（AIキーワード生成に使用、オプション）",
        dryRun: "trueでDB投入をスキップ（デフォルト: false）",
        skipFirstOrder: "trueで1次判定をスキップ（デフォルト: false）",
      },
    },
    pipeline: {
      step1: "CSVパース",
      step2: "0次判定（キーワードスコアリング、B評価以上を通過）",
      step3: "1次判定（字幕から根拠スニペット抽出、上位100件）",
      step4: "正規化・DB投入（重複排除）",
    },
    note: "JS-NEXT APIが利用可能になるまでの間、手動でCSVを取り込んで判定を実行できます",
  });
}
