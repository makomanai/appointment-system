/**
 * 一次判定 - 字幕を使った根拠スニペット抽出
 *
 * 0次通過のみ字幕（start/end ±30秒）を取得し、
 * 根拠スニペット最大10件を抽出。
 * 字幕全文は次工程に渡さない。
 */

import { getSrtContentByGroupId, isGoogleDriveConfigured } from "../google-drive";
import {
  EvidenceSnippet,
  FirstOrderResult,
  ServiceKeywordConfig,
  SrtSegment,
  ZeroOrderResult,
} from "./types";

// SRT時間形式をパース（例: "00:01:23,456" → 秒数）
function parseSrtTime(timeStr: string): number {
  const match = timeStr.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const ms = parseInt(match[4], 10);

  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

/**
 * SRTテキストをセグメント配列にパース
 */
export function parseSrt(srtContent: string): SrtSegment[] {
  const segments: SrtSegment[] = [];
  const blocks = srtContent.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;

    // 1行目: インデックス番号
    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;

    // 2行目: タイムスタンプ（例: 00:00:00,000 --> 00:00:02,500）
    const timeMatch = lines[1].match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    );
    if (!timeMatch) continue;

    const startSec = parseSrtTime(timeMatch[1]);
    const endSec = parseSrtTime(timeMatch[2]);

    // 3行目以降: テキスト
    const text = lines.slice(2).join(" ").trim();

    segments.push({
      index,
      startSec,
      endSec,
      text,
    });
  }

  return segments;
}

/**
 * 指定時間範囲のセグメントを抽出（±paddingSecを含む）
 */
function extractSegmentsInRange(
  segments: SrtSegment[],
  startSec: number,
  endSec: number,
  paddingSec: number = 30
): SrtSegment[] {
  const rangeStart = Math.max(0, startSec - paddingSec);
  const rangeEnd = endSec + paddingSec;

  return segments.filter(
    (seg) => seg.endSec >= rangeStart && seg.startSec <= rangeEnd
  );
}

/**
 * セグメントからキーワードマッチするスニペットを抽出
 */
function extractSnippetsWithKeywords(
  segments: SrtSegment[],
  keywords: string[],
  maxSnippets: number = 10
): EvidenceSnippet[] {
  const snippets: EvidenceSnippet[] = [];

  for (const segment of segments) {
    const matchedKeywords: string[] = [];
    const lowerText = segment.text.toLowerCase();

    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    if (matchedKeywords.length > 0) {
      snippets.push({
        text: segment.text,
        startSec: segment.startSec,
        endSec: segment.endSec,
        matchedKeywords,
      });
    }

    if (snippets.length >= maxSnippets) break;
  }

  // マッチしたキーワード数でソート（多い順）
  snippets.sort((a, b) => b.matchedKeywords.length - a.matchedKeywords.length);

  return snippets.slice(0, maxSnippets);
}

/**
 * 単一の0次通過結果に対して一次判定を実行
 */
export async function runFirstOrderForSingle(
  zeroResult: ZeroOrderResult,
  config: ServiceKeywordConfig
): Promise<FirstOrderResult> {
  const { row } = zeroResult;

  // group_idがない、またはGoogle Drive未設定の場合は字幕なしとして処理
  if (!row.group_id || !isGoogleDriveConfigured()) {
    return {
      row,
      zeroOrderScore: zeroResult.score,
      evidenceSnippets: [],
      hasSubtitle: false,
    };
  }

  try {
    // 字幕を取得
    const srtContent = await getSrtContentByGroupId(row.group_id);

    if (!srtContent) {
      return {
        row,
        zeroOrderScore: zeroResult.score,
        evidenceSnippets: [],
        hasSubtitle: false,
      };
    }

    // SRTをパース
    const segments = parseSrt(srtContent);

    // start/end ±30秒の範囲を抽出
    const relevantSegments = extractSegmentsInRange(
      segments,
      row.start_sec,
      row.end_sec,
      30 // padding seconds
    );

    // キーワードにマッチするスニペットを抽出（最大10件）
    const allKeywords = [...config.must, ...config.should];
    const snippets = extractSnippetsWithKeywords(
      relevantSegments,
      allKeywords,
      10
    );

    return {
      row,
      zeroOrderScore: zeroResult.score,
      evidenceSnippets: snippets,
      hasSubtitle: true,
    };
  } catch (error) {
    console.error(
      `[一次判定] 字幕取得エラー (group_id: ${row.group_id}):`,
      error
    );
    return {
      row,
      zeroOrderScore: zeroResult.score,
      evidenceSnippets: [],
      hasSubtitle: false,
    };
  }
}

/**
 * 0次通過結果の配列に対して一次判定を実行
 */
export async function runFirstOrderFilter(
  zeroResults: ZeroOrderResult[],
  config: ServiceKeywordConfig
): Promise<FirstOrderResult[]> {
  console.log(
    `[一次判定] ${zeroResults.length}件の0次通過データを処理...`
  );

  // Google Drive未設定の場合は字幕なしとして一括処理
  if (!isGoogleDriveConfigured()) {
    console.log("[一次判定] Google Drive未設定のため字幕取得をスキップ");
    return zeroResults.map((z) => ({
      row: z.row,
      zeroOrderScore: z.score,
      evidenceSnippets: [],
      hasSubtitle: false,
    }));
  }

  const results: FirstOrderResult[] = [];

  for (const zeroResult of zeroResults) {
    const result = await runFirstOrderForSingle(zeroResult, config);
    results.push(result);

    // 進捗ログ
    if (results.length % 10 === 0) {
      console.log(`[一次判定] 進捗: ${results.length}/${zeroResults.length}`);
    }
  }

  // 統計情報
  const withSubtitle = results.filter((r) => r.hasSubtitle).length;
  const withSnippets = results.filter(
    (r) => r.evidenceSnippets.length > 0
  ).length;
  const totalSnippets = results.reduce(
    (sum, r) => sum + r.evidenceSnippets.length,
    0
  );

  console.log(`[一次判定] 完了:`, {
    total: results.length,
    withSubtitle,
    withSnippets,
    totalSnippets,
    avgSnippetsPerItem: withSnippets > 0 ? totalSnippets / withSnippets : 0,
  });

  return results;
}

/**
 * 時間（秒）をHH:MM:SS形式に変換
 */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
