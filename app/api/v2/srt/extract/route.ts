import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../../lib/supabase";

interface ExtractRequest {
  topicId: string;
  groupId: string;
  startSec: number;
  endSec: number;
  excerptText: string;
  excerptRange?: string;
}

// トピックにSRT抽出情報を紐付け
export async function POST(request: NextRequest) {
  console.log("=== /api/v2/srt/extract POST ===");

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const body: ExtractRequest = await request.json();
    const { topicId, groupId, startSec, endSec, excerptText, excerptRange } = body;

    if (!topicId) {
      return NextResponse.json(
        { success: false, error: "topicId is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // トピックを更新
    const { data, error } = await supabase
      .from("topics")
      .update({
        group_id: groupId || null,
        start_sec: startSec || null,
        end_sec: endSec || null,
        excerpt_text: excerptText || null,
        excerpt_range: excerptRange || null,
      })
      .eq("id", topicId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: "SRT抽出情報を保存しました",
      data,
    });
  } catch (error) {
    console.error("SRT extract error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// バッチで複数トピックにSRT情報を紐付け
export async function PUT(request: NextRequest) {
  console.log("=== /api/v2/srt/extract PUT ===");

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const body: { extracts: ExtractRequest[] } = await request.json();
    const { extracts } = body;

    if (!extracts || !Array.isArray(extracts) || extracts.length === 0) {
      return NextResponse.json(
        { success: false, error: "extracts array is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const extract of extracts) {
      const { topicId, groupId, startSec, endSec, excerptText, excerptRange } = extract;

      if (!topicId) {
        errorCount++;
        results.push({ topicId, success: false, error: "topicId missing" });
        continue;
      }

      const { error } = await supabase
        .from("topics")
        .update({
          group_id: groupId || null,
          start_sec: startSec || null,
          end_sec: endSec || null,
          excerpt_text: excerptText || null,
          excerpt_range: excerptRange || null,
        })
        .eq("id", topicId);

      if (error) {
        errorCount++;
        results.push({ topicId, success: false, error: error.message });
      } else {
        successCount++;
        results.push({ topicId, success: true });
      }
    }

    return NextResponse.json({
      success: true,
      message: `${successCount}件成功、${errorCount}件失敗`,
      successCount,
      errorCount,
      results,
    });
  } catch (error) {
    console.error("SRT extract batch error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
