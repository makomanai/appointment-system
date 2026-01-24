import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../../lib/supabase";

interface SRTEntry {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

// タイムスタンプを秒数に変換
function parseTimeToSeconds(time: string): number {
  const match = time.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const milliseconds = parseInt(match[4], 10);

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

// SRTファイルをパース
function parseSRT(content: string): SRTEntry[] {
  const entries: SRTEntry[] = [];
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n\n+/).filter(block => block.trim());

  for (const block of blocks) {
    const lines = block.split("\n").filter(line => line.trim());
    if (lines.length < 2) continue;

    const indexLine = lines[0].trim();
    const index = parseInt(indexLine, 10);
    if (isNaN(index)) continue;

    const timeLine = lines[1].trim();
    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!timeMatch) continue;

    const startSec = parseTimeToSeconds(timeMatch[1]);
    const endSec = parseTimeToSeconds(timeMatch[2]);
    const text = lines.slice(2).join("\n");

    entries.push({ index, startSec, endSec, text });
  }

  return entries;
}

// 指定された時間範囲のテキストを抽出
function extractTextForRange(entries: SRTEntry[], startSec: number, endSec: number): string {
  const relevantEntries = entries.filter(entry => {
    // エントリが指定範囲と重なっているかチェック
    return entry.endSec >= startSec && entry.startSec <= endSec;
  });

  return relevantEntries.map(e => e.text).join("\n");
}

// SRTをアップロードしてトピックに紐付け
export async function POST(request: NextRequest) {
  console.log("=== /api/v2/srt/link POST ===");

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const groupId = formData.get("groupId") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: "groupId is required" },
        { status: 400 }
      );
    }

    // SRTをパース
    const content = await file.text();
    const entries = parseSRT(content);

    if (entries.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid SRT entries found" },
        { status: 400 }
      );
    }

    console.log(`Parsed ${entries.length} SRT entries for group ${groupId}`);

    const supabase = createServerSupabaseClient();

    // このグループIDのトピックを取得
    const { data: topics, error: fetchError } = await supabase
      .from("topics")
      .select("id, title, start_sec, end_sec, excerpt_text")
      .eq("group_id", groupId);

    if (fetchError) {
      throw fetchError;
    }

    if (!topics || topics.length === 0) {
      return NextResponse.json({
        success: false,
        error: `No topics found with group_id: ${groupId}`,
      }, { status: 404 });
    }

    console.log(`Found ${topics.length} topics with group_id: ${groupId}`);

    // 各トピックの時間範囲に該当するテキストを抽出して更新
    const results = [];
    let updatedCount = 0;
    let skippedCount = 0;

    for (const topic of topics) {
      const startSec = topic.start_sec;
      const endSec = topic.end_sec;

      if (startSec == null || endSec == null) {
        skippedCount++;
        results.push({
          topicId: topic.id,
          title: topic.title,
          status: "skipped",
          reason: "start_sec or end_sec is null",
        });
        continue;
      }

      // 該当範囲のテキストを抽出
      const excerptText = extractTextForRange(entries, startSec, endSec);

      if (!excerptText) {
        skippedCount++;
        results.push({
          topicId: topic.id,
          title: topic.title,
          status: "skipped",
          reason: "No text found in time range",
        });
        continue;
      }

      // トピックを更新
      const { error: updateError } = await supabase
        .from("topics")
        .update({ excerpt_text: excerptText })
        .eq("id", topic.id);

      if (updateError) {
        results.push({
          topicId: topic.id,
          title: topic.title,
          status: "error",
          reason: updateError.message,
        });
      } else {
        updatedCount++;
        results.push({
          topicId: topic.id,
          title: topic.title,
          status: "updated",
          excerptLength: excerptText.length,
        });
      }
    }

    console.log(`Updated: ${updatedCount}, Skipped: ${skippedCount}`);

    return NextResponse.json({
      success: true,
      message: `${updatedCount}件のトピックに抽出テキストを紐付けました`,
      groupId,
      srtEntries: entries.length,
      topicsFound: topics.length,
      updatedCount,
      skippedCount,
      results,
    });
  } catch (error) {
    console.error("SRT link error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
