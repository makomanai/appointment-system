/**
 * JS-NEXT検索フローのテスト
 * 実際の検索画面でキーワード検索→結果確認→エクスポート
 */

import { chromium } from "playwright";
import * as fs from "fs";

const JS_NEXT_LOGIN_URL = "https://js-next.com/auth/login";
const SCREENSHOT_DIR = "/tmp/connector-debug";

async function testSearchFlow() {
  console.log("=== JS-NEXT 検索フローテスト ===\n");

  const email = process.env.JS_NEXT_EMAIL;
  const password = process.env.JS_NEXT_PASSWORD;

  if (!email || !password) {
    console.error("❌ 環境変数が設定されていません");
    process.exit(1);
  }

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: false, // ブラウザを表示
  });

  const context = await browser.newContext({
    acceptDownloads: true,
  });

  const page = await context.newPage();

  try {
    // Step 1: ログイン
    console.log("--- Step 1: ログイン ---");
    await page.goto(JS_NEXT_LOGIN_URL);
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button:has-text("ログイン")');
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    console.log("✓ ログイン完了\n");

    // Step 2: 検索キーワードを入力
    console.log("--- Step 2: 検索キーワードを入力 ---");
    const keyword = "児童福祉"; // テスト用キーワード

    // キーワード入力欄を探す
    const keywordInput = await page.$('input[placeholder*="キーワード"], input[name="keyword"]');
    if (keywordInput) {
      await keywordInput.fill(keyword);
      console.log(`✓ キーワード入力: "${keyword}"`);
    } else {
      // 別のセレクタを試す
      const inputs = await page.$$("input");
      console.log(`  input要素数: ${inputs.length}`);
      for (const input of inputs) {
        const placeholder = await input.getAttribute("placeholder");
        if (placeholder && placeholder.includes("キーワード")) {
          await input.fill(keyword);
          console.log(`✓ キーワード入力 (placeholder検出): "${keyword}"`);
          break;
        }
      }
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/04_keyword_entered.png` });
    console.log("✓ スクリーンショット: 04_keyword_entered.png\n");

    // Step 3: 検索ボタンをクリック
    console.log("--- Step 3: 検索実行 ---");
    const searchButton = await page.$('button:has-text("検索する")');
    if (searchButton) {
      await searchButton.click();
      console.log("✓ 検索ボタンをクリック");
    } else {
      console.log("❌ 検索ボタンが見つかりません");
      const buttons = await page.$$("button");
      for (const btn of buttons) {
        const text = await btn.textContent();
        console.log(`  button: "${text?.trim()}"`);
      }
    }

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/05_search_results.png` });
    console.log("✓ スクリーンショット: 05_search_results.png\n");

    // Step 4: 検索結果の確認
    console.log("--- Step 4: 検索結果の確認 ---");
    const currentUrl = page.url();
    console.log(`  現在のURL: ${currentUrl}`);

    // 結果件数を探す
    const resultCount = await page.$('text=/[0-9]+件/');
    if (resultCount) {
      const countText = await resultCount.textContent();
      console.log(`  検索結果: ${countText}`);
    }

    // Step 5: エクスポートボタンを探す
    console.log("\n--- Step 5: エクスポートボタンを探す ---");
    const exportButtons = await page.$$('button:has-text("エクスポート"), button:has-text("ダウンロード"), button:has-text("CSV")');
    console.log(`  エクスポート関連ボタン数: ${exportButtons.length}`);

    const allButtons = await page.$$("button");
    console.log(`  全ボタン一覧:`);
    for (const btn of allButtons) {
      const text = await btn.textContent();
      if (text && text.trim()) {
        console.log(`    - "${text.trim()}"`);
      }
    }

    // リンクも確認
    const exportLinks = await page.$$('a:has-text("エクスポート"), a:has-text("ダウンロード"), a:has-text("CSV")');
    console.log(`  エクスポート関連リンク数: ${exportLinks.length}`);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/06_looking_for_export.png` });
    console.log("✓ スクリーンショット: 06_looking_for_export.png\n");

    // Step 6: 管理コンソールにアクセスしてみる
    console.log("--- Step 6: 管理コンソールを確認 ---");
    await page.goto("https://js-next.com/management-console/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/07_management_console.png` });
    console.log("✓ スクリーンショット: 07_management_console.png");
    console.log(`  URL: ${page.url()}\n`);

    // 答弁エクスポートボタンを探す
    const answerExportBtn = await page.$('button:has-text("答弁エクスポート"), a:has-text("答弁エクスポート")');
    if (answerExportBtn) {
      console.log("✓ 答弁エクスポートボタンを発見");
    }

    console.log(`\n📁 スクリーンショットを確認: open ${SCREENSHOT_DIR}`);
    console.log("\n手動でブラウザを確認してください（30秒後に終了）");
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error("\n❌ エラー:", error);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/error.png` });
  } finally {
    await browser.close();
  }
}

testSearchFlow();
