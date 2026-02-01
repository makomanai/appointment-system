/**
 * AIキーワード生成テスト
 * サービス情報からキーワードを自動生成
 */

import { generateKeywordsForService, ServiceInfo } from "../app/lib/connector/keyword-generator";

// テスト用サービス情報
const testServices: ServiceInfo[] = [
  {
    id: "test_aican",
    name: "AiCAN",
    description: "AIを活用した児童虐待対応支援システム",
    features: "リスクアセスメント、ケース管理、情報共有、早期発見支援",
    targetProblems: "児童虐待の早期発見、児童相談所の業務負担軽減、見落とし防止",
  },
  {
    id: "test_welfare",
    name: "介護支援システム",
    description: "高齢者向け介護サービスのマッチングと管理システム",
    features: "ケアプラン作成、事業者マッチング、請求管理",
    targetProblems: "介護人材不足、サービス品質向上、業務効率化",
  },
  {
    id: "test_disaster",
    name: "防災情報システム",
    description: "自治体向け災害対応・避難支援システム",
    features: "避難所管理、安否確認、情報発信、被害状況把握",
    targetProblems: "災害時の迅速な対応、住民への情報伝達、避難所運営",
  },
];

async function testKeywordGenerator() {
  console.log("=== AIキーワード生成テスト ===\n");

  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY が設定されていません");
    console.log("  export OPENAI_API_KEY=sk-xxx を実行してください");
    process.exit(1);
  }

  for (const service of testServices) {
    console.log(`\n--- ${service.name} ---`);
    console.log(`説明: ${service.description}`);
    console.log(`課題: ${service.targetProblems}\n`);

    try {
      const keywords = await generateKeywordsForService(service);

      console.log("✓ キーワード生成成功");
      console.log(`\nmust (必須): ${keywords.must.length}件`);
      keywords.must.forEach((k, i) => console.log(`  ${i + 1}. ${k}`));

      console.log(`\nshould (推奨): ${keywords.should.length}件`);
      keywords.should.slice(0, 10).forEach((k, i) => console.log(`  ${i + 1}. ${k}`));
      if (keywords.should.length > 10) {
        console.log(`  ... 他 ${keywords.should.length - 10}件`);
      }

      console.log(`\nnot (除外): ${keywords.not.length}件`);
      keywords.not.forEach((k, i) => console.log(`  ${i + 1}. ${k}`));

      console.log(`\n検索クエリ: "${keywords.searchQuery}"`);

    } catch (error) {
      console.error("❌ エラー:", error);
    }

    // レート制限対策
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\n\n=== テスト完了 ===");
}

testKeywordGenerator();
