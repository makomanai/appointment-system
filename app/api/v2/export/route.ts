import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../lib/supabase";

// CSVエクスポート（企業ごとにダウンロード可能）
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
    const format = searchParams.get("format") || "csv";
    const status = searchParams.get("status"); // フィルタ: 完了のみなど

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "companyId is required" },
        { status: 400 }
      );
    }

    // トピックと最新の架電結果を取得
    let query = supabase
      .from("topics")
      .select(`
        company_row_key,
        prefecture,
        city,
        council_date,
        title,
        summary,
        questioner,
        answerer,
        source_url,
        status,
        priority,
        call_results(
          call_result,
          next_action,
          next_date,
          memo,
          contact_name,
          department,
          phone,
          logged_at
        )
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("エクスポートデータ取得エラー:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 最新の架電結果を結合してフラットな構造に
    const exportData = data?.map((topic) => {
      const callResults = topic.call_results as Array<{
        call_result: string;
        next_action: string;
        next_date: string;
        memo: string;
        contact_name: string;
        department: string;
        phone: string;
        logged_at: string;
      }>;
      const latestCall = callResults?.sort(
        (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
      )[0];

      return {
        company_row_key: topic.company_row_key,
        prefecture: topic.prefecture,
        city: topic.city,
        council_date: topic.council_date,
        title: topic.title,
        summary: topic.summary,
        questioner: topic.questioner,
        answerer: topic.answerer,
        source_url: topic.source_url,
        status: topic.status,
        priority: topic.priority,
        call_result: latestCall?.call_result || "",
        next_action: latestCall?.next_action || "",
        next_date: latestCall?.next_date || "",
        memo: latestCall?.memo || "",
        contact_name: latestCall?.contact_name || "",
        department: latestCall?.department || "",
        phone: latestCall?.phone || "",
        logged_at: latestCall?.logged_at || "",
      };
    });

    if (format === "json") {
      return NextResponse.json({
        success: true,
        data: exportData,
      });
    }

    // CSVフォーマット
    const headers = [
      "管理キー",
      "都道府県",
      "市町村",
      "議会日付",
      "議題タイトル",
      "議題概要",
      "質問者",
      "回答者",
      "ソースURL",
      "ステータス",
      "優先度",
      "架電結果",
      "次のアクション",
      "次回日程",
      "メモ",
      "担当者名",
      "部署名",
      "電話番号",
      "記録日時",
    ];

    const csvRows = [
      headers.join(","),
      ...(exportData || []).map((row) =>
        [
          row.company_row_key,
          row.prefecture,
          row.city,
          row.council_date,
          `"${(row.title || "").replace(/"/g, '""')}"`,
          `"${(row.summary || "").replace(/"/g, '""')}"`,
          row.questioner,
          row.answerer,
          row.source_url,
          row.status,
          row.priority,
          row.call_result,
          row.next_action,
          row.next_date,
          `"${(row.memo || "").replace(/"/g, '""')}"`,
          row.contact_name,
          row.department,
          row.phone,
          row.logged_at,
        ].join(",")
      ),
    ];

    const csv = csvRows.join("\n");

    // BOM付きUTF-8でCSVを返す（Excelで文字化けしないように）
    const bom = "\uFEFF";
    const csvWithBom = bom + csv;

    return new NextResponse(csvWithBom, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="export_${companyId}_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("エクスポートエラー:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
