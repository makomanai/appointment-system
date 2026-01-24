import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../lib/supabase";
import { Company, InsertCompany } from "../../../types/database";

// 企業一覧取得
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .order("company_name", { ascending: true });

    if (error) {
      console.error("企業一覧取得エラー:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data as Company[],
    });
  } catch (error) {
    console.error("企業一覧取得エラー:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// 次のcompany_idを自動生成（C001, C002, ... の形式）
async function getNextCompanyId(supabase: ReturnType<typeof createServerSupabaseClient>): Promise<string> {
  const { data } = await supabase
    .from("companies")
    .select("company_id")
    .order("company_id", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) {
    return "C001";
  }

  // C001, C002 形式からIDを抽出して最大値を取得
  let maxNum = 0;
  for (const row of data) {
    const match = row.company_id?.match(/^C(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  return `C${nextNum.toString().padStart(3, "0")}`;
}

// 企業追加
export async function POST(request: NextRequest) {
  console.log("=== /api/v2/companies POST ===");

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    console.log("リクエストボディ:", JSON.stringify(body, null, 2));

    // バリデーション
    if (!body.company_name) {
      return NextResponse.json(
        { success: false, error: "company_name は必須です" },
        { status: 400 }
      );
    }

    // company_idを自動採番
    const companyId = await getNextCompanyId(supabase);
    console.log("自動採番されたcompany_id:", companyId);

    // company_file_idを自動生成（互換性のため）
    const generateFileId = () => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      let result = "";
      for (let i = 0; i < 40; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    const insertData: InsertCompany = {
      company_id: companyId,
      company_name: body.company_name,
      company_file_id: body.company_file_id || generateFileId(),
      script_base: body.script_base || null,
    };

    console.log("挿入データ:", JSON.stringify(insertData, null, 2));

    const { data, error } = await supabase
      .from("companies")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("企業追加エラー:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data as Company,
    });
  } catch (error) {
    console.error("企業追加エラー:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
