/**
 * コネクタ自動取得API - JS-NEXTから自動でCSVを取得して処理
 *
 * POST: サービス別キーワードでJS-NEXTから取得→0次→一次→DB投入
 * - 初回: 直近4ヶ月のデータを取得
 * - 2回目以降: 最終フェッチ日からの差分のみ取得
 */

import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import {
  JsNextConnector,
  getConnectorConfig,
  isJsNextConfigured,
  ExportSearchConditions,
} from "../../../../lib/connector/js-next-connector";
import { runPipeline, getServiceKeywordConfig } from "../../../../lib/connector/pipeline";
import { getDefaultServiceKeywordConfig } from "../../../../lib/connector/zero-order-filter";
import { ServiceKeywordConfig } from "../../../../lib/connector/types";
import {
  getDateRangeForFetch,
  updateFetchHistory,
  getFetchHistory,
} from "../../../../lib/connector/fetch-history";
import {
  generateKeywordsForService,
  ServiceInfo,
} from "../../../../lib/connector/keyword-generator";

export async function POST(request: NextRequest) {
  console.log("=== /api/v2/connector/fetch POST ===");

  // JS-NEXT設定の確認
  if (!isJsNextConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: "JS-NEXT認証情報が設定されていません。環境変数 JS_NEXT_EMAIL, JS_NEXT_PASSWORD を設定してください。",
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const {
      companyId,
      serviceId,
      serviceName,
      customKeywords,
      dryRun = false,
      limit = 0, // 0 = 制限なし（B評価以上を全件通過）
      forceFullFetch = false, // 強制的に全期間取得
      initialMonthsBack = 4,  // 初回取得期間（月）
    } = body;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "companyIdが必要です" },
        { status: 400 }
      );
    }

    // serviceIdがあればサービス情報を取得してAIキーワード生成
    let keywordConfig: ServiceKeywordConfig;
    let effectiveServiceId = serviceId || serviceName || "default";

    if (serviceId) {
      // サービスIDからサービス情報を取得してAIでキーワード生成
      const allServices = await kv.hgetall<Record<string, ServiceInfo>>("services") || {};
      const service = allServices[serviceId];

      if (service) {
        console.log(`[Fetch] サービス: ${service.name} - AIキーワード生成中...`);
        const keywords = await generateKeywordsForService(service);

        keywordConfig = {
          serviceId: service.id,
          serviceName: service.name,
          must: keywords.must,
          should: keywords.should,
          not: keywords.not,
          meta: 0,
        };
        effectiveServiceId = service.id;
      } else {
        return NextResponse.json(
          { success: false, error: "サービスが見つかりません" },
          { status: 404 }
        );
      }
    } else if (customKeywords) {
      // カスタムキーワードが指定された場合
      keywordConfig = {
        serviceId: "custom",
        serviceName: "カスタム検索",
        must: customKeywords.must || [],
        should: customKeywords.should || [],
        not: customKeywords.not || [],
        meta: customKeywords.meta || 0,
      };
      effectiveServiceId = "custom";
    } else if (serviceName) {
      // サービス名からデフォルト設定を取得
      keywordConfig = getDefaultServiceKeywordConfig(serviceName);
      effectiveServiceId = serviceName;
    } else {
      // DBからサービス設定を取得
      const dbConfig = await getServiceKeywordConfig(companyId);
      keywordConfig = dbConfig || getDefaultServiceKeywordConfig("default");
    }

    console.log(`[Fetch] 企業ID: ${companyId}, サービス: ${keywordConfig.serviceName}`);
    console.log(`[Fetch] キーワード設定:`, {
      must: keywordConfig.must.length,
      should: keywordConfig.should.length,
    });

    // 差分取得用の日付範囲を計算
    const fetchHistoryKey = `${companyId}:${effectiveServiceId}`;
    const dateRange = forceFullFetch
      ? {
          startDate: (() => {
            const d = new Date();
            d.setMonth(d.getMonth() - initialMonthsBack);
            return d.toISOString().split("T")[0];
          })(),
          endDate: new Date().toISOString().split("T")[0],
          isInitial: true,
        }
      : await getDateRangeForFetch(fetchHistoryKey, initialMonthsBack);

    const previousHistory = await getFetchHistory(fetchHistoryKey);

    console.log(`[Fetch] 日付範囲: ${dateRange.startDate} 〜 ${dateRange.endDate}`);
    console.log(`[Fetch] ${dateRange.isInitial ? "初回取得（4ヶ月分）" : "差分取得"}`);

    // 検索条件を構築
    const searchConditions: ExportSearchConditions = {
      keyword: [...keywordConfig.must, ...keywordConfig.should.slice(0, 5)].join(" "),
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    };

    // Aコネクタでデータを取得
    const config = getConnectorConfig();
    const connector = new JsNextConnector(config);

    console.log("[Fetch] JS-NEXTからデータを取得中...");

    let rows;
    try {
      rows = await connector.fetchWithConditions(searchConditions);
    } catch (fetchError) {
      console.error("[Fetch] JS-NEXT取得エラー:", fetchError);
      return NextResponse.json(
        {
          success: false,
          error: `JS-NEXTからの取得に失敗しました: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`,
        },
        { status: 500 }
      );
    }

    console.log(`[Fetch] ${rows.length}件のデータを取得`);

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: "検索条件に一致するデータがありませんでした",
        totalFetched: 0,
        zeroOrderPassed: 0,
        firstOrderProcessed: 0,
        importedCount: 0,
      });
    }

    // パイプライン実行（0次→一次→DB投入）
    const result = await runPipeline(rows, companyId, keywordConfig, {
      zeroOrderLimit: limit,
      dryRun,
    });

    // フェッチ履歴を更新（dryRunでない場合のみ）
    if (!dryRun && rows.length > 0) {
      await updateFetchHistory(fetchHistoryKey, rows.length);
    }

    return NextResponse.json({
      success: true,
      message: dateRange.isInitial
        ? `初回取得: ${rows.length}件取得、${result.importedCount}件をDBに投入`
        : `差分取得: ${rows.length}件取得、${result.importedCount}件をDBに投入`,
      ...result,
      fetchInfo: {
        isInitial: dateRange.isInitial,
        dateRange: {
          start: dateRange.startDate,
          end: dateRange.endDate,
        },
        previousFetch: previousHistory?.lastFetchDate || null,
      },
      keywordConfig: {
        serviceName: keywordConfig.serviceName,
        mustCount: keywordConfig.must.length,
        shouldCount: keywordConfig.should.length,
        mustKeywords: keywordConfig.must,
      },
    });
  } catch (error) {
    console.error("[Fetch] エラー:", error);
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
 * 設定確認と使用方法
 */
export async function GET() {
  const configured = isJsNextConfigured();
  const { getAllFetchHistory } = await import("../../../../lib/connector/fetch-history");
  const fetchHistory = await getAllFetchHistory();

  return NextResponse.json({
    success: true,
    jsNextConfigured: configured,
    fetchHistory,
    usage: {
      endpoint: "/api/v2/connector/fetch",
      method: "POST",
      body: {
        companyId: "企業ID（必須）",
        serviceId: "サービスID（AIキーワード自動生成）",
        serviceName: "サービス名（AiCAN等、オプション）",
        customKeywords: {
          must: ["必須キーワード配列"],
          should: ["推奨キーワード配列"],
          not: ["除外キーワード配列"],
          meta: "基本スコア（数値）",
        },
        dryRun: "trueでDB投入をスキップ（デフォルト: false）",
        limit: "0次判定の上限件数（デフォルト: 0=制限なし、B評価以上を全件通過）",
        forceFullFetch: "trueで差分ではなく全期間取得（デフォルト: false）",
        initialMonthsBack: "初回取得期間（月）（デフォルト: 4）",
      },
    },
    differentialFetch: {
      description: "初回は4ヶ月分、2回目以降は最終フェッチ日からの差分のみ取得",
      forceFullFetch: "trueを指定すると強制的に全期間取得",
    },
    requiredEnvVars: ["JS_NEXT_EMAIL", "JS_NEXT_PASSWORD", "OPENAI_API_KEY"],
  });
}
