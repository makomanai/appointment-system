import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../../lib/supabase";

// OpenAIクライアントを遅延初期化
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

interface SummarizeRequest {
  topicId?: string;
  companyId?: string;
  forceUpdate?: boolean;
}

// 抽出テキストからAI要約を生成
async function generateSummary(
  excerptText: string,
  questioner: string | null,
  answerer: string | null
): Promise<string> {
  const openai = getOpenAIClient();

  const systemPrompt = `あなたは自治体の議会議事録を分析するアシスタントです。
与えられた議会での発言テキストを分析し、以下の形式で要約してください：

【質問要点】
・質問者が何を問題視し、何を求めているかを簡潔に

【回答要点】
・行政側がどう回答したか、具体的な取り組みや計画があれば記載

【キーワード】
・予算、時期、システム、DX、改善などの重要キーワードを抽出

【営業ポイント】
・営業アポイントに活かせるポイント（課題認識、導入意欲、時期感など）

重要：
- 発言者が明確な場合は「○○氏の発言」と記載
- 具体的な数字、時期、予算があれば必ず含める
- 営業担当者が一目で理解できるよう簡潔に`;

  const userPrompt = `以下の議会発言テキストを分析してください。

${questioner ? `【質問者】${questioner}` : ""}
${answerer ? `【回答者】${answerer}` : ""}

【発言テキスト】
${excerptText}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 1000,
  });

  return completion.choices[0]?.message?.content || "";
}

// 単一トピックを要約
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
      .select("id, excerpt_text, questioner, answerer, ai_summary")
      .eq("id", topicId)
      .single();

    if (error || !topic) {
      return NextResponse.json(
        { success: false, error: "Topic not found" },
        { status: 404 }
      );
    }

    // 既にAI要約がある場合はそれを返す
    if (topic.ai_summary) {
      return NextResponse.json({
        success: true,
        data: {
          topicId: topic.id,
          aiSummary: topic.ai_summary,
          cached: true,
        },
      });
    }

    // 抽出テキストがない場合
    if (!topic.excerpt_text) {
      return NextResponse.json(
        { success: false, error: "No excerpt_text available for this topic" },
        { status: 400 }
      );
    }

    // AI要約を生成
    const aiSummary = await generateSummary(
      topic.excerpt_text,
      topic.questioner,
      topic.answerer
    );

    // DBに保存
    await supabase
      .from("topics")
      .update({ ai_summary: aiSummary })
      .eq("id", topicId);

    return NextResponse.json({
      success: true,
      data: {
        topicId: topic.id,
        aiSummary,
        cached: false,
      },
    });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// 企業のトピックを一括要約
export async function POST(request: NextRequest) {
  console.log("=== /api/v2/topics/summarize POST ===");

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
    const body: SummarizeRequest = await request.json();
    const { companyId, forceUpdate = false } = body;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "companyId is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // excerpt_textがあり、ai_summaryがないトピックを取得
    let query = supabase
      .from("topics")
      .select("id, title, excerpt_text, questioner, answerer, ai_summary")
      .eq("company_id", companyId)
      .not("excerpt_text", "is", null);

    if (!forceUpdate) {
      query = query.is("ai_summary", null);
    }

    const { data: topics, error } = await query;

    if (error) {
      throw error;
    }

    if (!topics || topics.length === 0) {
      return NextResponse.json({
        success: true,
        message: "対象のトピックがありません",
        processed: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
      });
    }

    console.log(`Processing ${topics.length} topics for company ${companyId}`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const results: Array<{
      topicId: string;
      title: string;
      status: string;
      reason?: string;
    }> = [];

    for (const topic of topics) {
      // 抽出テキストがない場合はスキップ
      if (!topic.excerpt_text) {
        skipped++;
        results.push({
          topicId: topic.id,
          title: topic.title || "",
          status: "skipped",
          reason: "No excerpt_text",
        });
        continue;
      }

      try {
        // AI要約を生成
        const aiSummary = await generateSummary(
          topic.excerpt_text,
          topic.questioner,
          topic.answerer
        );

        // DBに保存
        const { error: updateError } = await supabase
          .from("topics")
          .update({ ai_summary: aiSummary })
          .eq("id", topic.id);

        if (updateError) {
          failed++;
          results.push({
            topicId: topic.id,
            title: topic.title || "",
            status: "error",
            reason: updateError.message,
          });
        } else {
          updated++;
          results.push({
            topicId: topic.id,
            title: topic.title || "",
            status: "updated",
          });
        }
      } catch (err) {
        failed++;
        results.push({
          topicId: topic.id,
          title: topic.title || "",
          status: "error",
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    console.log(`Summarize complete: ${updated} updated, ${skipped} skipped, ${failed} failed`);

    return NextResponse.json({
      success: true,
      message: `${updated}件のトピックにAI要約を生成しました`,
      processed: topics.length,
      updated,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
