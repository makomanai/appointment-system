/**
 * Normalizer - 一次判定結果を既存の取り込み形式に変換
 *
 * 既存の /api/v2/topics/import が期待する形式に変換
 */

import { FirstOrderResult, NormalizedTopicRow } from "./types";
import { formatTime } from "./first-order-filter";

/**
 * 根拠スニペットをexcerpt_textに連結
 */
function formatExcerptText(result: FirstOrderResult): string {
  if (result.evidenceSnippets.length === 0) {
    return "";
  }

  // スニペットを時間順にソート
  const sorted = [...result.evidenceSnippets].sort(
    (a, b) => a.startSec - b.startSec
  );

  // 各スニペットを「[時間] テキスト」形式で連結
  return sorted
    .map((s) => {
      const timeStr = formatTime(s.startSec);
      const keywords = s.matchedKeywords.join(", ");
      return `[${timeStr}] ${s.text} (KW: ${keywords})`;
    })
    .join("\n\n");
}

/**
 * 根拠スニペットの時間範囲を excerpt_range に変換
 */
function formatExcerptRange(result: FirstOrderResult): string {
  if (result.evidenceSnippets.length === 0) {
    return "";
  }

  const minStart = Math.min(...result.evidenceSnippets.map((s) => s.startSec));
  const maxEnd = Math.max(...result.evidenceSnippets.map((s) => s.endSec));

  return `${formatTime(minStart)} - ${formatTime(maxEnd)} (${result.evidenceSnippets.length}件のスニペット)`;
}

/**
 * 単一の一次判定結果を正規化
 */
export function normalizeFirstOrderResult(
  result: FirstOrderResult,
  companyId: string
): NormalizedTopicRow {
  const { row } = result;

  return {
    company_id: companyId,
    prefecture: row.prefecture,
    city: row.city,
    council_date: row.council_date,
    title: row.title,
    summary: row.summary,
    questioner: row.questioner,
    answerer: row.answerer,
    source_url: row.source_url,
    group_id: row.group_id,
    start_sec: row.start_sec,
    end_sec: row.end_sec,
    excerpt_text: formatExcerptText(result),
    excerpt_range: formatExcerptRange(result),
    external_id: row.external_id,
    category: row.category,
    stance: row.stance,
  };
}

/**
 * 一次判定結果の配列を正規化
 */
export function normalizeResults(
  results: FirstOrderResult[],
  companyId: string
): NormalizedTopicRow[] {
  console.log(`[Normalizer] ${results.length}件の結果を正規化...`);

  const normalized = results.map((r) => normalizeFirstOrderResult(r, companyId));

  console.log(`[Normalizer] 正規化完了: ${normalized.length}件`);

  return normalized;
}

/**
 * 正規化済みデータを既存インポートのCSV形式に変換
 */
export function toCSVString(rows: NormalizedTopicRow[]): string {
  const headers = [
    "企業ID",
    "都道府県",
    "市町村",
    "議会日付",
    "タイトル",
    "概要",
    "質問者",
    "回答者",
    "ソースURL",
    "グループID",
    "開始秒数",
    "終了秒数",
    "抽出テキスト",
    "抽出範囲",
    "議題ID",
    "カテゴリ",
    "立場",
  ];

  const csvLines = [headers.join(",")];

  for (const row of rows) {
    const values = [
      escapeCSV(row.company_id),
      escapeCSV(row.prefecture),
      escapeCSV(row.city),
      escapeCSV(row.council_date),
      escapeCSV(row.title),
      escapeCSV(row.summary),
      escapeCSV(row.questioner),
      escapeCSV(row.answerer),
      escapeCSV(row.source_url),
      escapeCSV(row.group_id),
      row.start_sec.toString(),
      row.end_sec.toString(),
      escapeCSV(row.excerpt_text),
      escapeCSV(row.excerpt_range),
      escapeCSV(row.external_id || ""),
      escapeCSV(row.category || ""),
      escapeCSV(row.stance || ""),
    ];
    csvLines.push(values.join(","));
  }

  return csvLines.join("\n");
}

/**
 * CSV用にエスケープ
 */
function escapeCSV(value: string): string {
  if (!value) return '""';
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * company_row_keyを生成（DB保存用のユニークキー）
 * 優先順位: group_id > external_id > title+council_date+start_sec+end_sec のハッシュ
 *
 * 注意: start_sec/end_secが異なれば別トピックとして扱う
 */
function generateCompanyRowKey(row: NormalizedTopicRow, companyId: string): string {
  // group_idがあれば最も信頼性が高い
  if (row.group_id) {
    // group_id + start_sec + end_sec でセグメント単位の識別
    return `${companyId}_${row.group_id}_${row.start_sec}_${row.end_sec}`.replace(
      /[^a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF-]/g,
      ""
    );
  }

  // external_idがあればそれを使用
  if (row.external_id) {
    return `${companyId}_${row.external_id}_${row.start_sec}_${row.end_sec}`.replace(
      /[^a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF-]/g,
      ""
    );
  }

  // それ以外は自治体+日付+タイトル+時間のハッシュ
  const base = [
    companyId,
    row.prefecture || "",
    row.city || "",
    row.council_date || "",
    row.title || "",
    String(row.start_sec || 0),
    String(row.end_sec || 0),
  ].join("_");

  // 簡易ハッシュ
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return `${companyId}_${Math.abs(hash).toString(36)}`.replace(
    /[^a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g,
    ""
  );
}

/**
 * 正規化済みデータを既存インポートが受け入れるJSONオブジェクト配列に変換
 * （FormDataではなくプログラマティックに渡す場合）
 */
export function toImportPayload(
  rows: NormalizedTopicRow[],
  companyId: string
): Array<{
  company_id: string;
  company_row_key: string;
  prefecture: string | null;
  city: string | null;
  council_date: string | null;
  title: string | null;
  summary: string | null;
  questioner: string | null;
  answerer: string | null;
  source_url: string | null;
  group_id: string | null;
  start_sec: number | null;
  end_sec: number | null;
  excerpt_text: string | null;
  excerpt_range: string | null;
  external_id?: string | null;
  category?: string | null;
  stance?: string | null;
  status: string;
  priority: string;
  dispatch_status: string;
}> {
  // 重複排除: company_row_keyでグループ化し、最初のものを採用
  const seen = new Map<string, NormalizedTopicRow>();

  for (const row of rows) {
    const key = generateCompanyRowKey(row, companyId);
    if (!seen.has(key)) {
      seen.set(key, row);
    }
  }

  const uniqueRows = Array.from(seen.entries());
  console.log(`[Normalizer] 重複排除: ${rows.length}件 → ${uniqueRows.length}件`);

  return uniqueRows.map(([companyRowKey, row]) => {

    return {
      company_id: companyId,
      company_row_key: companyRowKey,
      prefecture: row.prefecture || null,
      city: row.city || null,
      council_date: row.council_date || null,
      title: row.title || null,
      summary: row.summary || null,
      questioner: row.questioner || null,
      answerer: row.answerer || null,
      source_url: row.source_url || null,
      group_id: row.group_id || null,
      start_sec: row.start_sec || null,
      end_sec: row.end_sec || null,
      excerpt_text: row.excerpt_text || null,
      excerpt_range: row.excerpt_range || null,
      external_id: row.external_id || null,
      category: row.category || null,
      stance: row.stance || null,
      status: "未着手",
      priority: "B", // 初期はBランク、AI判定後に更新
      dispatch_status: "NOT_SENT",
    };
  });
}
