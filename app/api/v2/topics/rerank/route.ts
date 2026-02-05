/**
 * 統合AI判定 - サービス情報 + SRTテキストでトピックを再ランク付け
 *
 * POST: 既存トピックをAI判定で再ランク付け
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../../lib/supabase";
import { rankTopicWithAI, getServiceInfoForCompany } from "../../../../lib/connector/ai-ranker";

export async function POST(request: NextRequest) {
  console.log("=== /api/v2/topics/rerank POST ===");

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
    const { companyId, limit = 50 } = body;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "companyId is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // サービス情報を取得
    const serviceInfo = await getServiceInfoForCompany(companyId, supabase);
    console.log("Service info:", serviceInfo?.name || "なし");

    // 対象トピックを取得
    // 除外条件:
    // - is_archived = true (アーカイブ済み)
    // - priority = C (C判定済み)
    // - status = 完了 (完了済み)
    // - ai_ranked_at IS NOT NULL (AI判定済み)
    const { data: topics, error } = await supabase
      .from("topics")
      .select("id, title, summary, excerpt_text, priority, status, ai_ranked_at")
      .eq("company_id", companyId)
      .eq("is_archived", false)
      .neq("status", "完了")
      .is("ai_ranked_at", null) // AI判定がまだのもののみ
      .limit(limit);

    if (error) {
      throw error;
    }

    if (!topics || topics.length === 0) {
      return NextResponse.json({
        success: true,
        message: "未ランク付けのトピックがありません（AI判定済み、C判定、完了、アーカイブは除外）",
        summary: { A: 0, B: 0, C: 0 },
        processed: 0,
      });
    }

    console.log(`Processing ${topics.length} topics for ${companyId}`);

    // AI判定実行
    const results = [];
    const rankCounts = { A: 0, B: 0, C: 0 };

    for (let i = 0; i < topics.length; i++) {
      const topic = topics[i];

      try {
        const aiResult = await rankTopicWithAI(
          topic.title || "",
          topic.summary || "",
          topic.excerpt_text || "",
          serviceInfo,
          0 // zeroOrderScore (既存トピックなので0)
        );

        results.push({
          topicId: topic.id,
          title: topic.title,
          oldPriority: topic.priority,
          newPriority: aiResult.priority,
          rank: aiResult.rank,
          score: aiResult.score,
          reasoning: aiResult.reasoning,
        });

        rankCounts[aiResult.priority]++;

        // DBを更新（priority + ai_ranked_at）
        await supabase
          .from("topics")
          .update({
            priority: aiResult.priority,
            ai_ranked_at: new Date().toISOString(), // AI判定済みフラグ
          })
          .eq("id", topic.id);

        // 進捗ログ
        if ((i + 1) % 10 === 0) {
          console.log(`Progress: ${i + 1}/${topics.length}`);
        }
      } catch (err) {
        console.error(`Error ranking topic ${topic.id}:`, err);
        results.push({
          topicId: topic.id,
          title: topic.title,
          oldPriority: topic.priority,
          newPriority: topic.priority,
          rank: "B",
          score: 0,
          reasoning: `エラー: ${err instanceof Error ? err.message : "Unknown"}`,
          error: true,
        });
      }
    }

    console.log("Rank distribution:", rankCounts);

    return NextResponse.json({
      success: true,
      message: `${topics.length}件のトピックをAI判定しました`,
      summary: rankCounts,
      processed: topics.length,
      results,
      serviceUsed: serviceInfo?.name || null,
    });
  } catch (error) {
    console.error("Rerank error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
