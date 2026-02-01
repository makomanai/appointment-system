/**
 * Aコネクタ - JS-NEXT（サービスA）への接続とCSVダウンロード
 *
 * Playwrightを使用してJS-NEXTにログインし、
 * サービス別の検索条件で「答弁エクスポート」を実行してCSVをダウンロード
 *
 * 注意: Playwrightはサーバーレス環境（Vercel）では動作しません。
 * ローカル環境またはPlaywrightがインストールされた環境でのみ使用可能です。
 */

import * as fs from "fs";
import * as path from "path";
import { ConnectorConfig, JsNextExportRow, ServiceKeywordConfig } from "./types";

// Playwright の型定義（動的インポート用）
type Browser = import("playwright").Browser;
type Page = import("playwright").Page;
type Download = import("playwright").Download;

// Playwright を動的にインポート（サーバーレス環境対応）
let playwrightModule: typeof import("playwright") | null = null;

async function getPlaywright(): Promise<typeof import("playwright")> {
  if (playwrightModule) {
    return playwrightModule;
  }

  try {
    playwrightModule = await import("playwright");
    return playwrightModule;
  } catch {
    throw new Error(
      "Playwrightがインストールされていません。" +
      "この機能はローカル環境でのみ使用可能です。" +
      "ローカルで実行するには: npm install playwright && npx playwright install chromium"
    );
  }
}

/**
 * Playwright が利用可能かチェック
 */
export function isPlaywrightAvailable(): boolean {
  try {
    require.resolve("playwright");
    return true;
  } catch {
    return false;
  }
}

// JS-NEXTのURL定数
const JS_NEXT_BASE_URL = "https://js-next.com";
const JS_NEXT_LOGIN_URL = `${JS_NEXT_BASE_URL}/auth/login`;
const JS_NEXT_DASHBOARD_URL = `${JS_NEXT_BASE_URL}/management-console/dashboard`;
const JS_NEXT_SEARCH_URL = JS_NEXT_BASE_URL; // ログイン後のメイン検索画面

// エクスポート検索条件
export interface ExportSearchConditions {
  keyword?: string;           // キーワード
  category?: string;          // カテゴリー
  stance?: string;            // 立場
  prefecture?: string;        // 都道府県
  city?: string;              // 市区町村
  questioner?: string;        // 質問者
  answerer?: string;          // 回答者
  startDate?: string;         // 開始日 (YYYY/MM/DD)
  endDate?: string;           // 終了日 (YYYY/MM/DD)
  source?: string;            // ソース
}

// CSVパース関数
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// CSVテキストを行配列に変換
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header.toLowerCase().replace(/\s+/g, "_")] = values[idx] || "";
    });
    rows.push(row);
  }

  return rows;
}

export class JsNextConnector {
  private config: ConnectorConfig;
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(config: ConnectorConfig) {
    this.config = config;
  }

  /**
   * ブラウザを起動してJS-NEXTにログイン
   */
  async login(): Promise<void> {
    console.log("[Aコネクタ] ブラウザを起動...");

    const playwright = await getPlaywright();
    this.browser = await playwright.chromium.launch({
      headless: true, // 本番ではtrue、デバッグ時はfalse
    });

    const context = await this.browser!.newContext({
      acceptDownloads: true,
    });

    this.page = await context.newPage();

    console.log("[Aコネクタ] JS-NEXTログインページにアクセス...");
    await this.page.goto(JS_NEXT_LOGIN_URL);

    // ログインフォームに入力
    // メールアドレス入力
    await this.page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="メール"]');
    await this.page.fill('input[type="email"], input[name="email"], input[placeholder*="メール"]', this.config.username);

    // パスワード入力
    await this.page.fill('input[type="password"]', this.config.password);

    // ログインボタンをクリック（オレンジのボタン）
    await this.page.click('button:has-text("ログイン")');

    // ページ遷移を待機（メイン画面またはダッシュボード）
    await this.page.waitForLoadState("networkidle");
    await this.page.waitForTimeout(2000); // 追加待機

    const currentUrl = this.page.url();
    console.log(`[Aコネクタ] 遷移先URL: ${currentUrl}`);

    // ログイン成功確認（ユーザーアイコンまたは検索画面の存在）
    const isLoggedIn = await this.page.$('[class*="user"], [class*="avatar"], :text("検索条件")');
    if (!isLoggedIn) {
      throw new Error("ログインに失敗しました");
    }

