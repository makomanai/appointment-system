/**
 * AI判定 - サービス情報 + SRTテキストを使った最終ランク付け
 *
 * 0次判定を通過したトピックに対して、
 * サービスとの関連性を考慮した最終的なランク付けを行う
 */

import { FirstOrderResult, ServiceKeywordConfig } from "./types";

export interface AiRankResult {
  rank: "S" | "A" | "B" | "C";
  priority: "A" | "B" | "C"; // DB用 (S/A → A)
  score: number;
  reasoning: string;
  keyPoints: {
    positive: string[];
    negative: string[];
  };
}

export interface ServiceInfo {
  name: string;
  description: string;
  targetKeywords: string;
}

/**
 * OpenAI APIでランク判定
 */
async function callOpenAI(
  systemPrompt: string,
  userPrompt: string
): Promise<AiRankResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const requestBody = {
    model: "gpt-5.2-2025-12-11", // 高度な推論が必要なため最新モデルを使用
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 400, // Cランクは理由省略のため削減
    response_format: { type: "json_object" },
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";

  const result = JSON.parse(content);
  const rank = result.rank || "C";

  return {
    rank,
    priority: rank === "S" || rank === "A" ? "A" : rank,
    score: result.score || 0,
    reasoning: result.reasoning || "",
    keyPoints: result.keyPoints || { positive: [], negative: [] },
  };
}

/**
 * 単一トピックをAIでランク判定
 */
export async function rankTopicWithAI(
  title: string,
  summary: string,
  srtText: string,
  serviceInfo: ServiceInfo | null,
  zeroOrderScore: number
): Promise<AiRankResult> {
  const systemPrompt = `あなたは自治体向けソリューション営業の専門家です。
議会議事録と発言内容を分析し、営業リードとしての優先度を判定してください。

## 判定基準

### 高優先度（S/Aランク）の条件:
1. ${serviceInfo ? `【必須】対象サービス（${serviceInfo.name}）との関連性が高い` : "具体的なシステム・サービス導入の意向がある"}
2. 具体的な時期が明示されている（来年度、令和X年度、〇月から等）
3. 予算化・予算要求の言及がある
4. 課題認識が明確で、解決への意欲が見られる

### 中優先度（Bランク）の特徴:
- 課題認識はあるが、具体的な時期や予算が不明確
- 「検討していく」「研究する」などの表現
- サービスと部分的に関連するが、直接的ではない

### 低優先度（Cランク）の特徴:
- 「慎重に」「困難である」「時期尚早」などの消極的表現
- 既に契約済み・導入済みの言及
- 具体性がなく、進展の見込みが薄い
${serviceInfo ? "- 対象サービスとの関連性が低い" : ""}

## 出力形式

以下のJSON形式で出力:
{
  "rank": "S" | "A" | "B" | "C",
  "score": 0-12の数値,
  "reasoning": "判定理由を1-2文で（Cランクの場合は空文字）",
  "keyPoints": {
    "positive": ["ポジティブなポイント"],
    "negative": ["ネガティブなポイント"]
  }
}

スコア目安: S: 10-12点, A: 7-9点, B: 4-6点, C: 0-3点

【重要】コスト削減のため:
- S/A/Bランクの場合: reasoningとkeyPointsを詳細に記載
- Cランクの場合: reasoning は空文字("")、keyPointsは空配列([])で出力`;

  const serviceSection = serviceInfo
    ? `【対象サービス】
名前: ${serviceInfo.name}
説明: ${serviceInfo.description}
キーワード: ${serviceInfo.targetKeywords}

※ 上記サービスとの関連性を重視して判定してください。
`
    : "";

  const userPrompt = `${serviceSection}【議題タイトル】
${title || "（なし）"}

【議題概要】
${summary || "（なし）"}

【発言内容（字幕）】
${srtText || "（字幕なし）"}

【0次判定スコア】
${zeroOrderScore}点

JSON形式で判定結果を出力してください。`;

  return callOpenAI(systemPrompt, userPrompt);
}

/**
 * 1次判定結果の配列に対してAIランク判定を実行
 */
export async function runAiRanking(
  firstOrderResults: FirstOrderResult[],
  serviceInfo: ServiceInfo | null,
  options: {
    maxConcurrent?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<Array<FirstOrderResult & { aiRank: AiRankResult }>> {
  const { maxConcurrent = 3, onProgress } = options;

  console.log(`[AI判定] ${firstOrderResults.length}件をランク付け...`);
  if (serviceInfo) {
    console.log(`[AI判定] サービス: ${serviceInfo.name}`);
  }

  const results: Array<FirstOrderResult & { aiRank: AiRankResult }> = [];

  // バッチ処理（同時実行数を制限）
  for (let i = 0; i < firstOrderResults.length; i += maxConcurrent) {
    const batch = firstOrderResults.slice(i, i + maxConcurrent);

    const batchResults = await Promise.all(
      batch.map(async (result) => {
        try {
          const aiRank = await rankTopicWithAI(
            result.row.title || "",
            result.row.summary || "",
            result.fullRangeText || "",
            serviceInfo,
            result.zeroOrderScore
          );

          return { ...result, aiRank };
        } catch (error) {
          console.error(`[AI判定] エラー:`, error);
          // エラー時はデフォルトでB判定
          return {
            ...result,
            aiRank: {
              rank: "B" as const,
              priority: "B" as const,
              score: 5,
              reasoning: "AI判定エラー、0次スコアに基づくデフォルト判定",
              keyPoints: { positive: [], negative: [] },
            },
          };
        }
      })
    );

    results.push(...batchResults);

    if (onProgress) {
      onProgress(results.length, firstOrderResults.length);
    }

    console.log(`[AI判定] 進捗: ${results.length}/${firstOrderResults.length}`);
  }

  // 統計
  const rankCounts = { S: 0, A: 0, B: 0, C: 0 };
  results.forEach((r) => rankCounts[r.aiRank.rank]++);
  console.log(`[AI判定] 完了:`, rankCounts);

  return results;
}

/**
 * Supabaseからサービス情報を取得するヘルパー
 */
export async function getServiceInfoForCompany(
  companyId: string,
  supabase: ReturnType<typeof import("../supabase").createServerSupabaseClient>
): Promise<ServiceInfo | null> {
  const { data: services, error } = await supabase
    .from("services")
    .select("name, description, target_keywords")
    .eq("company_id", companyId)
    .limit(1);

  if (error || !services || services.length === 0) {
    console.log(`[AI判定] サービス未登録 (company_id: ${companyId})`);
    return null;
  }

  const service = services[0];
  return {
    name: service.name,
    description: service.description || "",
    targetKeywords: service.target_keywords || "",
  };
}
