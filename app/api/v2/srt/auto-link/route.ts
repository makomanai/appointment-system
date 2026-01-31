import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../../lib/supabase";
import { getSrtContentByGroupId, isGoogleDriveConfigured } from "../../../../lib/google-drive";

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
    return entry.endSec >= startSec && entry.startSec <= endSec;
  });

  return relevantEntries.map(e => e.text).join("\n");
}

// 企業のトピックに自動でSRTを紐付け
export async function POST(request: NextRequest) {
  console.log("=== /api/v2/srt/auto-link POST ===");

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  if (!isGoogleDriveConfigured()) {
    return NextResponse.json(
      { success: false, error: "Google Drive is not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { companyId } = body;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "companyId is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // excerpt_textが空で、group_idがあるトピックを取得
    const { data: topics, error: fetchError } = await supabase
      .from("topics")
      .select("id, title, group_id, start_sec, end_sec, excerpt_text")
      .eq("company_id", companyId)
      .not("group_id", "is", null);

    if (fetchError) {
      throw fetchError;
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

    // excerpt_textが空のトピックだけをフィルタ
    const topicsToProcess = topics.filter(t => !t.excerpt_text);

    console.log(`Processing ${topicsToProcess.length} topics for company ${companyId}`);

    // グループIDごとにSRTをキャッシュ
    const srtCache: Record<string, SRTEntry[] | null> = {};

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const results: Array<{
      topicId: string;
      title: string;
      status: string;
      reason?: string;
      excerptLength?: number;
    }> = [];

    for (const topic of topicsToProcess) {
      const groupId = topic.group_id;
      const startSec = topic.start_sec;
      const endSec = topic.end_sec;

      // 時間範囲がない場合はスキップ
      if (startSec == null || endSec == null) {
        skipped++;
        results.push({
          topicId: topic.id,
          title: topic.title || "",
          status: "skipped",
          reason: "start_sec or end_sec is null",
        });
        continue;
      }

      // SRTをキャッシュから取得、なければGoogle Driveから取得
      if (!(groupId in srtCache)) {
        try {
          console.log(`Fetching SRT for group: ${groupId}`);
          const srtContent = await getSrtContentByGroupId(groupId);
          srtCache[groupId] = srtContent ? parseSRT(srtContent) : null;
        } catch (err) {
          console.error(`Failed to fetch SRT for ${groupId}:`, err);
          srtCache[groupId] = null;
        }
      }

      const srtEntries = srtCache[groupId];
      if (!srtEntries) {
        skipped++;
        results.push({
          topicId: topic.id,
          title: topic.title || "",
          status: "skipped",
          reason: `SRT not found for group_id: ${groupId}`,
        });
        continue;
      }

      // 該当範囲のテキストを抽出
      const excerptText = extractTextForRange(srtEntries, startSec, endSec);

      if (!excerptText) {
        skipped++;
        results.push({
          topicId: topic.id,
          title: topic.title || "",
          status: "skipped",
          reason: "No text found in time range",
        });
        continue;
      }

      // トピックを更新
      console.log(`Updating topic ${topic.id} with excerpt_text length: ${excerptText.length}`);

      const { data: updateData, error: updateError } = await supabase
        .from("topics")
        .update({ excerpt_text: excerptText })
        .eq("id", topic.id)
        .select("id, excerpt_text");

      console.log(`Update result:`, { updateData, updateError });

      if (updateError) {
        failed++;
        results.push({
          topicId: topic.id,
          title: topic.title || "",
          status: "error",
          reason: updateError.message,
        });
      } else if (!updateData || updateData.length === 0) {
        failed++;
        results.push({
          topicId: topic.id,
          title: topic.title || "",
          status: "error",
          reason: "Update returned no data - topic may not exist",
        });
      } else {
        updated++;
        results.push({
          topicId: topic.id,
          title: topic.title || "",
          status: "updated",
          excerptLength: excerptText.length,
        });
      }
    }

    console.log(`Auto-link complete: ${updated} updated, ${skipped} skipped, ${failed} failed`);

    return NextResponse.json({
      success: true,
      message: `${updated}件のトピックにSRTを紐付けました`,
      processed: topicsToProcess.length,
      updated,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    console.error("Auto-link error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
