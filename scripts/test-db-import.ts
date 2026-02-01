/**
 * DBインポートテスト
 * AIキーワード生成 → JS-NEXTフェッチ → 0次判定 → 1次判定 → DBインポート
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
import { runPipeline } from "../app/lib/connector/pipeline";
import { ServiceKeywordConfig } from "../app/lib/connector/types";
import { isGoogleDriveConfigured } from "../app/lib/google-drive";
import { isSupabaseConfigured } from "../app/lib/supabase";

// テスト用サービス
const testService: ServiceInfo = {
  id: "test_aican",
  name: "AiCAN",
  description: "AIを活用した児童虐待対応支援システム",
  features: "リスクアセスメント、ケース管理、情報共有、早期発見支援",
  targetProblems: "児童虐待の早期発見、児童相談所の業務負担軽減、見落とし防止",
};

// テスト用企業ID（C005 = AiCAN）
const TEST_COMPANY_ID = "C005";

// 直近N月の日付範囲
function getDateRange(monthsBack: number): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0];
  const start = new Date(now);
  start.setMonth(start.getMonth() - monthsBack);
  return { startDate: start.toISOString().split("T")[0], endDate: end };
}

async function testDBImport() {
  console.log("=== DBインポートテスト ===\n");

  // 環境チェック
  console.log("--- 環境チェック ---");
  console.log(`OpenAI API: ${process.env.OPENAI_API_KEY ? "✓" : "✗"}`);
  console.log(`JS-NEXT: ${isJsNextConfigured() ? "✓" : "✗"}`);
  console.log(`Google Drive: ${isGoogleDriveConfigured() ? "✓" : "✗ (1次判定スキップ)"}`);
  console.log(`Supabase: ${isSupabaseConfigured() ? "✓" : "✗"}`);

  if (!process.env.OPENAI_API_KEY || !isJsNextConfigured()) {
    console.error("\n❌ 必須の環境変数が設定されていません");
    process.exit(1);
  }

  // Step 1: AIキーワード生成
  console.log("\n--- Step 1: AIキーワード生成 ---");
  const keywords = await generateKeywordsForService(testService);
  console.log(`✓ must: ${keywords.must.join(", ")}`);
  console.log(`✓ should: ${keywords.should.length}件`);

  // Step 2: JS-NEXTからフェッチ
  console.log("\n--- Step 2: JS-NEXTからフェッチ ---");
  const dateRange = getDateRange(4);
  const conditions: ExportSearchConditions = {
    keyword: keywords.searchQuery,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  };
  console.log(`期間: ${conditions.startDate} 〜 ${conditions.endDate}`);

  const config = getConnectorConfig();
  const connector = new JsNextConnector(config);
  const rows = await connector.fetchWithConditions(conditions);
  console.log(`✓ ${rows.length}件のデータを取得`);

  if (rows.length === 0) {
    console.log("検索結果が0件でした");
    return;
  }

  // Step 3-6: パイプライン実行（0次→1次→正規化→DBインポート）
  console.log("\n--- Step 3-6: パイプライン実行 ---");
  const keywordConfig: ServiceKeywordConfig = {
    serviceId: testService.id,
    serviceName: testService.name,
    must: keywords.must,
    should: keywords.should,
    not: keywords.not,
    meta: 0,
  };

  console.log(`Google Drive: ${isGoogleDriveConfigured() ? "✓" : "✗ (1次判定スキップ)"}`);
  console.log(`Supabase: ${isSupabaseConfigured() ? "✓" : "✗ (DBインポートスキップ)"}`);

  // dryRun: falseで本番インポート、trueでスキップ
  const DRY_RUN = process.env.DRY_RUN !== "false"; // デフォルトtrue

  console.log(`dryRun: ${DRY_RUN}`);

  const result = await runPipeline(rows, TEST_COMPANY_ID, keywordConfig, {
    zeroOrderLimit: 0,    // 0 = 制限なし（B評価以上を全件通過）
    firstOrderLimit: 100, // 1次判定前の足切り上限
    dryRun: DRY_RUN,
  });

  // サマリー
  console.log("\n\n=== テスト結果サマリー ===");
  console.log(`取得件数: ${rows.length}`);
  console.log(`0次判定通過: ${result.zeroOrderPassed}`);
  console.log(`1次判定処理: ${result.firstOrderProcessed}`);
  console.log(`インポート: ${result.importedCount}件（dryRun）`);
  if (result.errors.length > 0) {
    console.log(`エラー: ${result.errors.join(", ")}`);
  }
  console.log("\n✅ パイプラインテスト完了（dryRunモード）");
}

testDBImport().catch(console.error);
