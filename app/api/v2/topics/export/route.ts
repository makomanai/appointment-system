/**
 * トピックCSVエクスポートAPI
 *
 * GET: アタックリストをCSV形式でダウンロード
 * - A/B判定のみ（C判定は除外）
 * - クライアントへの共有用
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../../lib/supabase";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const companyId = searchParams.get("companyId");

  console.log("=== /api/v2/topics/export GET ===");
  console.log("companyId:", companyId);

  if (!companyId) {
    return NextResponse.json(
      { success: false, error: "companyIdが必要です" },
      { status: 400 }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabaseが設定されていません" },
      { status: 503 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();

    // A/B判定のトピックを取得（C判定は除外）
    const { data: topics, error } = await supabase
      .from("topics")
      .select(`
        id,
        prefecture,
        city,
        council_date,
        title,
        summary,
        questioner,
        answerer,
        source_url,
        excerpt_text,
        status,
        priority,
        created_at
      `)
      .eq("company_id", companyId)
      .eq("is_archived", false)
      .neq("priority", "C")
      .order("priority", { ascending: true })  // A -> B の順
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabaseエラー:", error);
      throw error;
    }

    if (!topics || topics.length === 0) {
      return NextResponse.json(
        { success: false, error: "エクスポートするデータがありません" },
        { status: 404 }
      );
    }

    // CSVヘッダー（アタックリスト用に厳選）
    const headers = [
      "優先度",
      "ステータス",
      "都道府県",
      "市区町村",
      "議会日付",
      "議題タイトル",
      "議題概要",
      "質問者",
      "回答者",
      "動画URL",
      "登録日",
    ];

    // CSVデータを生成（長いテキストは切り詰め）
    const csvRows = topics.map((topic) => [
      topic.priority || "",
      topic.status || "未着手",
      topic.prefecture || "",
      topic.city || "",
      topic.council_date || "",
      escapeCSV(truncateText(topic.title || "", 100)),
      escapeCSV(truncateText(topic.summary || "", 300)),
      escapeCSV(topic.questioner || ""),
      escapeCSV(topic.answerer || ""),
      topic.source_url || "",
      topic.created_at ? new Date(topic.created_at).toLocaleDateString("ja-JP") : "",
    ]);

    // CSVテキスト生成
    const csvContent = [
      headers.join(","),
      ...csvRows.map((row) => row.join(",")),
    ].join("\n");

    // BOM付きUTF-8でレスポンス（Excelで文字化けしないように）
    const bom = "\uFEFF";
    const csvWithBom = bom + csvContent;

    // 企業名を取得してファイル名に使用
    const { data: company } = await supabase
      .from("companies")
      .select("company_name")
      .eq("company_id", companyId)
      .single();

    const companyName = company?.company_name || companyId;
    const today = new Date().toISOString().split("T")[0];
    const filename = `アタックリスト_${companyName}_${today}.csv`;

    console.log(`CSVエクスポート: ${topics.length}件, ファイル名: ${filename}`);

    return new NextResponse(csvWithBom, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
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

/**
 * テキストを指定文字数で切り詰め
 */
function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * CSV用にエスケープ（ダブルクォートと改行を処理）
 */
function escapeCSV(value: string): string {
  if (!value) return "";

  // 改行をスペースに置換
  let escaped = value.replace(/[\r\n]+/g, " ");

  // ダブルクォートをエスケープ
  escaped = escaped.replace(/"/g, '""');

  // 常にクォートで囲む（安全のため）
  return `"${escaped}"`;
}
