/**
 * コネクタスケジューラーAPI - 全企業の自動取得を実行
 *
 * POST: 全企業（または指定企業）のデータを自動取得
 *       Vercel Cron または外部スケジューラーから呼び出し
 *
 * 認証: CRON_SECRET ヘッダーで保護
 * 時間制限: 日本時間 22:00〜7:00 は実行しない（Slack通知回避）
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../../lib/supabase";
import {
  JsNextConnector,
  getConnectorConfig,
  isJsNextConfigured,
} from "../../../../lib/connector/js-next-connector";
import { runPipeline } from "../../../../lib/connector/pipeline";
import { buildServiceKeywordConfig, getDefaultServiceKeywordConfig } from "../../../../lib/connector/zero-order-filter";
import { PipelineResult, ServiceKeywordConfig } from "../../../../lib/connector/types";

/**
 * 日本時間の深夜帯（22:00〜7:00）かどうかをチェック
 */
function isJapanNightTime(): { isNight: boolean; japanHour: number; nextAllowedTime: string } {
  const now = new Date();
  // 日本時間に変換（UTC+9）
  const japanTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const japanHour = japanTime.getUTCHours();

  // 22:00〜翌6:59 は深夜帯
  const isNight = japanHour >= 22 || japanHour < 7;

  // 次に実行可能な時間
  let nextAllowedTime = "";
  if (isNight) {
    if (japanHour >= 22) {
      // 翌日7:00
      nextAllowedTime = "翌日 7:00 JST";
    } else {
      // 当日7:00
      nextAllowedTime = "本日 7:00 JST";
    }
  }

  return { isNight, japanHour, nextAllowedTime };
}

interface CompanyResult {
  companyId: string;
  companyName: string;
  serviceName: string;
  success: boolean;
  result?: PipelineResult;
  error?: string;
}

/**
 * スケジューラー実行（全企業または指定企業）
 */
