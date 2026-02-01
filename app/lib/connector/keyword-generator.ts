/**
 * AIによるサービス別検索キーワード自動生成
 * サービス情報から網羅的なキーワードを生成し、漏れなく拾えるようにする
 */

import { ServiceKeywordConfig } from "./types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// サービス情報の型
export interface ServiceInfo {
  id: string;
  name: string;
  description: string;
  features: string;
  targetProblems: string;
}

// キーワード生成結果
export interface GeneratedKeywords {
  must: string[];      // 必須キーワード（サービスの核心）
  should: string[];    // 推奨キーワード（関連語・同義語）
  not: string[];       // 除外キーワード（ノイズ排除）
  searchQuery: string; // JS-NEXT検索用の結合クエリ
}

// キャッシュ（サーバー負担軽減）
const keywordCache = new Map<string, { keywords: GeneratedKeywords; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24時間

/**
 * サービス情報からAIでキーワードを生成
 */
export async function generateKeywordsForService(service: ServiceInfo): Promise<GeneratedKeywords> {
  // キャッシュチェック
  const cached = keywordCache.get(service.id);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[KeywordGenerator] キャッシュヒット: ${service.name}`);
    return cached.keywords;
  }

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const prompt = buildPrompt(service);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini", // コスト効率の良いモデル
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3, // 一貫性を重視
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || "{}";

  try {
    const parsed = JSON.parse(content);
    const keywords: GeneratedKeywords = {
      must: parsed.must || [],
      should: parsed.should || [],
      not: parsed.not || [],
      searchQuery: buildSearchQuery(parsed.must || [], parsed.should || []),
    };

    // キャッシュに保存
    keywordCache.set(service.id, { keywords, timestamp: Date.now() });

    console.log(`[KeywordGenerator] 生成完了: ${service.name}`);
    console.log(`  must: ${keywords.must.join(", ")}`);
    console.log(`  should: ${keywords.should.length}件`);
    console.log(`  not: ${keywords.not.length}件`);

    return keywords;
  } catch (e) {
    console.error("[KeywordGenerator] JSON parse error:", content);
    throw new Error("Failed to parse AI response");
  }
}

/**
 * ServiceKeywordConfigを生成
 */
export async function generateServiceKeywordConfig(service: ServiceInfo): Promise<ServiceKeywordConfig> {
  const keywords = await generateKeywordsForService(service);

  return {
    serviceId: service.id,
    serviceName: service.name,
    must: keywords.must,
    should: keywords.should,
    not: keywords.not,
    meta: 0, // デフォルト値
  };
}

/**
 * 検索クエリを構築（JS-NEXT用）
 * サーバー負担軽減のため、キーワード数を制限
 */
function buildSearchQuery(must: string[], should: string[]): string {
  // mustは全て含める
  // shouldは上位5件まで（サーバー負担軽減）
  const keywords = [...must, ...should.slice(0, 5)];

  // 重複排除
  const unique = Array.from(new Set(keywords));

  // スペース区切りで結合（JS-NEXTはOR検索）
  return unique.join(" ");
}

const SYSTEM_PROMPT = `あなたは地方議会の答弁データを検索するための専門家です。
企業のサービス情報を分析し、そのサービスに関連する議会答弁を漏れなく拾うための検索キーワードを生成します。

## 重要な原則
1. **網羅性重視**: 漏れなく拾うことが最優先。後でフィルタリングするので、多めに拾う
2. **多様な表現**: 同じ概念でも、行政用語、法律用語、一般用語など複数の表現を含める
3. **関連分野**: 直接的なキーワードだけでなく、関連する政策分野も含める
4. **地方議会特有の表現**: 「〜事業」「〜対策」「〜支援」など行政特有の表現を考慮

## 出力形式（JSON）
{
  "must": ["必須キーワード1", "必須キーワード2", ...],  // 3-5個、サービスの核心
  "should": ["推奨キーワード1", "推奨キーワード2", ...],  // 10-20個、関連語・同義語
  "not": ["除外キーワード1", ...],  // 0-5個、明らかなノイズ
  "reasoning": "キーワード選定の理由"
}`;

function buildPrompt(service: ServiceInfo): string {
  return `以下のサービスに関連する地方議会の答弁を検索するためのキーワードを生成してください。

## サービス情報
- **サービス名**: ${service.name}
- **説明**: ${service.description || "(未設定)"}
- **特徴・機能**: ${service.features || "(未設定)"}
- **解決する課題**: ${service.targetProblems || "(未設定)"}

## 要件
- このサービスが解決できる課題について議論している議会答弁を見つけたい
- 漏れなく拾うことが重要（後でAIがフィルタリングする）
- 地方自治体の議会で使われる表現を考慮する

JSON形式で出力してください。`;
}

/**
 * キャッシュをクリア
 */
export function clearKeywordCache(serviceId?: string): void {
  if (serviceId) {
    keywordCache.delete(serviceId);
  } else {
    keywordCache.clear();
  }
}

/**
 * キャッシュの状態を取得
 */
export function getKeywordCacheStats(): { size: number; services: string[] } {
  return {
    size: keywordCache.size,
    services: Array.from(keywordCache.keys()),
  };
}
