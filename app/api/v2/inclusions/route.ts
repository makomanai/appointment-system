/**
 * 企業別アプローチ先リスト（ホワイトリスト）API
 *
 * GET: アプローチ先リスト取得
 * POST: CSVアップロードでアプローチ先登録
 * DELETE: アプローチ先削除
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

interface InclusionRow {
  id: string;
  company_id: string;
  prefecture: string | null;
  city: string | null;
  memo: string | null;
  created_at: string;
}

/**
 * アプローチ先リスト取得
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get("companyId");

    let query = supabase
      .from("company_inclusions")
      .select("*")
      .order("prefecture")
      .order("city");

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: data as InclusionRow[],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error("Inclusions GET error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * CSVからアプローチ先リストを登録
 */
export async function POST(request: NextRequest) {
  console.log("=== /api/v2/inclusions POST ===");

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    let csvText: string;
    let companyId: string;
    let clearExisting = false;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      companyId = formData.get("companyId") as string;
      clearExisting = formData.get("clearExisting") === "true";

      if (!file) {
        return NextResponse.json(
          { success: false, error: "CSVファイルが必要です" },
          { status: 400 }
        );
      }

      csvText = await file.text();
    } else {
      const body = await request.json();
      csvText = body.csvText;
      companyId = body.companyId;
      clearExisting = body.clearExisting || false;
    }

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "companyIdが必要です" },
        { status: 400 }
      );
    }

    if (!csvText) {
      return NextResponse.json(
        { success: false, error: "CSVデータが必要です" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 既存データを削除（オプション）
    if (clearExisting) {
      await supabase
        .from("company_inclusions")
        .delete()
        .eq("company_id", companyId);
      console.log(`[Inclusions] 既存データを削除: ${companyId}`);
    }

    // CSVをパース
    const rows = parseInclusionCSV(csvText);
    console.log(`[Inclusions] CSVパース完了: ${rows.length}件`);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "有効なデータがありません" },
        { status: 400 }
      );
    }

    // 登録データを作成
    const insertData = rows.map((row) => ({
      company_id: companyId,
      prefecture: row.prefecture || null,
      city: row.city || null,
      memo: row.memo || null,
    }));

    // upsertで登録（重複は更新）
    const { data, error } = await supabase
      .from("company_inclusions")
      .upsert(insertData, {
        onConflict: "company_id,prefecture,city",
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      throw error;
    }

    console.log(`[Inclusions] 登録完了: ${data?.length || 0}件`);

    return NextResponse.json({
      success: true,
      message: `${data?.length || 0}件のアプローチ先を登録しました`,
      imported: data?.length || 0,
      data,
    });
  } catch (error) {
    console.error("Inclusions POST error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * アプローチ先リストを削除
 */
export async function DELETE(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { companyId, inclusionId } = body;

    if (!companyId && !inclusionId) {
      return NextResponse.json(
        { success: false, error: "companyIdまたはinclusionIdが必要です" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    let query = supabase.from("company_inclusions").delete();

    if (inclusionId) {
      // 特定のアプローチ先を削除
      query = query.eq("id", inclusionId);
    } else if (companyId) {
      // 企業の全アプローチ先を削除
      query = query.eq("company_id", companyId);
    }

    const { error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: inclusionId
        ? "アプローチ先を削除しました"
        : `${companyId}の全アプローチ先を削除しました`,
    });
  } catch (error) {
    console.error("Inclusions DELETE error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * CSVテキストをアプローチ先配列に変換
 */
function parseInclusionCSV(csvText: string): Array<{
  prefecture: string;
  city: string;
  memo: string;
}> {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 1) return [];

  const rows: Array<{ prefecture: string; city: string; memo: string }> = [];

  // ヘッダー行をスキップするかどうか判定
  const firstLine = lines[0].toLowerCase();
  const startIndex =
    firstLine.includes("都道府県") ||
    firstLine.includes("prefecture") ||
    firstLine.includes("市") ||
    firstLine.includes("メモ")
      ? 1
      : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    // 最低1つの値があれば有効
    const prefecture = values[0]?.trim() || "";
    const city = values[1]?.trim() || "";
    const memo = values[2]?.trim() || "";

    // 都道府県または市区町村が必要
    if (!prefecture && !city) continue;

    rows.push({ prefecture, city, memo });
  }

  return rows;
}

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
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
