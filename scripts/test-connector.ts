/**
 * JS-NEXTコネクタのテストスクリプト
 *
 * 使用方法:
 * JS_NEXT_EMAIL=xxx JS_NEXT_PASSWORD=xxx npx tsx scripts/test-connector.ts
 */

import { JsNextConnector, getConnectorConfig, isJsNextConfigured } from "../app/lib/connector";

async function testConnector() {
  console.log("=== JS-NEXTコネクタ テスト ===\n");

  // 設定確認
  if (!isJsNextConfigured()) {
    console.error("❌ 環境変数が設定されていません");
    console.log("以下を設定してください:");
    console.log("  JS_NEXT_EMAIL=your_email");
    console.log("  JS_NEXT_PASSWORD=your_password");
    console.log("\n実行例:");
    console.log("  JS_NEXT_EMAIL=xxx JS_NEXT_PASSWORD=xxx npx tsx scripts/test-connector.ts");
    process.exit(1);
  }

  console.log("✓ 環境変数が設定されています");

  const config = getConnectorConfig();
  console.log(`  URL: ${config.jsNextUrl}`);
  console.log(`  Email: ${config.username}`);
  console.log(`  Download Dir: ${config.downloadDir}\n`);

  const connector = new JsNextConnector(config);

  try {
    // Step 1: ログインテスト
    console.log("--- Step 1: ログインテスト ---");
    await connector.login();
    console.log("✓ ログイン成功\n");

    // Step 2: エクスポートモーダルを開く
    console.log("--- Step 2: エクスポートモーダル ---");
    await connector.openExportModal();
    console.log("✓ エクスポートモーダルが開きました\n");

    // Step 3: 最新のエクスポートをダウンロード
    console.log("--- Step 3: CSVダウンロード ---");
    const download = await connector.downloadExistingExport(0);
    const csvPath = await connector.saveDownload(download);
    console.log(`✓ ダウンロード完了: ${csvPath}\n`);

    // Step 4: CSVパース
    console.log("--- Step 4: CSVパース ---");
    const rows = connector.parseDownloadedCSV(csvPath);
    console.log(`✓ ${rows.length}件のデータをパース\n`);

    // サンプルデータ表示
    if (rows.length > 0) {
      console.log("--- サンプルデータ (最初の1件) ---");
      const sample = rows[0];
      console.log(`  group_id: ${sample.group_id}`);
      console.log(`  prefecture: ${sample.prefecture}`);
      console.log(`  city: ${sample.city}`);
      console.log(`  title: ${sample.title?.substring(0, 50)}...`);
      console.log(`  council_date: ${sample.council_date}`);
    }

    console.log("\n✅ テスト完了: 全てのステップが成功しました");

  } catch (error) {
    console.error("\n❌ テスト失敗:", error);
    process.exit(1);
  } finally {
    await connector.close();
  }
}

// 実行
testConnector();
