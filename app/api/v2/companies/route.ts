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
    if (!body.company_id || !body.company_name) {
      return NextResponse.json(
        { success: false, error: "company_id と company_name は必須です" },
        { status: 400 }
      );
    }

    const insertData: InsertCompany = {
      company_id: body.company_id,
      company_name: body.company_name,
      company_file_id: body.company_file_id || null,
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
