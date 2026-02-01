/**
 * キーワード生成とプレビューAPI
 * サービスごとに何件拾えるか確認するためのエンドポイント
 *
 * POST /api/v2/connector/preview
 * - serviceId: サービスID
 * - dryRun: true（実際にエクスポートしない、キーワードのみ生成）
 */

import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import {
  generateKeywordsForService,
  generateServiceKeywordConfig,
  ServiceInfo,
  GeneratedKeywords,
  getKeywordCacheStats,
} from "@/app/lib/connector/keyword-generator";

// 直近N月の日付範囲を計算
function getDateRange(monthsBack: number): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0]; // YYYY-MM-DD

  const start = new Date(now);
  start.setMonth(start.getMonth() - monthsBack);
  const startStr = start.toISOString().split("T")[0];

  return {
    startDate: startStr,
    endDate: end,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serviceId, dryRun = true, monthsBack = 4 } = body;

    if (!serviceId) {
      return NextResponse.json(
        { success: false, error: "serviceIdは必須です" },
        { status: 400 }
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

    // AIでキーワードを生成
    const keywords = await generateKeywordsForService(service);
    const config = await generateServiceKeywordConfig(service);

    // 期間を計算
    const dateRange = getDateRange(monthsBack);

    // キャッシュ状態
    const cacheStats = getKeywordCacheStats();

    const result = {
      success: true,
      service: {
        id: service.id,
        name: service.name,
        description: service.description,
      },
      generatedKeywords: keywords,
      keywordConfig: config,
      searchConditions: {
        keyword: keywords.searchQuery,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      },
      cacheStats,
      dryRun,
      message: dryRun
        ? "ドライラン: 上記のキーワードと条件でエクスポートを実行する場合の設定です"
        : "実際にエクスポートを実行します",
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Preview API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "キーワード生成に失敗しました",
      },
      { status: 500 }
    );
  }
}

// キャッシュ情報取得
export async function GET() {
  try {
    const cacheStats = getKeywordCacheStats();
    return NextResponse.json({
      success: true,
      cache: cacheStats,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "キャッシュ情報の取得に失敗" },
      { status: 500 }
    );
  }
}
