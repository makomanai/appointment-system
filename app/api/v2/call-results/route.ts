import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../lib/supabase";
import { CallResult, InsertCallResult, UpdateCallResult } from "../../../types/database";

// 架電結果一覧取得
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
    const topicId = searchParams.get("topicId");
    const companyId = searchParams.get("companyId");

    let query = supabase
      .from("call_results")
      .select(`
        *,
        topic:topics(
          id,
          company_row_key,
          company_id,
          title,
          prefecture,
          city
        )
      `)
      .order("logged_at", { ascending: false });

    if (topicId) {
      query = query.eq("topic_id", topicId);
    }

    if (companyId) {
      query = query.eq("topic.company_id", companyId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("架電結果一覧取得エラー:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error("架電結果一覧取得エラー:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// 架電結果保存
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const body: InsertCallResult & { companyRowKey?: string } = await request.json();

    // companyRowKeyが渡された場合、topic_idを解決
    let topicId = body.topic_id;

    if (!topicId && body.companyRowKey) {
      const { data: topic, error: topicError } = await supabase
        .from("topics")
        .select("id")
        .eq("company_row_key", body.companyRowKey)
        .single();

      if (topicError || !topic) {
        console.error("トピック検索エラー:", topicError);
        return NextResponse.json(
          { success: false, error: "Topic not found for the given companyRowKey" },
          { status: 404 }
        );
      }

      topicId = topic.id;
    }

    if (!topicId) {
      return NextResponse.json(
        { success: false, error: "topic_id or companyRowKey is required" },
        { status: 400 }
      );
    }

    // 架電結果を保存
    const { data, error } = await supabase
      .from("call_results")
      .insert({
        topic_id: topicId,
        call_result: body.call_result,
        next_action: body.next_action,
        next_date: body.next_date,
        memo: body.memo,
        contact_name: body.contact_name,
        department: body.department,
        phone: body.phone,
        logged_by: body.logged_by,
      })
      .select()
      .single();

    if (error) {
      console.error("架電結果保存エラー:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // トピックのステータスも更新
    const { error: updateError } = await supabase
      .from("topics")
      .update({
        status: body.call_result === "面談OK" || body.call_result === "NG" ? "完了" : "対応中",
      })
      .eq("id", topicId);

    if (updateError) {
      console.error("トピックステータス更新エラー:", updateError);
    }

    return NextResponse.json({
      success: true,
      data: data as CallResult,
    });
  } catch (error) {
    console.error("架電結果保存エラー:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// 架電結果更新
export async function PATCH(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    const callResultId = searchParams.get("id");

    if (!callResultId) {
      return NextResponse.json(
        { success: false, error: "id is required" },
        { status: 400 }
      );
    }

    const body: UpdateCallResult = await request.json();

    const { data, error } = await supabase
      .from("call_results")
      .update(body)
      .eq("id", callResultId)
      .select()
      .single();

    if (error) {
      console.error("架電結果更新エラー:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data as CallResult,
    });
  } catch (error) {
    console.error("架電結果更新エラー:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
