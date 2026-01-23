import { NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../lib/supabase";

export async function GET() {
  console.log("=== /api/companies デバッグ情報 ===");

  // Supabaseが設定されている場合はSupabaseを使用
  if (isSupabaseConfigured()) {
    console.log("Supabaseから企業データを取得");

    try {
      const supabase = createServerSupabaseClient();

      const { data, error } = await supabase
        .from("companies")
        .select("company_id, company_name, company_file_id")
        .order("company_name", { ascending: true });

      if (error) {
        console.error("Supabaseエラー:", error);
        throw error;
      }

      // フロントエンド用にキャメルケースに変換
      const companies = (data || []).map((c) => ({
        companyId: c.company_id,
        companyName: c.company_name,
        companyFileId: c.company_file_id || "",
      }));

      console.log("企業データ取得成功:", companies.length, "件");

      return NextResponse.json({
        success: true,
        data: companies,
      });
    } catch (error) {
      console.error("Supabaseエラー:", error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  }

  // Supabaseが設定されていない場合はGASにフォールバック
  console.log("Supabase未設定のためGASを使用");

  const gasEndpoint = process.env.GAS_ENDPOINT;
  const masterSpreadsheetId = process.env.MASTER_SPREADSHEET_ID;

  if (!gasEndpoint) {
    return NextResponse.json(
      { success: false, error: "No data source configured" },
      { status: 500 }
    );
  }

  try {
    const url = new URL(gasEndpoint);
    url.searchParams.set("action", "getCompanies");
    if (masterSpreadsheetId) {
      url.searchParams.set("spreadsheetId", masterSpreadsheetId);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });

    const responseText = await response.text();

    if (responseText.startsWith("<")) {
      throw new Error("GAS returned HTML");
    }

    const result = JSON.parse(responseText);

    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to fetch companies");
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error("GASエラー:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