    console.log("[Aコネクタ] ログイン完了");
  }

  /**
   * 管理コンソールダッシュボードに移動
   */
  async goToDashboard(): Promise<void> {
    if (!this.page) throw new Error("ログインが必要です");

    console.log("[Aコネクタ] 管理コンソールに移動...");
    await this.page.goto(JS_NEXT_DASHBOARD_URL);
    await this.page.waitForLoadState("networkidle");
    await this.page.waitForTimeout(1000);

    // ダッシュボードにいることを確認
    const isDashboard = await this.page.$('text=管理ダッシュボード');
    if (!isDashboard) {
      throw new Error("管理コンソールダッシュボードにアクセスできません");
    }

    console.log("[Aコネクタ] 管理コンソール表示完了");
  }

  /**
   * 答弁エクスポートモーダルを開く
   */
  async openExportModal(): Promise<void> {
    if (!this.page) throw new Error("ログインが必要です");

    console.log("[Aコネクタ] 答弁エクスポートモーダルを開く...");

    // まずダッシュボードに移動
    await this.goToDashboard();

    // 「答弁エクスポート」ボタンをクリック（青いボタン）
    const exportBtn = await this.page.$('button:has-text("答弁エクスポート")');
    if (!exportBtn) {
      throw new Error("答弁エクスポートボタンが見つかりません");
    }
    await exportBtn.click();

    // モーダルが表示されるのを待機（複数のセレクタで試行）
    await this.page.waitForTimeout(2000); // モーダルのアニメーション待機

    // モーダル内のキーワード入力欄が表示されるまで待機
    try {
      await this.page.waitForSelector('input[placeholder*="キーワード"]', { timeout: 10000 });
    } catch {
      // 別のセレクタを試す
      await this.page.waitForSelector('[class*="modal"] input', { timeout: 5000 });
    }

    console.log("[Aコネクタ] エクスポートモーダルが開きました");
  }

  /**
   * 検索条件を設定してエクスポートを実行
   */
  async setSearchConditionsAndExport(conditions: ExportSearchConditions): Promise<void> {
    if (!this.page) throw new Error("ログインが必要です");

    console.log("[Aコネクタ] 検索条件を設定...", conditions);

    // キーワードを入力（placeholder="検索キーワードを入力"）
    if (conditions.keyword) {
      const keywordInput = await this.page.$('input[placeholder*="キーワード"]');
      if (keywordInput) {
        await keywordInput.fill(conditions.keyword);
        console.log(`[Aコネクタ] キーワード設定: ${conditions.keyword}`);
      } else {
        console.log("[Aコネクタ] キーワード入力欄が見つかりません");
      }
    }

    // カテゴリーを選択
    if (conditions.category && conditions.category !== "すべて") {
      await this.selectDropdown("カテゴリー", conditions.category);
    }

    // 立場を選択
    if (conditions.stance && conditions.stance !== "すべて") {
      await this.selectDropdown("立場", conditions.stance);
    }

    // 都道府県を選択
    if (conditions.prefecture && conditions.prefecture !== "すべて") {
      await this.selectDropdown("都道府県", conditions.prefecture);
    }

    // 日付条件（input type="date"）
    if (conditions.startDate) {
      const startInput = await this.page.$('input[type="date"]:first-of-type');
      if (startInput) {
        await startInput.fill(conditions.startDate);
      }
    }

    if (conditions.endDate) {
      const dateInputs = await this.page.$$('input[type="date"]');
      if (dateInputs.length >= 2) {
        await dateInputs[1].fill(conditions.endDate);
      }
    }

    // 「エクスポート開始」ボタンをクリック
    const exportBtn = await this.page.$('[class*="modal"] button:has-text("エクスポート開始"), button:has-text("エクスポート開始")');
    if (!exportBtn) {
      throw new Error("エクスポート開始ボタンが見つかりません");
    }

    await exportBtn.click();
    console.log("[Aコネクタ] エクスポートを開始しました");

    // ボタンが「エクスポート中...」に変わるのを待機
    await this.page.waitForTimeout(2000);
  }

  /**
   * エクスポート完了を待ってからCSVをダウンロード
   */
  async waitAndDownloadExport(maxWaitMs: number = 120000): Promise<Download> {
    if (!this.page) throw new Error("ログインが必要です");

    console.log("[Aコネクタ] エクスポート完了を待機中...");

    const startTime = Date.now();
    const checkInterval = 5000;

    // モーダルが閉じるまで待機
    await this.page.waitForTimeout(3000);

    while (Date.now() - startTime < maxWaitMs) {
      // ダッシュボードをリロード
      await this.page.goto(JS_NEXT_DASHBOARD_URL);
      await this.page.waitForLoadState("networkidle");
      await this.page.waitForTimeout(2000);

      // 最新のエクスポートジョブを確認
      const downloadLinks = await this.page.$$('a:has-text("ダウンロード")');

      if (downloadLinks.length > 0) {
        // 最新のダウンロードリンクをクリック
        const downloadPromise = this.page.waitForEvent("download", { timeout: 60000 });
        await downloadLinks[0].click();

        console.log("[Aコネクタ] エクスポート完了、ダウンロード開始");
        return await downloadPromise;
      }

      console.log(`[Aコネクタ] 待機中... (${Math.round((Date.now() - startTime) / 1000)}秒)`);
      await this.page.waitForTimeout(checkInterval);
    }

    throw new Error(`エクスポートがタイムアウト (${maxWaitMs / 1000}秒)`);
  }

  /**
   * ドロップダウンを選択するヘルパー
   */
  private async selectDropdown(label: string, value: string): Promise<void> {
    if (!this.page) return;

    try {
      // ラベルの近くのセレクトまたはドロップダウンを探す
      const dropdown = await this.page.$(`select:near(:text("${label}")), [role="combobox"]:near(:text("${label}"))`);
      if (dropdown) {
        await dropdown.click();
        await this.page.click(`[role="option"]:has-text("${value}"), option:has-text("${value}")`);
        console.log(`[Aコネクタ] ${label}を選択: ${value}`);
      }
    } catch (error) {
      console.log(`[Aコネクタ] ${label}の選択をスキップ`);
    }
  }

  /**
   * 既存のエクスポートジョブからCSVをダウンロード
   * （ジョブ履歴からダウンロードする場合）
   */
  async downloadExistingExport(jobIndex: number = 0): Promise<Download> {
    if (!this.page) throw new Error("ログインが必要です");

    // ダッシュボードにいることを確認
    const currentUrl = this.page.url();
    if (!currentUrl.includes("management-console")) {
      await this.goToDashboard();
    }

    console.log(`[Aコネクタ] 既存エクスポート（${jobIndex + 1}番目）をダウンロード...`);

    // エクスポート履歴テーブルのダウンロードリンクを取得
    // テーブル内の緑色の「ダウンロード」リンク（<a>タグ）
    await this.page.waitForSelector('text=最近のエクスポート履歴', { timeout: 10000 });
    await this.page.waitForTimeout(1000); // テーブル描画待機

    // ダウンロードは<a>タグで実装されている
    const downloadLinks = await this.page.$$('a:has-text("ダウンロード")');
    console.log(`[Aコネクタ] ダウンロードリンク数: ${downloadLinks.length}`);

    if (downloadLinks.length <= jobIndex) {
      throw new Error(`エクスポートジョブが見つかりません (${downloadLinks.length}件中 index: ${jobIndex})`);
    }

    // ダウンロードを待機
    const downloadPromise = this.page.waitForEvent("download", { timeout: 60000 });

    await downloadLinks[jobIndex].click();

    const download = await downloadPromise;
    console.log("[Aコネクタ] ダウンロード開始");
    return download;
  }

  /**
   * エクスポートジョブの完了を待機
   * 新規エクスポート実行後、ジョブが完了するまでポーリング
   */
  async waitForExportJobCompletion(maxWaitMs: number = 120000): Promise<void> {
    if (!this.page) throw new Error("ログインが必要です");

    console.log("[Aコネクタ] エクスポートジョブの完了を待機中...");

    const startTime = Date.now();
    const checkInterval = 5000; // 5秒ごとにチェック

    while (Date.now() - startTime < maxWaitMs) {
      // ページをリロード
      await this.page.reload();
      await this.page.waitForLoadState("networkidle");

      // 最新のジョブのステータスを確認
      const completedStatus = await this.page.$('text=完了');
      if (completedStatus) {
        console.log("[Aコネクタ] エクスポートジョブ完了");
        return;
      }

      console.log(`[Aコネクタ] 待機中... (${Math.round((Date.now() - startTime) / 1000)}秒経過)`);
      await this.page.waitForTimeout(checkInterval);
    }

    throw new Error(`エクスポートジョブがタイムアウト (${maxWaitMs / 1000}秒)`);
  }

  /**
   * ダウンロードしたファイルを保存してパスを返す
   */
  async saveDownload(download: Download): Promise<string> {
    // ダウンロードディレクトリを確保
    if (!fs.existsSync(this.config.downloadDir)) {
      fs.mkdirSync(this.config.downloadDir, { recursive: true });
    }

    const filename = download.suggestedFilename() || `export_${Date.now()}.csv`;
    const downloadPath = path.join(this.config.downloadDir, filename);

    await download.saveAs(downloadPath);

    console.log(`[Aコネクタ] CSVダウンロード完了: ${downloadPath}`);

    return downloadPath;
  }

  /**
   * CSVファイルをパースしてJsNextExportRow配列に変換
   */
  parseDownloadedCSV(filePath: string): JsNextExportRow[] {
    console.log(`[Aコネクタ] CSVをパース: ${filePath}`);

    const csvText = fs.readFileSync(filePath, "utf-8");
    const rawRows = parseCSV(csvText);

    // JsNextExportRow形式に変換（JS-NEXTのCSV列に対応）
    const rows: JsNextExportRow[] = rawRows.map((raw) => ({
      // グループID（YouTube動画ID）
      group_id: raw.グループid || raw.group_id || raw.groupid || "",
      // 地域情報
      prefecture: raw.都道府県 || raw.prefecture || "",
      city: raw.市町村 || raw.city || raw.市区町村 || "",
      // 議会情報
      council_date: raw["議会の日付"] || raw.議会日付 || raw.council_date || "",
      title: raw.議題タイトル || raw.title || raw.タイトル || "",
      summary: raw.議題概要 || raw.summary || raw.概要 || "",
      // 発言者
      questioner: raw.質問者 || raw.questioner || "",
      answerer: raw.回答者 || raw.answerer || "",
      // URL・時間
      source_url: raw.ソースurl || raw.source_url || raw.url || "",
      start_sec: parseInt(raw.開始秒数 || raw.start_sec || "0", 10),
      end_sec: parseInt(raw.終了秒数 || raw.end_sec || "0", 10),
      // メタ情報
      external_id: raw.議題id || raw.external_id || undefined,
      category: raw.カテゴリ || raw.category || undefined,
      stance: raw.立場 || raw.stance || undefined,
    }));

    console.log(`[Aコネクタ] ${rows.length}件のデータをパース`);

    return rows;
  }

  /**
   * ブラウザを閉じる
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log("[Aコネクタ] ブラウザを終了");
    }
  }

  /**
   * サービス別キーワード設定から検索条件を生成
   */
  buildSearchConditions(serviceConfig: ServiceKeywordConfig): ExportSearchConditions {
    // mustとshouldキーワードを結合（ORで検索される想定）
    const keywords = [...serviceConfig.must, ...serviceConfig.should.slice(0, 5)];

    return {
      keyword: keywords.join(" "),
      // 他の条件はデフォルト（すべて）
    };
  }

  /**
   * 一連の処理を実行（ログイン→検索→エクスポート→パース）
   */
  async fetchData(serviceConfig: ServiceKeywordConfig): Promise<JsNextExportRow[]> {
    try {
      await this.login();
      await this.openExportModal();

      const conditions = this.buildSearchConditions(serviceConfig);
      await this.setSearchConditionsAndExport(conditions);

      // エクスポート完了を待機してダウンロード
      const download = await this.waitAndDownloadExport();
      const csvPath = await this.saveDownload(download);
      const rows = this.parseDownloadedCSV(csvPath);

      // ダウンロードファイルを削除（オプション）
      // fs.unlinkSync(csvPath);

      return rows;
    } finally {
      await this.close();
    }
  }

  /**
   * 新規エクスポートを作成してデータを取得
   */
  async fetchWithConditions(conditions: ExportSearchConditions): Promise<JsNextExportRow[]> {
    try {
      await this.login();
      await this.openExportModal();

      await this.setSearchConditionsAndExport(conditions);

      // エクスポート完了を待機してダウンロード
      const download = await this.waitAndDownloadExport();
      const csvPath = await this.saveDownload(download);
      const rows = this.parseDownloadedCSV(csvPath);

      return rows;
    } finally {
      await this.close();
    }
  }

  /**
   * 最新の既存エクスポートをダウンロードしてデータを取得
   */
  async fetchLatestExport(): Promise<JsNextExportRow[]> {
    try {
      await this.login();

      // ダッシュボードに移動
      if (this.page) {
        await this.page.goto(JS_NEXT_DASHBOARD_URL);
        await this.page.waitForLoadState("networkidle");
      }

      const download = await this.downloadExistingExport(0);
      const csvPath = await this.saveDownload(download);
      const rows = this.parseDownloadedCSV(csvPath);

      return rows;
    } finally {
      await this.close();
    }
  }
}

/**
 * 環境変数からコネクタ設定を取得
 */
export function getConnectorConfig(): ConnectorConfig {
  return {
    jsNextUrl: process.env.JS_NEXT_URL || JS_NEXT_BASE_URL,
    username: process.env.JS_NEXT_EMAIL || "",
    password: process.env.JS_NEXT_PASSWORD || "",
    downloadDir: process.env.CONNECTOR_DOWNLOAD_DIR || "/tmp/connector-downloads",
  };
}

/**
 * 環境変数が設定されているか確認
 */
export function isJsNextConfigured(): boolean {
  return !!(process.env.JS_NEXT_EMAIL && process.env.JS_NEXT_PASSWORD);
}
