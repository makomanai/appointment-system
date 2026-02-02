/**
 * Aコネクタ・0次判定・一次判定の型定義
 */

// サービスA（JS-NEXT）からエクスポートされるCSV行
export interface JsNextExportRow {
  // 元データ列（JS-NEXTエクスポート形式）
  group_id: string;
  prefecture: string;
  city: string;
  council_date: string;
  title: string;
  summary: string;
  questioner: string;
  answerer: string;
  source_url: string;
  start_sec: number;
  end_sec: number;
  // 必要に応じて追加
  external_id?: string;
  category?: string;
  stance?: string;
}

// サービス別キーワード設定
export interface ServiceKeywordConfig {
  serviceId: string;
  serviceName: string;
  must: string[];      // 必須キーワード（+4点）
  should: string[];    // 推奨キーワード（+2点）
  not: string[];       // 除外キーワード（-10点）
  meta: number;        // メタスコア（基本加点）
}

// 0次判定結果
export interface ZeroOrderResult {
  row: JsNextExportRow;
  mustCount: number;
  shouldCount: number;
  notCount: number;
  metaScore: number;
  score: number;       // must*4 + should*2 - not*10 + meta
  passed: boolean;     // Pass条件を満たすか
}

// SRTセグメント
export interface SrtSegment {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

// 根拠スニペット
export interface EvidenceSnippet {
  text: string;
  startSec: number;
  endSec: number;
  matchedKeywords: string[];
}

// 一次判定結果
export interface FirstOrderResult {
  row: JsNextExportRow;
  zeroOrderScore: number;
  evidenceSnippets: EvidenceSnippet[];  // キーワードマッチしたスニペット（最大10件）
  fullRangeText: string;                // start_sec〜end_secの字幕テキスト全体
  hasSubtitle: boolean;
}

// 既存importに渡す正規化済みデータ
export interface NormalizedTopicRow {
  company_id: string;
  prefecture: string;
  city: string;
  council_date: string;
  title: string;
  summary: string;
  questioner: string;
  answerer: string;
  source_url: string;
  group_id: string;
  start_sec: number;
  end_sec: number;
  excerpt_text: string;      // 根拠スニペットを連結
  excerpt_range: string;     // 時間範囲の説明
  external_id?: string;
  category?: string;
  stance?: string;
}

// Aコネクタ設定
export interface ConnectorConfig {
  jsNextUrl: string;
  username: string;
  password: string;
  downloadDir: string;
}

// パイプライン全体の結果
export interface PipelineResult {
  totalFetched: number;
  includedCount?: number;      // アプローチ先リストでフィルタ後の件数
  excludedCount?: number;      // 除外フィルターで除外された件数
  zeroOrderPassed: number;
  firstOrderProcessed: number;
  importedCount: number;
  errors: string[];
}
