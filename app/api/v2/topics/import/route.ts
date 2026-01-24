import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../../lib/supabase";

interface CSVRow {
  company_id?: string;
  prefecture?: string;
  city?: string;
  council_date?: string;
  title?: string;
  summary?: string;
  questioner?: string;
  answerer?: string;
  source_url?: string;
  group_id?: string;
  start_sec?: string;
  end_sec?: string;
  excerpt_text?: string;
  excerpt_range?: string;
  [key: string]: string | undefined;
}

// CSVパース関数
function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  // ヘッダー行を取得
  const headers = parseCSVLine(lines[0]);

  // データ行をパース
  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: CSVRow = {};

    headers.forEach((header, index) => {
      const key = normalizeHeader(header);
      row[key] = values[index]?.trim() || "";
    });

    rows.push(row);
  }

  return rows;
}

// CSV行をパース（クォート対応）
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// ヘッダー名を正規化
function normalizeHeader(header: string): string {
  const mapping: Record<string, string> = {
    // 日本語 → 英語
    企業ID: "company_id",
    企業id: "company_id",
    都道府県: "prefecture",
    市町村: "city",
    議会日付: "council_date",
    "議会の日付": "council_date",
    議題タイトル: "title",
    タイトル: "title",
    議題概要: "summary",
    概要: "summary",
    質問者: "questioner",
    回答者: "answerer",
    ソースURL: "source_url",
    URL: "source_url",
    グループID: "group_id",
    "group_id": "group_id",
    開始秒数: "start_sec",
    終了秒数: "end_sec",
    抽出テキスト: "excerpt_text",
    抽出範囲: "excerpt_range",
  };

  const normalized = header.trim().toLowerCase().replace(/\s+/g, "_");
  return mapping[header.trim()] || mapping[normalized] || normalized;
}

// company_row_keyを生成
function generateRowKey(row: CSVRow, index: number): string {
  const parts = [
    row.company_id || "UNKNOWN",
    row.prefecture || "",
    row.city || "",
    row.council_date || "",
    index.toString().padStart(4, "0"),
  ];
  return parts.join("_").replace(/[^a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, "");
}

export async function POST(request: NextRequest) {
  console.log("=== /api/v2/topics/import POST ===");

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const companyId = formData.get("companyId") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "companyId is required" },
        { status: 400 }
      );
    }

    // ファイル内容を読み取り
    const text = await file.text();
    const rows = parseCSV(text);

    console.log(`CSV parsed: ${rows.length} rows`);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "No data in CSV file" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // バッチインサート用のデータを準備
    const topics = rows.map((row, index) => ({
      company_id: companyId,
      company_row_key: generateRowKey({ ...row, company_id: companyId }, index),
      prefecture: row.prefecture || null,
      city: row.city || null,
      council_date: row.council_date || null,
      title: row.title || null,
      summary: row.summary || null,
      questioner: row.questioner || null,
      answerer: row.answerer || null,
      source_url: row.source_url || null,
      group_id: row.group_id || null,
      start_sec: row.start_sec ? parseInt(row.start_sec, 10) : null,
      end_sec: row.end_sec ? parseInt(row.end_sec, 10) : null,
      excerpt_text: row.excerpt_text || null,
      excerpt_range: row.excerpt_range || null,
      status: "未着手",
      priority: "B", // 初期はBランク、AI判定後に更新
      dispatch_status: "NOT_SENT",
    }));

    // Supabaseにインサート（upsert）
    const { data, error } = await supabase
      .from("topics")
      .upsert(topics, {
        onConflict: "company_row_key",
        ignoreDuplicates: false,
      })
      .select("id");

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log(`Inserted/Updated: ${data?.length || 0} topics`);

    return NextResponse.json({
      success: true,
      message: `${data?.length || 0}件のトピックをインポートしました`,
      count: data?.length || 0,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
