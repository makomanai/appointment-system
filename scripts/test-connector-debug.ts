/**
 * JS-NEXTコネクタ デバッグ用テストスクリプト
 * スクリーンショットを取得して問題を特定
 */

import { chromium } from "playwright";
import * as fs from "fs";

const JS_NEXT_LOGIN_URL = "https://js-next.com/auth/login";
const SCREENSHOT_DIR = "/tmp/connector-debug";

async function debugTest() {
  console.log("=== JS-NEXTコネクタ デバッグテスト ===\n");

  const email = process.env.JS_NEXT_EMAIL;
  const password = process.env.JS_NEXT_PASSWORD;

  if (!email || !password) {
    console.error("❌ 環境変数が設定されていません");
    process.exit(1);
  }

  // スクリーンショット保存先を作成
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log(`Email: ${email}`);
  console.log(`スクリーンショット保存先: ${SCREENSHOT_DIR}\n`);

  const browser = await chromium.launch({
    headless: false, // デバッグ時はブラウザを表示
  });

  const context = await browser.newContext({
    acceptDownloads: true,
  });

  const page = await context.newPage();

  try {
    // Step 1: ログインページにアクセス
    console.log("--- Step 1: ログインページにアクセス ---");
    await page.goto(JS_NEXT_LOGIN_URL);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01_login_page.png` });
    console.log("✓ スクリーンショット: 01_login_page.png\n");

    // Step 2: フォーム要素を確認
    console.log("--- Step 2: フォーム要素を確認 ---");
    const emailInputs = await page.$$("input");
    console.log(`  input要素数: ${emailInputs.length}`);

    for (let i = 0; i < emailInputs.length; i++) {
      const input = emailInputs[i];
      const type = await input.getAttribute("type");
      const name = await input.getAttribute("name");
      const placeholder = await input.getAttribute("placeholder");
      console.log(`  [${i}] type="${type}", name="${name}", placeholder="${placeholder}"`);
    }

    // Step 3: メールアドレスを入力
    console.log("\n--- Step 3: メールアドレスを入力 ---");
    const emailSelector = 'input[type="email"], input[name="email"], input[placeholder*="メール"]';
    const emailInput = await page.$(emailSelector);
    if (emailInput) {
      await emailInput.fill(email);
      console.log("✓ メールアドレス入力完了");
    } else {
      console.log("❌ メールアドレス入力欄が見つかりません");
      // 最初のinputに入力してみる
      const firstInput = await page.$("input:first-of-type");
      if (firstInput) {
        await firstInput.fill(email);
        console.log("  → 最初のinputに入力しました");
      }
    }

    // Step 4: パスワードを入力
    console.log("\n--- Step 4: パスワードを入力 ---");
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      await passwordInput.fill(password);
      console.log("✓ パスワード入力完了");
    } else {
      console.log("❌ パスワード入力欄が見つかりません");
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/02_form_filled.png` });
    console.log("✓ スクリーンショット: 02_form_filled.png\n");

    // Step 5: ログインボタンを探す
    console.log("--- Step 5: ログインボタンを探す ---");
    const buttons = await page.$$("button");
    console.log(`  button要素数: ${buttons.length}`);

    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const text = await btn.textContent();
      const type = await btn.getAttribute("type");
      console.log(`  [${i}] type="${type}", text="${text?.trim()}"`);
    }

    // Step 6: ログインボタンをクリック
    console.log("\n--- Step 6: ログインボタンをクリック ---");
    const loginButton = await page.$('button:has-text("ログイン")');
    if (loginButton) {
      await loginButton.click();
      console.log("✓ ログインボタンをクリック");
    } else {
      console.log("❌ ログインボタンが見つかりません");
      // submit buttonを探す
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        console.log("  → submit buttonをクリックしました");
      }
    }

    // Step 7: 遷移を待機
    console.log("\n--- Step 7: ページ遷移を待機 ---");
    await page.waitForTimeout(5000); // 5秒待機

    const currentUrl = page.url();
    console.log(`  現在のURL: ${currentUrl}`);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/03_after_login.png` });
    console.log("✓ スクリーンショット: 03_after_login.png\n");

    // エラーメッセージがあるか確認
    const errorMessage = await page.$('[class*="error"], [class*="alert"], [role="alert"]');
    if (errorMessage) {
      const errorText = await errorMessage.textContent();
      console.log(`⚠️ エラーメッセージ: ${errorText}`);
    }

    // Step 8: ダッシュボードか確認
    if (currentUrl.includes("management-console") || currentUrl.includes("dashboard")) {
      console.log("✅ ログイン成功！ダッシュボードに遷移しました");
    } else {
      console.log("⚠️ ダッシュボードに遷移していません");
      console.log("  手動でブラウザを確認してください（10秒後に終了）");
      await page.waitForTimeout(10000);
    }

    console.log(`\n📁 スクリーンショットを確認: open ${SCREENSHOT_DIR}`);

  } catch (error) {
    console.error("\n❌ エラー:", error);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/error.png` });
    console.log("✓ エラー時スクリーンショット: error.png");
  } finally {
    await browser.close();
  }
}

// 実行
debugTest();
