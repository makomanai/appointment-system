import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../../lib/supabase";

interface SRTEntry {
  index: number;
  startTime: string;
  endTime: string;
  startSec: number;
  endSec: number;
  text: string;
}

// タイムスタンプを秒数に変換
function parseTimeToSeconds(time: string): number {
  // 00:00:00,000 形式
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

  // 改行を統一
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // ブロックに分割（空行で区切る）
  const blocks = normalized.split(/\n\n+/).filter(block => block.trim());

  for (const block of blocks) {
    const lines = block.split("\n").filter(line => line.trim());

    if (lines.length < 2) continue;

    // 最初の行はインデックス番号
    const indexLine = lines[0].trim();
    const index = parseInt(indexLine, 10);
    if (isNaN(index)) continue;

    // 2行目はタイムスタンプ
    const timeLine = lines[1].trim();
    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!timeMatch) continue;

    const startTime = timeMatch[1];
    const endTime = timeMatch[2];

    // 3行目以降はテキスト
    const text = lines.slice(2).join("\n");

    entries.push({
      index,
      startTime,
      endTime,
      startSec: parseTimeToSeconds(startTime),
      endSec: parseTimeToSeconds(endTime),
      text,
    });
  }

  return entries;
}

// SRTエントリをグループ化（連続するエントリを結合）
function groupEntries(
  entries: SRTEntry[],
  maxGapSeconds: number = 2.0,
  minDurationSeconds: number = 30.0
): SRTEntry[] {
  if (entries.length === 0) return [];

  const groups: SRTEntry[] = [];
  let currentGroup: SRTEntry | null = null;

  for (const entry of entries) {
    if (!currentGroup) {
      currentGroup = { ...entry };
      continue;
    }

    // 前のエントリとのギャップをチェック
    const gap = entry.startSec - currentGroup.endSec;
    const currentDuration = currentGroup.endSec - currentGroup.startSec;

    // ギャップが小さく、グループが短い場合は結合
    if (gap <= maxGapSeconds && currentDuration < minDurationSeconds) {
      currentGroup.endTime = entry.endTime;
      currentGroup.endSec = entry.endSec;
      currentGroup.text += "\n" + entry.text;
    } else {
      // グループを確定して新しいグループを開始
      groups.push(currentGroup);
      currentGroup = { ...entry };
    }
  }

  // 最後のグループを追加
  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

// SRTファイルをパース（グループ化オプション付き）
export async function POST(request: NextRequest) {
  console.log("=== /api/v2/srt/parse POST ===");

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const groupIdParam = formData.get("groupId") as string | null;
    const doGroup = formData.get("group") === "true";
    const maxGap = parseFloat(formData.get("maxGap") as string) || 2.0;
    const minDuration = parseFloat(formData.get("minDuration") as string) || 30.0;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    // ファイル内容を読み取り
    const content = await file.text();
    const entries = parseSRT(content);

    if (entries.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid SRT entries found" },
        { status: 400 }
      );
    }

    // グループ化
    const result = doGroup ? groupEntries(entries, maxGap, minDuration) : entries;

    // 統計情報
    const stats = {
      totalEntries: entries.length,
      groupedEntries: result.length,
      totalDuration: entries.length > 0
        ? entries[entries.length - 1].endSec - entries[0].startSec
        : 0,
    };

    // groupIdが指定されていればSRTインデックスに保存
    if (groupIdParam && isSupabaseConfigured()) {
      const supabase = createServerSupabaseClient();
      await supabase
        .from("srt_index")
        .upsert({
          group_id: groupIdParam,
          file_id: "", // Google DriveのIDは後で設定
          file_name: file.name,
        }, { onConflict: "group_id" });
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      groupId: groupIdParam,
      stats,
      entries: result,
    });
  } catch (error) {
    console.error("SRT parse error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