export async function POST(request: NextRequest) {
  console.log("=== /api/v2/connector/scheduler POST ===");

  // 認証チェック（Cron Secret）
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // 設定チェック
  if (!isJsNextConfigured()) {
    return NextResponse.json(
      { success: false, error: "JS-NEXT認証情報が設定されていません" },
      { status: 503 }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabaseが設定されていません" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      companyIds,     // 特定企業のみ処理（オプション）
      dryRun = false,
      limit = 0, // 0 = 制限なし（B評価以上を全件通過）
      forceRun = false, // 深夜帯でも強制実行
    } = body;

    // 日本時間の深夜帯チェック（Slack通知回避）
    const nightCheck = isJapanNightTime();
    if (nightCheck.isNight && !forceRun) {
      console.log(`[Scheduler] 深夜帯のため実行をスキップ (JST ${nightCheck.japanHour}:00)`);
      return NextResponse.json({
        success: false,
        error: "日本時間の深夜帯（22:00〜7:00）は実行できません",
        currentTimeJST: `${nightCheck.japanHour}:00`,
        nextAllowedTime: nightCheck.nextAllowedTime,
        hint: "forceRun: true で強制実行可能",
      }, { status: 503 });
    }

    if (forceRun && nightCheck.isNight) {
      console.log(`[Scheduler] 深夜帯だが強制実行 (JST ${nightCheck.japanHour}:00)`);
    }

    const supabase = createServerSupabaseClient();

    // 処理対象の企業を取得
    let companiesQuery = supabase
      .from("companies")
      .select("company_id, company_name");

    if (companyIds && companyIds.length > 0) {
      companiesQuery = companiesQuery.in("company_id", companyIds);
    }

    const { data: companies, error: companiesError } = await companiesQuery;

    if (companiesError || !companies || companies.length === 0) {
      return NextResponse.json({
        success: true,
        message: "処理対象の企業がありません",
        results: [],
      });
    }

    console.log(`[Scheduler] ${companies.length}社を処理開始`);

    const results: CompanyResult[] = [];
    const connectorConfig = getConnectorConfig();

    for (const company of companies) {
      console.log(`\n[Scheduler] 処理中: ${company.company_id} (${company.company_name})`);

      try {
        // 企業のサービス情報を取得
        const { data: services } = await supabase
          .from("services")
          .select("id, name, description, target_keywords")
          .eq("company_id", company.company_id)
          .limit(1);

        let keywordConfig: ServiceKeywordConfig;

        if (services && services.length > 0) {
          const service = services[0];
          keywordConfig = buildServiceKeywordConfig(
            service.id,
            service.name,
            service.description || "",
            service.target_keywords || null
          );
        } else {
          keywordConfig = getDefaultServiceKeywordConfig("default");
        }

        console.log(`[Scheduler] キーワード: ${keywordConfig.serviceName}`);

        // JS-NEXTからデータを取得
        const connector = new JsNextConnector(connectorConfig);
        const rows = await connector.fetchData(keywordConfig);

        console.log(`[Scheduler] ${rows.length}件を取得`);

        if (rows.length === 0) {
          results.push({
            companyId: company.company_id,
            companyName: company.company_name,
            serviceName: keywordConfig.serviceName,
            success: true,
            result: {
              totalFetched: 0,
              zeroOrderPassed: 0,
              firstOrderProcessed: 0,
              importedCount: 0,
              errors: [],
            },
          });
          continue;
        }

        // パイプライン実行
        const pipelineResult = await runPipeline(
          rows,
          company.company_id,
          keywordConfig,
          { zeroOrderLimit: limit, dryRun }
        );

        results.push({
          companyId: company.company_id,
          companyName: company.company_name,
          serviceName: keywordConfig.serviceName,
          success: true,
          result: pipelineResult,
        });

        console.log(`[Scheduler] ${company.company_id}: ${pipelineResult.importedCount}件投入`);

        // レート制限対策（企業間で少し待機）
        await new Promise((resolve) => setTimeout(resolve, 2000));

      } catch (companyError) {
        const errorMsg = companyError instanceof Error ? companyError.message : "Unknown error";
        console.error(`[Scheduler] ${company.company_id} エラー:`, errorMsg);

        results.push({
          companyId: company.company_id,
          companyName: company.company_name,
          serviceName: "N/A",
          success: false,
          error: errorMsg,
        });
      }
    }

    // サマリー計算
    const summary = {
      totalCompanies: companies.length,
      successCount: results.filter((r) => r.success).length,
      errorCount: results.filter((r) => !r.success).length,
      totalFetched: results.reduce((sum, r) => sum + (r.result?.totalFetched || 0), 0),
      totalImported: results.reduce((sum, r) => sum + (r.result?.importedCount || 0), 0),
    };

    console.log("\n[Scheduler] 完了:", summary);

    return NextResponse.json({
      success: true,
      message: `${summary.successCount}/${summary.totalCompanies}社の処理が完了しました`,
      summary,
      results,
      dryRun,
    });
  } catch (error) {
    console.error("[Scheduler] エラー:", error);
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
 * スケジューラー設定の確認
 */
export async function GET() {
  const nightCheck = isJapanNightTime();
  const now = new Date();
  const japanTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  return NextResponse.json({
    success: true,
    currentTime: {
      utc: now.toISOString(),
      japanTime: japanTime.toISOString().replace("Z", "+09:00"),
      japanHour: nightCheck.japanHour,
      isNightTime: nightCheck.isNight,
      canExecute: !nightCheck.isNight,
      nextAllowedTime: nightCheck.isNight ? nightCheck.nextAllowedTime : "現在実行可能",
    },
    config: {
      jsNextConfigured: isJsNextConfigured(),
      supabaseConfigured: isSupabaseConfigured(),
      cronSecretConfigured: !!process.env.CRON_SECRET,
    },
    timeRestriction: {
      description: "日本時間 22:00〜7:00 は実行しない（Slack通知回避）",
      allowedHours: "7:00〜21:59 JST",
      forceRun: "body に forceRun: true を指定で強制実行可能",
    },
    usage: {
      endpoint: "/api/v2/connector/scheduler",
      method: "POST",
      headers: {
        Authorization: "Bearer {CRON_SECRET}（設定されている場合）",
      },
      body: {
        companyIds: "処理する企業ID配列（オプション、省略で全企業）",
        dryRun: "trueでDB投入をスキップ",
        limit: "0次判定の上限件数",
        forceRun: "trueで深夜帯でも強制実行",
      },
    },
    vercelCron: {
      configExample: {
        crons: [
          {
            path: "/api/v2/connector/scheduler",
            schedule: "0 22 * * *", // UTC 22:00 = JST 7:00（毎朝7時）
          },
          {
            path: "/api/v2/connector/scheduler",
            schedule: "0 3 * * *", // UTC 3:00 = JST 12:00（昼12時）
          },
        ],
      },
      note: "UTCで指定。JST = UTC + 9時間",
    },
  });
}
