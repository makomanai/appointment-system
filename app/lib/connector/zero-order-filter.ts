/**
 * 0次判定 - 字幕なしフィルタ
 *
 * 2つのモード:
 * 1. キーワードベース: score = must*4 + should*2 - not*10 + meta
 * 2. AIベース: GPT-4o-miniで関連性を判定（低コスト）
 */

import {
  JsNextExportRow,
  ServiceKeywordConfig,
  ZeroOrderResult,
} from "./types";

/**
 * サービス情報（AI判定用）
 */
export interface ServiceContext {
  name: string;
  description: string;
  targetProblems: string;
  targetKeywords: string;
}

/**
 * AI判定結果
 */
interface AiZeroOrderResult {
  row: JsNextExportRow;
  score: number;
  passed: boolean;
  reasoning?: string;
}

/**
 * GPT-4o-miniで関連性を判定（バッチ処理）
 * 明確な3つの基準でYes/No判定
 */
async function judgeRelevanceWithAi(
  rows: JsNextExportRow[],
  service: ServiceContext,
  batchSize: number = 10
): Promise<AiZeroOrderResult[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const results: AiZeroOrderResult[] = [];

  // バッチ処理
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    // 複数トピックをまとめて判定
    const topicList = batch.map((row, idx) =>
      `[${idx + 1}] タイトル: ${row.title || "なし"}\n概要: ${row.summary || "なし"}`
    ).join("\n\n");

    const systemPrompt = `あなたは自治体向けソリューションの営業リード判定AIです。
トピック（議会での質疑）がサービスの営業対象として適切かを【広く】判定してください。
※営業リード発掘のため、関連性があれば積極的に通過させてください。

【サービス情報】
サービス名: ${service.name}
サービス概要: ${service.description}
解決できる課題: ${service.targetProblems}
関連キーワード: ${service.targetKeywords}

【判定基準 - 以下の3項目をYes/Noで判定】
Q1: 分野関連性 - トピックがサービスの対象分野（${service.name}関連）に関係するか？
Q2: 課題・キーワード関連 - 「解決できる課題」や「関連キーワード」と少しでも関連するか？
Q3: 営業機会 - 自治体の課題認識や検討姿勢が見られるか？（「検討中」「情報不足」でもYes）

【通過条件】
- 3項目中1つ以上がYesなら通過（passed: true）
- スコア = Yesの数 × 3 + 1（1-10点）
- 迷ったら通過させる（見逃すより拾う方が重要）

【出力形式】
JSON: {"results": [{"id": 1, "q1": true, "q2": false, "q3": false, "score": 4, "passed": true}, ...]}`;

    const userPrompt = `以下のトピックを判定してください:\n\n${topicList}`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 300,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        console.error(`[AI0次判定] APIエラー: ${response.status}`);
        // エラー時はデフォルトスコアで通過
        batch.forEach((row) => {
          results.push({ row, score: 5, passed: true });
        });
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      const scores = parsed.results || parsed;

      // 結果をマッピング
      batch.forEach((row, idx) => {
        const scoreData = Array.isArray(scores)
          ? scores.find((s: { id: number }) => s.id === idx + 1)
          : null;

        if (scoreData) {
          // Yes数をカウントしてスコア計算
          const yesCount = [scoreData.q1, scoreData.q2, scoreData.q3].filter(Boolean).length;
          const score = scoreData.score || (yesCount * 3 + 1);
          // 1つでもYesなら通過（営業リードは見逃しより拾いすぎの方が良い）
          const passed = scoreData.passed ?? (yesCount >= 1);

          results.push({ row, score, passed });
        } else {
          // デフォルト（判定できない場合は通過させる）
          results.push({ row, score: 5, passed: true });
        }
      });

    } catch (error) {
      console.error(`[AI0次判定] エラー:`, error);
      // エラー時はデフォルトで通過
      batch.forEach((row) => {
        results.push({ row, score: 5, passed: true });
      });
    }

    // 進捗ログ
    console.log(`[AI0次判定] 進捗: ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
  }

  return results;
}

/**
 * AI0次判定を実行
 */
export async function runAiZeroOrderFilter(
  rows: JsNextExportRow[],
  service: ServiceContext,
  limit: number = 0
): Promise<ZeroOrderResult[]> {
  console.log(`[AI0次判定] ${rows.length}件をGPT-4o-miniで判定...`);
  console.log(`[AI0次判定] サービス: ${service.name}`);

  // 重複排除
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
    console.log(`[AI0次判定] 重複排除: ${rows.length}件 → ${uniqueRows.length}件`);
  }

  // AI判定実行
  const aiResults = await judgeRelevanceWithAi(uniqueRows, service);

  // ZeroOrderResult形式に変換
  const results: ZeroOrderResult[] = aiResults.map((r) => ({
    row: r.row,
    mustCount: r.score >= 7 ? 2 : r.score >= 5 ? 1 : 0,
    shouldCount: Math.floor(r.score / 2),
    notCount: 0,
    metaScore: 0,
    score: r.score,
    passed: r.passed,
  }));

  // Pass条件を満たすものをフィルタ
  const passed = results.filter((r) => r.passed);
  console.log(`[AI0次判定] 通過: ${passed.length}件`);

  // スコア降順でソート
  passed.sort((a, b) => b.score - a.score);

  // limit適用
  const topN = limit > 0 ? passed.slice(0, limit) : passed;

  if (limit > 0 && passed.length > limit) {
    console.log(`[AI0次判定] 上位${limit}件に制限`);
  }

  // 統計
  if (topN.length > 0) {
    const stats = {
      max: Math.max(...topN.map((r) => r.score)),
      min: Math.min(...topN.map((r) => r.score)),
      avg: (topN.reduce((sum, r) => sum + r.score, 0) / topN.length).toFixed(1),
    };
    console.log(`[AI0次判定] スコア統計:`, stats);
  }

  return topN;
}

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
  targetKeywords: string | null,
  targetProblems?: string | null
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

  // targetProblems（解決できる課題）からキーワードを抽出 - 重要度高
  const problemKeywords = targetProblems
    ? targetProblems
        .replace(/[。、・\n]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2 && w.length <= 15)
    : [];

  return {
    serviceId,
    serviceName,
    must: [
      ...keywords.slice(0, 10), // target_keywordsの上位10個
      ...problemKeywords.slice(0, 5), // 解決できる課題から上位5個も必須に追加
    ],
    should: [
      ...keywords.slice(10),
      ...problemKeywords.slice(5), // 残りの課題キーワード
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
