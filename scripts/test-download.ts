/**
 * 既存エクスポートのダウンロードテスト
 */

import { JsNextConnector, getConnectorConfig, isJsNextConfigured } from "../app/lib/connector";

async function testDownload() {
  console.log("=== 既存エクスポート ダウンロードテスト ===\n");

  if (!isJsNextConfigured()) {
    console.error("❌ 環境変数が設定されていません");
    process.exit(1);
  }

  const config = getConnectorConfig();
  const connector = new JsNextConnector(config);

  try {
    // ログイン
    console.log("--- Step 1: ログイン ---");
    await connector.login();
    console.log("✓ ログイン完了\n");

    // ダッシュボードに移動
    console.log("--- Step 2: ダッシュボードに移動 ---");
    await connector.goToDashboard();
    console.log("✓ ダッシュボード表示\n");

    // 最新のエクスポートをダウンロード
    console.log("--- Step 3: CSVダウンロード ---");
    const download = await connector.downloadExistingExport(0);
    const csvPath = await connector.saveDownload(download);
    console.log(`✓ ダウンロード完了: ${csvPath}\n`);

    // CSVパース
    console.log("--- Step 4: CSVパース ---");
    const rows = connector.parseDownloadedCSV(csvPath);
    console.log(`✓ ${rows.length}件のデータをパース\n`);

    // サンプル表示
    if (rows.length > 0) {
      console.log("--- サンプルデータ (最初の3件) ---");
      for (let i = 0; i < Math.min(3, rows.length); i++) {
        const row = rows[i];
        console.log(`\n[${i + 1}]`);
        console.log(`  group_id: ${row.group_id || "(なし)"}`);
        console.log(`  prefecture: ${row.prefecture}`);
        console.log(`  city: ${row.city}`);
        console.log(`  title: ${row.title?.substring(0, 40)}...`);
        console.log(`  council_date: ${row.council_date}`);
      }
    }

    console.log("\n\n✅ テスト成功！");

  } catch (error) {
    console.error("\n❌ テスト失敗:", error);
    process.exit(1);
  } finally {
    await connector.close();
  }
}

testDownload();
