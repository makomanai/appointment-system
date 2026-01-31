import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../../lib/supabase";

/**
 * AI判定版 ゴールデンルール - 高確度リード抽出ロジック
 *
 * GPT-5.2を使用して、議会議事録から営業リードの優先度を判定
 */

// OpenAIクライアントを遅延初期化
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

interface RankResult {
  rank: "S" | "A" | "B" | "C";
  score: number;
  reasoning: string;
  keyPoints: {
    positive: string[];
    negative: string[];
  };
}

// AIによるランク判定
async function rankWithAI(
  title: string,
  summary: string,
  excerptText: string,
  serviceInfo?: string
): Promise<RankResult> {
  const openai = getOpenAIClient();

  const systemPrompt = `あなたは自治体向けソリューション営業の専門家です。
議会議事録の内容を分析し、営業リードとしての優先度を判定してください。

## 判定基準

### 高優先度（S/Aランク）の特徴:
- 具体的な時期が明示されている（来年度、令和X年度、〇月から等）
- 予算化・予算要求の言及がある
- 具体的なシステム・サービス導入の意向がある
- 課題認識が明確で、解決への意欲が見られる
- DX、デジタル化、効率化への積極的な姿勢

### 中優先度（Bランク）の特徴:
- 課題認識はあるが、具体的な時期や予算が不明確
- 「検討していく」「研究する」などの表現
- 一般的な問題提起にとどまる

### 低優先度（Cランク）の特徴:
- 「慎重に」「困難である」「時期尚早」などの消極的表現
- 既に契約済み・導入済みの言及
- 具体性がなく、進展の見込みが薄い

## 出力形式

以下のJSON形式で出力してください:
{
  "rank": "S" | "A" | "B" | "C",
  "score": 0-12の数値,
  "reasoning": "判定理由を1-2文で",
  "keyPoints": {
    "positive": ["ポジティブなポイント1", "ポイント2"],
    "negative": ["ネガティブなポイント1"]
  }
}

スコア目安:
- S: 10-12点（即アプローチすべき）
- A: 7-9点（優先的にアプローチ）
- B: 4-6点（情報収集継続）
- C: 0-3点（現時点では見送り）`;

  const userPrompt = `以下の議会議事録を分析し、営業リードとしての優先度を判定してください。

${serviceInfo ? `【対象サービス】\n${serviceInfo}\n` : ""}
【議題タイトル】
${title}

【議題概要】
${summary}

【発言内容（抜粋）】
${excerptText || "（発言内容なし）"}

JSON形式で判定結果を出力してください。`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2-2025-12-11",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 500,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content || "{}";

  try {
    const result = JSON.parse(content);
    return {
      rank: result.rank || "C",
      score: result.score || 0,
      reasoning: result.reasoning || "",
      keyPoints: result.keyPoints || { positive: [], negative: [] },
    };
  } catch {
    console.error("Failed to parse AI response:", content);
    return {
      rank: "C",
      score: 0,
      reasoning: "判定エラー",
      keyPoints: { positive: [], negative: [] },
    };
  }
}

// 単一トピックをAIでランク付け
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const topicId = searchParams.get("topicId");

  if (!topicId) {
    return NextResponse.json(
      { success: false, error: "topicId is required" },
      { status: 400 }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "OpenAI API key is not configured" },
      { status: 503 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();

    const { data: topic, error } = await supabase
      .from("topics")
      .select("id, title, summary, excerpt_text, company_id")
      .eq("id", topicId)
      .single();

    if (error || !topic) {
      return NextResponse.json(
        { success: false, error: "Topic not found" },
        { status: 404 }
      );
    }

    // 企業のサービス情報を取得
    let serviceInfo = "";
    if (topic.company_id) {
      const { data: services } = await supabase
        .from("services")
        .select("name, description, target_keywords")
        .eq("company_id", topic.company_id);

      if (services && services.length > 0) {
        serviceInfo = services
          .map(s => `${s.name}: ${s.description || ""} (キーワード: ${s.target_keywords || ""})`)
          .join("\n");
      }
    }

    const result = await rankWithAI(
      topic.title || "",
      topic.summary || "",
      topic.excerpt_text || "",
      serviceInfo
    );

    return NextResponse.json({
      success: true,
      data: {
        topicId: topic.id,
        ...result,
      },
    });
  } catch (error) {
    console.error("AI Rank error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// 企業のトピックを一括AIランク付け
export async function POST(request: NextRequest) {
  console.log("=== /api/v2/topics/rank-ai POST ===");

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "OpenAI API key is not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { companyId, updateDb = false, limit = 50 } = body;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "companyId is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 企業のサービス情報を取得
    let serviceInfo = "";
    const { data: services } = await supabase
      .from("services")
      .select("name, description, target_keywords")
      .eq("company_id", companyId);

    if (services && services.length > 0) {
      serviceInfo = services
        .map(s => `${s.name}: ${s.description || ""} (キーワード: ${s.target_keywords || ""})`)
        .join("\n");
    }

    // 企業のトピックを取得（制限付き）
    const { data: topics, error } = await supabase
      .from("topics")
      .select("id, title, summary, excerpt_text, priority")
      .eq("company_id", companyId)
      .limit(limit);

    if (error) {
      throw error;
    }

    if (!topics || topics.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No topics found",
        results: [],
      });
    }

    console.log(`Processing ${topics.length} topics for ${companyId} with AI`);

    // 各トピックをAIでスコアリング
    const results = [];
    const rankCounts = { S: 0, A: 0, B: 0, C: 0 };

    for (const topic of topics) {
      try {
        const aiResult = await rankWithAI(
          topic.title || "",
          topic.summary || "",
          topic.excerpt_text || "",
          serviceInfo
        );

        // priorityをランクに応じて設定 (S/A → A, B → B, C → C)
        const newPriority = aiResult.rank === "S" || aiResult.rank === "A" ? "A" : aiResult.rank;

        results.push({
          topicId: topic.id,
          title: topic.title,
          oldPriority: topic.priority,
          newPriority,
          ...aiResult,
        });

        rankCounts[aiResult.rank]++;

        // DBを更新（オプション）
        if (updateDb && topic.priority !== newPriority) {
          await supabase
            .from("topics")
            .update({ priority: newPriority })
            .eq("id", topic.id);
        }
      } catch (err) {
        console.error(`Error ranking topic ${topic.id}:`, err);
        results.push({
          topicId: topic.id,
          title: topic.title,
          oldPriority: topic.priority,
          newPriority: topic.priority,
          rank: "C" as const,
          score: 0,
          reasoning: "判定エラー",
          keyPoints: { positive: [], negative: [] },
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    console.log("AI Rank distribution:", rankCounts);

    return NextResponse.json({
      success: true,
      message: `${topics.length}件のトピックをAIでランク付けしました`,
      summary: rankCounts,
      results,
      dbUpdated: updateDb,
    });
  } catch (error) {
    console.error("AI Rank error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
