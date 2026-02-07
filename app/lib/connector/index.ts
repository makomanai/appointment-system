/**
 * コネクタモジュール - エクスポート
 */

// 型定義
export * from "./types";

// Aコネクタ（Playwright）
export {
  JsNextConnector,
  getConnectorConfig,
  isJsNextConfigured,
} from "./js-next-connector";
export type { ExportSearchConditions } from "./js-next-connector";

// 0次判定
export {
  calculateZeroOrderScore,
  runZeroOrderFilter,
  runAiZeroOrderFilter,
  getDefaultServiceKeywordConfig,
  buildServiceKeywordConfig,
} from "./zero-order-filter";
export type { ServiceContext } from "./zero-order-filter";

// 一次判定
export {
  parseSrt,
  runFirstOrderFilter,
  runFirstOrderForSingle,
  formatTime,
} from "./first-order-filter";

// 正規化
export {
  normalizeFirstOrderResult,
  normalizeResults,
  toCSVString,
  toImportPayload,
} from "./normalizer";

// パイプライン
export {
  getServiceKeywordConfig,
  runPipeline,
  runPipelineFromCSV,
} from "./pipeline";

// AIキーワード生成
export {
  generateKeywordsForService,
  generateServiceKeywordConfig,
  clearKeywordCache,
  getKeywordCacheStats,
} from "./keyword-generator";
export type { ServiceInfo, GeneratedKeywords } from "./keyword-generator";

// フェッチ履歴（差分取得用）
export {
  getFetchHistory,
  updateFetchHistory,
  getAllFetchHistory,
  clearFetchHistory,
  getDateRangeForFetch,
} from "./fetch-history";
export type { FetchHistoryEntry } from "./fetch-history";
