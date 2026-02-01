/**
 * テストフェッチAPI
 * 実際にJS-NEXTからエクスポートを実行して件数を確認
 *
 * POST /api/v2/connector/test-fetch
 * - serviceId: サービスID
 * - monthsBack: 直近何ヶ月か（デフォルト4）
 * - skipImport: true（DBインポートしない、件数確認のみ）
 */

import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import {
  JsNextConnector,
  getConnectorConfig,
  isJsNextConfigured,
  ExportSearchConditions,
} from "@/app/lib/connector";
import {
  generateKeywordsForService,
  ServiceInfo,
} from "@/app/lib/connector/keyword-generator";
import { runZeroOrderFilter } from "@/app/lib/connector/zero-order-filter";
import { ServiceKeywordConfig } from "@/app/lib/connector/types";

// 直近N月の日付範囲を計算
function getDateRange(monthsBack: number): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0];

  const start = new Date(now);
  start.setMonth(start.getMonth() - monthsBack);
  const startStr = start.toISOString().split("T")[0];

  return { startDate: startStr, endDate: end };
}

// レート制限（サーバー負担軽減）
const lastFetchTime = new Map<string, number>();
const MIN_INTERVAL_MS = 60 * 1000; // 1分間隔

// 日本時間の深夜帯チェック
function isJapanNightTime(): { isNight: boolean; japanHour: number } {
  const now = new Date();
  const japanTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const japanHour = japanTime.getUTCHours();
  return { isNight: japanHour >= 22 || japanHour < 7, japanHour };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serviceId, monthsBack = 4, skipImport = true, forceRun = false } = body;

    // 深夜帯チェック（警告のみ、ブロックしない）
    const nightCheck = isJapanNightTime();
    if (nightCheck.isNight && !forceRun) {
      return NextResponse.json({
        success: false,
        error: "日本時間の深夜帯（22:00〜7:00）はSlack通知が発生するため非推奨です",
        currentTimeJST: `${nightCheck.japanHour}:00`,
        hint: "forceRun: true で強制実行可能",
      }, { status: 503 });
    }

    if (!serviceId) {
      return NextResponse.json(
        { success: false, error: "serviceIdは必須です" },
        { status: 400 }
      );
    }

    // JS-NEXT設定確認
    if (!isJsNextConfigured()) {
      return NextResponse.json(
        { success: false, error: "JS-NEXTの認証情報が設定されていません" },
        { status: 500 }
      );
    }

    // レート制限チェック
    const lastTime = lastFetchTime.get(serviceId) || 0;
    const elapsed = Date.now() - lastTime;
    if (elapsed < MIN_INTERVAL_MS) {
      return NextResponse.json(
        {
          success: false,
          error: `レート制限: ${Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000)}秒後に再試行してください`,
        },
        { status: 429 }
      );
    }

    // サービス情報を取得
    const allServices = await kv.hgetall<Record<string, ServiceInfo>>("services") || {};
    const service = allServices[serviceId];

    if (!service) {
      return NextResponse.json(
        { success: false, error: "サービスが見つかりません" },
        { status: 404 }
      );
    }

    // レート制限更新
    lastFetchTime.set(serviceId, Date.now());

    // AIでキーワードを生成
    console.log(`[TestFetch] サービス: ${service.name}`);
    const keywords = await generateKeywordsForService(service);

    // 期間を計算
    const dateRange = getDateRange(monthsBack);

    // 検索条件を構築
    const conditions: ExportSearchConditions = {
      keyword: keywords.searchQuery,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    };

    console.log(`[TestFetch] 検索条件:`, conditions);

    // JS-NEXTからフェッチ
    const config = getConnectorConfig();
    const connector = new JsNextConnector(config);

    const rows = await connector.fetchWithConditions(conditions);

    console.log(`[TestFetch] 取得件数: ${rows.length}`);

    // 0次判定を適用
    const keywordConfig: ServiceKeywordConfig = {
      serviceId: service.id,
      serviceName: service.name,
      must: keywords.must,
      should: keywords.should,
      not: keywords.not,
      meta: 0,
    };

    // 全件をスコアリング（limit=999999で全件取得）
    const zeroOrderResults = runZeroOrderFilter(rows, keywordConfig, 999999);
    const passedCount = zeroOrderResults.filter((r) => r.passed).length;

    // サンプルデータ（上位5件）
    const samples = zeroOrderResults
      .slice(0, 5)
      .map((r) => ({
        title: r.row.title?.substring(0, 50),
        prefecture: r.row.prefecture,
        city: r.row.city,
        council_date: r.row.council_date,
        score: r.score,
        passed: r.passed,
        mustCount: r.mustCount,
        shouldCount: r.shouldCount,
      }));

    const result = {
      success: true,
      service: {
        id: service.id,
        name: service.name,
      },
      searchConditions: conditions,
      generatedKeywords: {
        must: keywords.must,
        should: keywords.should.slice(0, 10), // 表示用に制限
        shouldTotal: keywords.should.length,
        not: keywords.not,
      },
      results: {
        totalFetched: rows.length,
        zeroOrderPassed: passedCount,
        passRate: rows.length > 0 ? ((passedCount / rows.length) * 100).toFixed(1) + "%" : "0%",
      },
      samples,
      skipImport,
      message: skipImport
        ? `${rows.length}件取得、${passedCount}件が0次判定通過（DBインポートはスキップ）`
        : `${passedCount}件をDBにインポートしました`,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[TestFetch API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "フェッチに失敗しました",
      },
      { status: 500 }
    );
  }
}
