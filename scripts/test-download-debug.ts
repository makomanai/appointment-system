/**
 * ダウンロードテスト（デバッグ版）
 */

import { chromium } from "playwright";
import * as fs from "fs";

const JS_NEXT_LOGIN_URL = "https://js-next.com/auth/login";
const JS_NEXT_DASHBOARD_URL = "https://js-next.com/management-console/dashboard";
const SCREENSHOT_DIR = "/tmp/connector-debug";

async function testDownloadDebug() {
  console.log("=== ダウンロードテスト（デバッグ版） ===\n");

  const email = process.env.JS_NEXT_EMAIL;
  const password = process.env.JS_NEXT_PASSWORD;

  if (!email || !password) {
    console.error("❌ 環境変数が設定されていません");
    process.exit(1);
  }

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    // ログイン
    console.log("--- ログイン ---");
    await page.goto(JS_NEXT_LOGIN_URL);
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button:has-text("ログイン")');
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    console.log("✓ ログイン完了\n");

    // ダッシュボードに移動
    console.log("--- ダッシュボードに移動 ---");
    await page.goto(JS_NEXT_DASHBOARD_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/10_dashboard.png` });
    console.log(`✓ スクリーンショット保存: 10_dashboard.png`);
    console.log(`  URL: ${page.url()}\n`);

    // ページの全ボタンを確認
    console.log("--- ボタン一覧 ---");
    const buttons = await page.$$("button");
    console.log(`  ボタン数: ${buttons.length}`);
    for (const btn of buttons) {
      const text = await btn.textContent();
      const className = await btn.getAttribute("class");
      if (text && text.trim()) {
        console.log(`    - "${text.trim()}" (class: ${className?.substring(0, 50) || "none"})`);
      }
    }

    // ダウンロードボタンを様々なセレクタで探す
    console.log("\n--- ダウンロードボタンを探す ---");

    const selectors = [
      'button:has-text("ダウンロード")',
      'a:has-text("ダウンロード")',
      '[class*="download"]',
      'button[class*="green"]',
      'button[class*="success"]',
      'td button',
      'tr button',
    ];

    for (const selector of selectors) {
      const elements = await page.$$(selector);
      console.log(`  ${selector}: ${elements.length}件`);
    }

    // テーブル構造を確認
    console.log("\n--- テーブル確認 ---");
    const tables = await page.$$("table");
    console.log(`  table要素数: ${tables.length}`);

    const trs = await page.$$("tr");
    console.log(`  tr要素数: ${trs.length}`);

    // スクロールしてみる
    console.log("\n--- スクロールして再確認 ---");
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(1000);

    const downloadBtns2 = await page.$$('button:has-text("ダウンロード")');
    console.log(`  スクロール後のダウンロードボタン数: ${downloadBtns2.length}`);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/11_scrolled.png` });
    console.log(`✓ スクリーンショット: 11_scrolled.png`);

    // HTMLを取得して確認
    console.log("\n--- 最近のエクスポート履歴セクションを探す ---");
    const exportHistorySection = await page.$('text=最近のエクスポート履歴');
    if (exportHistorySection) {
      console.log("  ✓ 「最近のエクスポート履歴」セクション発見");

      // このセクションの親要素を取得
      const parent = await exportHistorySection.evaluateHandle((el) => el.parentElement?.parentElement);
      if (parent) {
        const html = await parent.evaluate((el) => el?.innerHTML?.substring(0, 1000));
        console.log(`  HTML抜粋: ${html?.substring(0, 500)}...`);
      }
    } else {
      console.log("  ❌ 「最近のエクスポート履歴」が見つかりません");
    }

    console.log(`\n📁 open ${SCREENSHOT_DIR}`);
    console.log("\n30秒後に終了...");
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error("\n❌ エラー:", error);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/error.png` });
  } finally {
    await browser.close();
  }
}

testDownloadDebug();
