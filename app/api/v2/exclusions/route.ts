/**
 * 企業別除外リストAPI
 *
 * GET: 除外リスト取得
 * POST: CSVアップロードで除外リスト登録
 * DELETE: 除外リスト削除
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

interface ExclusionRow {
  id: string;
  company_id: string;
  prefecture: string | null;
  city: string | null;
  reason: string | null;
  created_at: string;
}

/**
 * 除外リスト取得
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
      .from("company_exclusions")
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
      data: data as ExclusionRow[],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error("Exclusions GET error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * CSVから除外リストを登録
 */
export async function POST(request: NextRequest) {
  console.log("=== /api/v2/exclusions POST ===");

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
        .from("company_exclusions")
        .delete()
        .eq("company_id", companyId);
      console.log(`[Exclusions] 既存データを削除: ${companyId}`);
    }

    // CSVをパース
    const rows = parseExclusionCSV(csvText);
    console.log(`[Exclusions] CSVパース完了: ${rows.length}件`);

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
      reason: row.reason || null,
    }));

    // upsertで登録（重複は更新）
    const { data, error } = await supabase
      .from("company_exclusions")
      .upsert(insertData, {
        onConflict: "company_id,prefecture,city",
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      throw error;
    }

    console.log(`[Exclusions] 登録完了: ${data?.length || 0}件`);

    return NextResponse.json({
      success: true,
      message: `${data?.length || 0}件の除外ルールを登録しました`,
      imported: data?.length || 0,
      data,
    });
  } catch (error) {
    console.error("Exclusions POST error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * 除外リストを削除
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
    const { companyId, exclusionId } = body;

    if (!companyId && !exclusionId) {
      return NextResponse.json(
        { success: false, error: "companyIdまたはexclusionIdが必要です" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    let query = supabase.from("company_exclusions").delete();

    if (exclusionId) {
      // 特定の除外ルールを削除
      query = query.eq("id", exclusionId);
    } else if (companyId) {
      // 企業の全除外ルールを削除
      query = query.eq("company_id", companyId);
    }

    const { error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: exclusionId
        ? "除外ルールを削除しました"
        : `${companyId}の全除外ルールを削除しました`,
    });
  } catch (error) {
    console.error("Exclusions DELETE error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * CSVテキストを除外ルール配列に変換
 */
function parseExclusionCSV(csvText: string): Array<{
  prefecture: string;
  city: string;
  reason: string;
}> {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 1) return [];

  const rows: Array<{ prefecture: string; city: string; reason: string }> = [];

  // ヘッダー行をスキップするかどうか判定
  const firstLine = lines[0].toLowerCase();
  const startIndex =
    firstLine.includes("都道府県") ||
    firstLine.includes("prefecture") ||
    firstLine.includes("市") ||
    firstLine.includes("理由")
      ? 1
      : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    // 最低1つの値があれば有効
    const prefecture = values[0]?.trim() || "";
    const city = values[1]?.trim() || "";
    const reason = values[2]?.trim() || "";

    // 都道府県または市区町村が必要
    if (!prefecture && !city) continue;

    rows.push({ prefecture, city, reason });
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
