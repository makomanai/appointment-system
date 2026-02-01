/**
 * 新規エクスポート作成テスト
 * キーワードを指定して検索→エクスポート→ダウンロード
 */

import { chromium } from "playwright";
import * as fs from "fs";

const JS_NEXT_LOGIN_URL = "https://js-next.com/auth/login";
const JS_NEXT_DASHBOARD_URL = "https://js-next.com/management-console/dashboard";
const SCREENSHOT_DIR = "/tmp/connector-debug";

async function testNewExport() {
  console.log("=== 新規エクスポート作成テスト ===\n");

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

    // Step 2: ダッシュボードに移動
    console.log("--- Step 2: ダッシュボードに移動 ---");
    await page.goto(JS_NEXT_DASHBOARD_URL);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    console.log("✓ ダッシュボード表示\n");

    // Step 3: 答弁エクスポートボタンをクリック
    console.log("--- Step 3: 答弁エクスポートモーダルを開く ---");
    const exportBtn = await page.$('button:has-text("答弁エクスポート")');
    if (!exportBtn) {
      throw new Error("答弁エクスポートボタンが見つかりません");
    }
    await exportBtn.click();

    // モーダルが完全に読み込まれるまで待機
    console.log("  モーダルの読み込みを待機中...");
    await page.waitForTimeout(3000);

    // 「基本検索条件」または「キーワード」テキストが表示されるまで待機
    try {
      await page.waitForSelector('text=基本検索条件', { timeout: 10000 });
      console.log("  ✓ 「基本検索条件」を検出");
    } catch {
      console.log("  「基本検索条件」が見つかりません、続行します");
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/20_export_modal.png` });
    console.log("✓ モーダル表示 (20_export_modal.png)\n");

    // Step 4: モーダル内の要素を確認
    console.log("--- Step 4: モーダル内の要素を確認 ---");

    // モーダル内のすべてのinput要素
    const allInputs = await page.$$("input");
    console.log(`  全input要素数: ${allInputs.length}`);

    for (let i = 0; i < allInputs.length; i++) {
      const input = allInputs[i];
      const type = await input.getAttribute("type");
      const placeholder = await input.getAttribute("placeholder");
      const className = await input.getAttribute("class");
      console.log(`  [${i}] type="${type}", placeholder="${placeholder}", class="${className?.substring(0, 30)}..."`);
    }

    // モーダル内のselect要素
    const allSelects = await page.$$("select");
    console.log(`\n  全select要素数: ${allSelects.length}`);

    // divでinputのように見えるカスタムコンポーネント
    const customInputs = await page.$$('[role="textbox"], [contenteditable="true"]');
    console.log(`  カスタムinput要素数: ${customInputs.length}`);

    // モーダル内のボタン
    const modalButtons = await page.$$('.ManagementDashboard_modalOverlay__8iP96 button, [class*="modal"] button, [class*="Modal"] button');
    console.log(`\n  モーダル内のボタン数: ${modalButtons.length}`);

    // すべてのボタンテキスト
    const allButtons = await page.$$("button");
    console.log(`  全ボタン数: ${allButtons.length}`);
    for (const btn of allButtons) {
      const text = await btn.textContent();
      const isVisible = await btn.isVisible();
      if (text && text.trim() && isVisible) {
        console.log(`    - "${text.trim()}" (visible: ${isVisible})`);
      }
    }

    // Step 5: キーワード入力欄を探す（様々な方法）
    console.log("\n--- Step 5: キーワード入力を試みる ---");
    const keyword = "児童福祉";

    // 方法1: placeholder
    let keywordInput = await page.$('input[placeholder*="キーワード"]');
    if (keywordInput) {
      await keywordInput.fill(keyword);
      console.log(`✓ placeholder検索でキーワード入力: "${keyword}"`);
    }

    // 方法2: type=text
    if (!keywordInput) {
      const textInputs = await page.$$('input[type="text"]');
      console.log(`  type="text" input数: ${textInputs.length}`);
      if (textInputs.length > 0) {
        await textInputs[0].fill(keyword);
        console.log(`✓ text inputにキーワード入力: "${keyword}"`);
        keywordInput = textInputs[0];
      }
    }

    // 方法3: ラベル「キーワード」の近くの入力欄
    if (!keywordInput) {
      const keywordLabel = await page.$('text=キーワード');
      if (keywordLabel) {
        // 親要素を取得してその中のinputを探す
        const parent = await keywordLabel.evaluateHandle(el => el.parentElement);
        const nearbyInput = await parent.$('input');
        if (nearbyInput) {
          await nearbyInput.fill(keyword);
          console.log(`✓ ラベル近くのinputにキーワード入力: "${keyword}"`);
          keywordInput = nearbyInput;
        }
      }
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/21_keyword_filled.png` });
    console.log("✓ スクリーンショット (21_keyword_filled.png)\n");

    // Step 6: モーダル内のエクスポートボタンを探す
    console.log("--- Step 6: モーダル内のエクスポートボタンを探す ---");

    // モーダル内に絞ってボタンを探す
    // まずモーダルオーバーレイ内のボタンを探す
    const modalOverlay = await page.$('[class*="modalOverlay"], [class*="Modal"]');
    if (modalOverlay) {
      console.log("  モーダルオーバーレイを発見");
      const modalBtns = await modalOverlay.$$("button");
      console.log(`  モーダル内ボタン数: ${modalBtns.length}`);

      for (const btn of modalBtns) {
        const text = await btn.textContent();
        if (text && text.trim()) {
          console.log(`    - "${text.trim()}"`);
        }
      }
    }

    // エクスポート実行ボタンを探す
    const executeSelectors = [
      '[class*="modal"] button:has-text("エクスポート")',
      '[class*="Modal"] button:has-text("エクスポート")',
      'button:has-text("エクスポート実行")',
      'button:has-text("実行")',
      '[class*="modal"] button[type="submit"]',
    ];

    let executeBtn = null;
    for (const selector of executeSelectors) {
      try {
        executeBtn = await page.$(selector);
        if (executeBtn) {
          const btnText = await executeBtn.textContent();
          console.log(`\n✓ 実行ボタン発見: "${btnText?.trim()}" (${selector})`);
          break;
        }
      } catch {
        // continue
      }
    }

    if (!executeBtn) {
      // ページ全体から「実行」「作成」などのボタンを探す
      const possibleBtns = await page.$$('button');
      for (const btn of possibleBtns) {
        const text = await btn.textContent();
        const isVisible = await btn.isVisible();
        if (isVisible && text && (text.includes("実行") || text.includes("作成") || text.includes("開始"))) {
          executeBtn = btn;
          console.log(`\n✓ 実行ボタン候補発見: "${text.trim()}"`);
          break;
        }
      }
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/22_before_execute.png` });
    console.log("✓ スクリーンショット (22_before_execute.png)\n");

    if (!executeBtn) {
      console.log("❌ 実行ボタンが見つかりません");
      console.log("\n手動でブラウザを確認してください（60秒後に終了）");
      await page.waitForTimeout(60000);
      return;
    }

    // Step 7: エクスポートを実行
    console.log("\n--- Step 7: エクスポートを実行 ---");
    await executeBtn.click();
    console.log("✓ 実行ボタンをクリック");

    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/23_after_execute.png` });
    console.log("✓ スクリーンショット (23_after_execute.png)\n");

    console.log(`📁 open ${SCREENSHOT_DIR}`);
    console.log("\n60秒後に終了...");
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error("\n❌ エラー:", error);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/error_export.png` });
    console.log("エラー時スクリーンショット: error_export.png");
    console.log("\n30秒後に終了...");
    await page.waitForTimeout(30000);
  } finally {
    await browser.close();
  }
}

testNewExport();
