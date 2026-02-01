/**
 * 0次判定 - 字幕なしフィルタ
 *
 * スコア計算: score = must*4 + should*2 - not*10 + meta
 * Pass条件: (must>=1 & score>=8) OR (should>=3 & score>=7)
 * 出力: 上位50件
 */

import {
  JsNextExportRow,
  ServiceKeywordConfig,
  ZeroOrderResult,
} from "./types";

/**
 * テキスト内のキーワードをカウント
 */
function countKeywords(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  let count = 0;

  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      count++;
    }
  }

  return count;
}

/**
 * 単一行の0次判定スコアを計算
 */
export function calculateZeroOrderScore(
  row: JsNextExportRow,
  config: ServiceKeywordConfig
): ZeroOrderResult {
  // タイトルと概要を結合して分析
  const text = [row.title, row.summary].filter(Boolean).join(" ");

  // キーワードカウント
  const mustCount = countKeywords(text, config.must);
  const shouldCount = countKeywords(text, config.should);
  const notCount = countKeywords(text, config.not);
  const metaScore = config.meta;

  // スコア計算: must*4 + should*2 - not*10 + meta
  const score = mustCount * 4 + shouldCount * 2 - notCount * 10 + metaScore;

  // Pass条件: (must>=1 & score>=8) OR (should>=3 & score>=7)
  const passed =
    (mustCount >= 1 && score >= 8) || (shouldCount >= 3 && score >= 7);

  return {
    row,
    mustCount,
    shouldCount,
    notCount,
    metaScore,
    score,
    passed,
  };
}

/**
 * 入力データの重複排除キーを生成
 */
function getDedupeKey(row: JsNextExportRow): string {
  // group_id + start/end > external_id + start/end > title+council_date+start/end
  // 注意: start_sec/end_secが異なれば別トピックとして扱う
  if (row.group_id) {
    return `${row.group_id}_${row.start_sec}_${row.end_sec}`;
  }
  if (row.external_id) {
    return `${row.external_id}_${row.start_sec}_${row.end_sec}`;
  }
  return `${row.prefecture}_${row.city}_${row.council_date}_${row.title}_${row.start_sec}_${row.end_sec}`;
}

/**
 * 0次判定を実行（上位50件を返す）
 */
export function runZeroOrderFilter(
  rows: JsNextExportRow[],
  config: ServiceKeywordConfig,
  limit: number = 50
): ZeroOrderResult[] {
  console.log(`[0次判定] ${rows.length}件のデータをフィルタリング...`);

  // 入力段階で重複排除
  const seen = new Set<string>();
  const uniqueRows: JsNextExportRow[] = [];
  for (const row of rows) {
    const key = getDedupeKey(row);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRows.push(row);
    }
  }

  if (uniqueRows.length < rows.length) {
    console.log(`[0次判定] 入力重複排除: ${rows.length}件 → ${uniqueRows.length}件`);
  }

  console.log(`[0次判定] キーワード設定:`, {
    must: config.must.length,
    should: config.should.length,
    not: config.not.length,
    meta: config.meta,
  });

  // 全行をスコアリング
  const results: ZeroOrderResult[] = uniqueRows.map((row) =>
    calculateZeroOrderScore(row, config)
  );

  // Pass条件を満たすものをフィルタ（B評価以上）
  const passed = results.filter((r) => r.passed);

  console.log(`[0次判定] Pass条件（B評価以上）を満たす: ${passed.length}件`);

  // スコア降順でソート
  passed.sort((a, b) => b.score - a.score);

  // limit=0 の場合は制限なし（B評価以上を全て返す）
  const topN = limit > 0 ? passed.slice(0, limit) : passed;

  if (limit > 0) {
    console.log(`[0次判定] 上位${limit}件に制限: ${topN.length}件`);
  } else {
    console.log(`[0次判定] 制限なし（B評価以上を全件通過）: ${topN.length}件`);
  }

  // 統計情報を出力
  if (topN.length > 0) {
    const scoreStats = {
      max: Math.max(...topN.map((r) => r.score)),
      min: Math.min(...topN.map((r) => r.score)),
      avg: topN.reduce((sum, r) => sum + r.score, 0) / topN.length,
    };
    console.log(`[0次判定] スコア統計:`, scoreStats);
  }

  return topN;
}

/**
 * デフォルトのサービス別キーワード設定を取得
 * （実際の運用ではDBから取得）
 */
export function getDefaultServiceKeywordConfig(
  serviceName: string
): ServiceKeywordConfig {
  // サービス別のデフォルト設定
  const configs: Record<string, ServiceKeywordConfig> = {
    // AiCAN（児童相談業務支援）
    AiCAN: {
      serviceId: "aican",
      serviceName: "AiCAN",
      must: [
        "児童相談",
        "児童福祉",
        "要保護児童",
        "虐待",
        "児童虐待",
        "一時保護",
        "児相",
      ],
      should: [
        "子ども家庭",
        "DX",
        "システム",
        "デジタル化",
        "業務効率",
        "AI",
        "情報共有",
        "連携",
        "支援拠点",
        "こども家庭センター",
      ],
      not: [
        "導入済み",
        "稼働中",
        "契約済み",
        "入札終了",
      ],
      meta: 2, // 児童福祉は優先度高め
    },

    // 汎用（サービス未指定時）
    default: {
      serviceId: "default",
      serviceName: "汎用",
      must: [
        "システム導入",
        "DX推進",
        "デジタル化",
        "業務改革",
      ],
      should: [
        "予算",
        "来年度",
        "新年度",
        "計画",
        "効率化",
        "自動化",
        "AI",
        "クラウド",
      ],
      not: [
        "導入済み",
        "稼働中",
        "契約済み",
        "見送り",
        "時期尚早",
      ],
      meta: 0,
    },
  };

  return configs[serviceName] || configs.default;
}

/**
 * サービス設定をDBから動的に構築
 * （既存のservicesテーブルのdescriptionやtarget_keywordsから生成）
 */
export function buildServiceKeywordConfig(
  serviceId: string,
  serviceName: string,
  description: string,
  targetKeywords: string | null
): ServiceKeywordConfig {
  // target_keywordsをパース（カンマ区切りを想定）
  const keywords = targetKeywords
    ? targetKeywords.split(/[,、\s]+/).filter(Boolean)
    : [];

  // descriptionからキーワードを抽出（簡易的な抽出）
  const descKeywords = description
    .replace(/[。、]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w.length <= 10);

  return {
    serviceId,
    serviceName,
    must: keywords.slice(0, 10), // target_keywordsの上位10個をmust
    should: [
      ...keywords.slice(10),
      ...descKeywords.slice(0, 10),
      // 汎用キーワード
      "DX", "システム", "導入", "予算", "来年度",
    ],
    not: [
      "導入済み", "稼働中", "契約済み", "入札終了",
    ],
    meta: 1,
  };
}
