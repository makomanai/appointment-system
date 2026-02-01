/**
 * フルパイプラインテスト
 * AIキーワード生成 → JS-NEXTフェッチ → 0次判定 → 結果表示
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { generateKeywordsForService, ServiceInfo } from "../app/lib/connector/keyword-generator";
import {
  JsNextConnector,
  getConnectorConfig,
  isJsNextConfigured,
  ExportSearchConditions,
} from "../app/lib/connector";
import { runZeroOrderFilter } from "../app/lib/connector/zero-order-filter";
import { ServiceKeywordConfig } from "../app/lib/connector/types";

// 日本時間チェック
function checkJapanTime(): { isNight: boolean; hour: number } {
  const now = new Date();
  const japanTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hour = japanTime.getUTCHours();
  return { isNight: hour >= 22 || hour < 7, hour };
}

// 直近N月の日付範囲
function getDateRange(monthsBack: number): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0];
  const start = new Date(now);
  start.setMonth(start.getMonth() - monthsBack);
  return { startDate: start.toISOString().split("T")[0], endDate: end };
}

// テスト用サービス
const testService: ServiceInfo = {
  id: "test_aican",
  name: "AiCAN",
  description: "AIを活用した児童虐待対応支援システム",
  features: "リスクアセスメント、ケース管理、情報共有、早期発見支援",
  targetProblems: "児童虐待の早期発見、児童相談所の業務負担軽減、見落とし防止",
};

async function testFullPipeline() {
  console.log("=== フルパイプラインテスト ===\n");

  // 環境チェック
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY が設定されていません");
    process.exit(1);
  }

  if (!isJsNextConfigured()) {
    console.error("❌ JS-NEXT認証情報が設定されていません");
    console.log("  JS_NEXT_EMAIL, JS_NEXT_PASSWORD を設定してください");
    process.exit(1);
  }

  // 時間帯チェック
  const timeCheck = checkJapanTime();
  console.log(`現在の日本時間: ${timeCheck.hour}:00`);

  if (timeCheck.isNight) {
    console.log("⚠️  深夜帯（22:00〜7:00）です。Slack通知が発生する可能性があります。");
    console.log("   続行しますか？ (5秒後に開始、Ctrl+Cでキャンセル)\n");
    await new Promise((r) => setTimeout(r, 5000));
  }

  // Step 1: AIキーワード生成
  console.log("--- Step 1: AIキーワード生成 ---");
  const keywords = await generateKeywordsForService(testService);
  console.log(`✓ must: ${keywords.must.join(", ")}`);
  console.log(`✓ should: ${keywords.should.length}件`);
  console.log(`✓ 検索クエリ: "${keywords.searchQuery}"\n`);

  // Step 2: 検索条件構築
  console.log("--- Step 2: 検索条件構築 ---");
  const dateRange = getDateRange(4); // 直近4ヶ月
  const conditions: ExportSearchConditions = {
    keyword: keywords.searchQuery,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  };
  console.log(`✓ 期間: ${conditions.startDate} 〜 ${conditions.endDate}`);
  console.log(`✓ キーワード: ${conditions.keyword}\n`);

  // Step 3: JS-NEXTからフェッチ
  console.log("--- Step 3: JS-NEXTからフェッチ ---");
  const config = getConnectorConfig();
  const connector = new JsNextConnector(config);

  let rows;
  try {
    rows = await connector.fetchWithConditions(conditions);
    console.log(`✓ ${rows.length}件のデータを取得\n`);
  } catch (error) {
    console.error("❌ フェッチエラー:", error);
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log("検索結果が0件でした");
    return;
  }

  // Step 4: 0次判定
  console.log("--- Step 4: 0次判定 ---");
  const keywordConfig: ServiceKeywordConfig = {
    serviceId: testService.id,
    serviceName: testService.name,
    must: keywords.must,
    should: keywords.should,
    not: keywords.not,
    meta: 0,
  };

  const zeroOrderResults = runZeroOrderFilter(rows, keywordConfig, 50);
  const passedCount = zeroOrderResults.filter((r) => r.passed).length;

  console.log(`✓ 取得件数: ${rows.length}`);
  console.log(`✓ 0次判定通過: ${passedCount}件`);
  console.log(`✓ 通過率: ${((passedCount / rows.length) * 100).toFixed(1)}%\n`);

  // Step 5: 上位5件を表示
  console.log("--- 上位5件のサンプル ---");
  zeroOrderResults.slice(0, 5).forEach((r, i) => {
    console.log(`\n[${i + 1}] スコア: ${r.score} (must: ${r.mustCount}, should: ${r.shouldCount})`);
    console.log(`   ${r.row.prefecture} ${r.row.city}`);
    console.log(`   ${r.row.council_date}`);
    console.log(`   ${r.row.title?.substring(0, 60)}...`);
    console.log(`   passed: ${r.passed}`);
  });

  console.log("\n\n=== テスト完了 ===");
}

testFullPipeline().catch(console.error);
