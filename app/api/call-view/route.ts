import { NextRequest, NextResponse } from "next/server";
import { CallResultForm } from "../../types";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../lib/supabase";

interface UpdateCallViewRequest {
  companyFileId: string;
  companyRowKey: string;
  formData: CallResultForm;
}

export async function POST(request: NextRequest) {
  console.log("=== /api/call-view POST デバッグ情報 ===");

  try {
    const body: UpdateCallViewRequest = await request.json();
    console.log("リクエストボディ:", JSON.stringify(body, null, 2));

    const { companyRowKey, formData } = body;

    if (!companyRowKey) {
      return NextResponse.json(
        { success: false, error: "companyRowKey is required" },
        { status: 400 }
      );
    }

    // Supabaseが設定されている場合はSupabaseを使用
    if (isSupabaseConfigured()) {
      console.log("Supabaseに保存");

      const supabase = createServerSupabaseClient();

      // トピックを更新
      const { error: topicError } = await supabase
        .from("topics")
        .update({
          status: formData.status,
          priority: formData.priority,
        })
        .eq("company_row_key", companyRowKey);

      if (topicError) {
        console.error("トピック更新エラー:", topicError);
        throw topicError;
      }

      // トピックIDを取得
      const { data: topic } = await supabase
        .from("topics")
        .select("id")
        .eq("company_row_key", companyRowKey)
        .single();

      // 架電結果を保存
      if (topic?.id && formData.callResult) {
        const { error: callError } = await supabase.from("call_results").insert({
          topic_id: topic.id,
          call_result: formData.callResult || null,
          next_action: formData.nextAction || null,
          next_date: formData.nextDate || null,
          memo: formData.memo || null,
        });

        if (callError) {
          console.error("架電結果保存エラー:", callError);
        }
      }

      console.log("Supabase更新成功");
      return NextResponse.json({ success: true });
    }

    // Supabaseが設定されていない場合はGASを使用
    console.log("GASに保存");

    const gasEndpoint = process.env.GAS_ENDPOINT_WRITE || process.env.GAS_ENDPOINT;
    if (!gasEndpoint) {
      return NextResponse.json(
        { success: false, error: "No data source configured" },
        { status: 500 }
      );
    }

    const { companyFileId } = body;

    const response = await fetch(gasEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "updateCallView",
        spreadsheetId: companyFileId,
        rowKey: companyRowKey,
        data: {
          status: formData.status,
          priority: formData.priority,
          callResult: formData.callResult,
          nextAction: formData.nextAction,
          nextDate: formData.nextDate,
          memo: formData.memo,
        },
      }),
    });

    const responseText = await response.text();

    if (responseText.startsWith("<")) {
      throw new Error("GAS returned HTML");
    }

    const result = JSON.parse(responseText);

    if (!response.ok || (!result.success && !result.ok)) {
      throw new Error(result.error || "Failed to update");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POSTエラー:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const companyFileId = searchParams.get("companyFileId");
  const companyId = searchParams.get("companyId");

  console.log("=== /api/call-view GET デバッグ情報 ===");
  console.log("companyFileId:", companyFileId);
  console.log("companyId:", companyId);

  // Supabaseが設定されている場合はSupabaseを使用
  if (isSupabaseConfigured()) {
    console.log("Supabaseからデータを取得");

    try {
      const supabase = createServerSupabaseClient();

      // companyFileIdからcompany_idを取得、またはcompanyIdを直接使用
      let targetCompanyId = companyId;

      if (!targetCompanyId && companyFileId) {
        const { data: company } = await supabase
          .from("companies")
          .select("company_id")
          .eq("company_file_id", companyFileId)
          .single();

        targetCompanyId = company?.company_id || null;
      }

      if (!targetCompanyId) {
        return NextResponse.json(
          { success: false, error: "Company not found" },
          { status: 404 }
        );
      }

      // トピックと最新の架電結果を取得
      const { data: topics, error } = await supabase
        .from("topics")
        .select(`
          id,
          company_id,
          company_row_key,
          prefecture,
          city,
          council_date,
          title,
          summary,
          questioner,
          answerer,
          source_url,
          group_id,
          start_sec,
          end_sec,
          excerpt_text,
          excerpt_range,
          status,
          priority,
          dispatch_status,
          script_draft,
          ai_summary,
          created_at,
          updated_at,
          call_results (
            call_result,
            next_action,
            next_date,
            memo,
            logged_at
          )
        `)
        .eq("company_id", targetCompanyId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabaseエラー:", error);
        throw error;
      }

      // デバッグ: 最初のトピックのデータを確認
      if (topics && topics.length > 0) {
        console.log("=== call-view デバッグ ===");
        console.log("取得トピック数:", topics.length);
        console.log("最初のトピック:", {
          id: topics[0].id,
          prefecture: topics[0].prefecture,
          city: topics[0].city,
          council_date: topics[0].council_date,
          title: topics[0].title?.substring(0, 30),
          excerpt_text_length: topics[0].excerpt_text?.length || 0,
          excerpt_text_preview: topics[0].excerpt_text?.substring(0, 50) || "NULL",
          ai_summary_length: topics[0].ai_summary?.length || 0,
        });
      }

      // フロントエンド用の形式に変換
      const callViewData = (topics || []).map((topic) => {
        // 最新の架電結果を取得
        const callResults = topic.call_results as Array<{
          call_result: string;
          next_action: string;
          next_date: string;
          memo: string;
          logged_at: string;
        }> || [];
        const latestCall = callResults.sort(
          (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
        )[0];

        return {
          companyRowKey: topic.company_row_key,
          council: `${topic.prefecture || ""}${topic.city || ""} / ${topic.council_date || ""}`,
          title: topic.title || "",
          summary: topic.summary || "",
          qa: `${topic.questioner || ""} / ${topic.answerer || ""}`,
          url: topic.source_url || "",
          excerptText: topic.excerpt_text || "",
          excerptRange: topic.excerpt_range || "",
          aiSummary: topic.ai_summary || "",
          status: topic.status || "未着手",
          priority: topic.priority || "A",
          callResult: latestCall?.call_result || "",
          nextAction: latestCall?.next_action || "",
          nextDate: latestCall?.next_date || "",
          memo: latestCall?.memo || "",
          scriptDraft: topic.script_draft || "",
        };
      });

      console.log("データ取得成功:", callViewData.length, "件");

      return NextResponse.json({
        success: true,
        data: callViewData,
      });
    } catch (error) {
      console.error("Supabaseエラー:", error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  }

  // Supabaseが設定されていない場合はGASを使用
  console.log("GASからデータを取得");

  if (!companyFileId) {
    return NextResponse.json(
      { success: false, error: "companyFileId is required" },
      { status: 400 }
    );
  }

  const gasEndpoint = process.env.GAS_ENDPOINT;

  if (!gasEndpoint) {
    return NextResponse.json(
      { success: false, error: "No data source configured" },
      { status: 500 }
    );
  }

  try {
    const url = new URL(gasEndpoint);
    url.searchParams.set("action", "getCallView");
    url.searchParams.set("spreadsheetId", companyFileId);

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

    if (!result.success) {
      throw new Error(result.error || "Failed to fetch data");
    }

    return NextResponse.json({
      success: true,
      data: result.data || [],
    });
  } catch (error) {
    console.error("GASエラー:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
