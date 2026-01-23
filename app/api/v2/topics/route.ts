import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../lib/supabase";
import { Topic, TopicWithCallResult, InsertTopic, UpdateTopic } from "../../../types/database";

// トピック一覧取得（企業IDでフィルタ可能）
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
      .from("topics")
      .select(`
        *,
        company:companies(company_id, company_name),
        latest_call_result:call_results(*)
      `)
      .order("created_at", { ascending: false });

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("トピック一覧取得エラー:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 最新の架電結果のみを取得するように整形
    const formattedData = data?.map((topic) => {
      const callResults = topic.latest_call_result as unknown[];
      const latestCallResult = callResults && callResults.length > 0
        ? callResults.sort((a: unknown, b: unknown) => {
            const aResult = a as { logged_at: string };
            const bResult = b as { logged_at: string };
            return new Date(bResult.logged_at).getTime() - new Date(aResult.logged_at).getTime();
          })[0]
        : null;

      return {
        ...topic,
        latest_call_result: latestCallResult,
      };
    }) as TopicWithCallResult[];

    return NextResponse.json({
      success: true,
      data: formattedData,
    });
  } catch (error) {
    console.error("トピック一覧取得エラー:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// トピック追加（バルクインサート対応）
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    // 単一または配列で受け付け
    const topics: InsertTopic[] = Array.isArray(body) ? body : [body];

    const { data, error } = await supabase
      .from("topics")
      .insert(topics)
      .select();

    if (error) {
      console.error("トピック追加エラー:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data as Topic[],
      insertedCount: data?.length || 0,
    });
  } catch (error) {
    console.error("トピック追加エラー:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// トピック更新
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
    const topicId = searchParams.get("id");
    const companyRowKey = searchParams.get("companyRowKey");

    if (!topicId && !companyRowKey) {
      return NextResponse.json(
        { success: false, error: "id or companyRowKey is required" },
        { status: 400 }
      );
    }

    const body: UpdateTopic = await request.json();

    let query = supabase.from("topics").update(body);

    if (topicId) {
      query = query.eq("id", topicId);
    } else if (companyRowKey) {
      query = query.eq("company_row_key", companyRowKey);
    }

    const { data, error } = await query.select().single();

    if (error) {
      console.error("トピック更新エラー:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data as Topic,
    });
  } catch (error) {
    console.error("トピック更新エラー:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
