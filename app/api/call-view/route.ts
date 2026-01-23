import { NextRequest, NextResponse } from "next/server";
import { CallResultForm } from "../../types";

interface UpdateCallViewRequest {
  companyFileId: string;
  companyRowKey: string;
  formData: CallResultForm;
}

export async function POST(request: NextRequest) {
  console.log("=== /api/call-view POST デバッグ情報 ===");

  // 書き込み用は別エンドポイント（GAS_ENDPOINT_WRITE）を使用
  const gasEndpoint = process.env.GAS_ENDPOINT_WRITE || process.env.GAS_ENDPOINT;
  if (!gasEndpoint) {
    console.error("GAS_ENDPOINT_WRITEが設定されていません");
    return NextResponse.json(
      { success: false, error: "GAS_ENDPOINT_WRITE is not configured" },
      { status: 500 }
    );
  }

  try {
    const body: UpdateCallViewRequest = await request.json();
    console.log("リクエストボディ:", JSON.stringify(body, null, 2));

    const { companyFileId, companyRowKey, formData } = body;

    if (!companyFileId || !companyRowKey) {
      return NextResponse.json(
        { success: false, error: "companyFileId and companyRowKey are required" },
        { status: 400 }
      );
    }

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

    console.log("GASレスポンスステータス:", response.status);

    const responseText = await response.text();
    console.log("GASレスポンス:", responseText.substring(0, 500));

    if (responseText.startsWith("<!") || responseText.startsWith("<html")) {
      console.error("GASがHTMLを返しました");
      return NextResponse.json(
        { success: false, error: "GAS returned HTML instead of JSON" },
        { status: 500 }
      );
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error("JSONパースエラー:", parseError);
      return NextResponse.json(
        { success: false, error: "Failed to parse JSON response" },
        { status: 500 }
      );
    }

    // GASは "ok" または "success" を返す可能性がある
    if (!response.ok || (!result.success && !result.ok)) {
      console.error("GAS更新エラー:", result);
      return NextResponse.json(
        { success: false, error: result.error || "Failed to update call view data" },
        { status: response.ok ? 500 : response.status }
      );
    }

    console.log("call_viewデータ更新成功");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("=== POSTエラー発生 ===");
    console.error("エラー:", error instanceof Error ? error.message : "Unknown error");

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const companyFileId = searchParams.get("companyFileId");

  console.log("=== /api/call-view デバッグ情報 ===");
  console.log("companyFileId:", companyFileId);

  if (!companyFileId) {
    console.error("companyFileIdが指定されていません");
    return NextResponse.json(
      { success: false, error: "companyFileId is required" },
      { status: 400 }
    );
  }

  const gasEndpoint = process.env.GAS_ENDPOINT;
  console.log("GAS_ENDPOINT:", gasEndpoint ? `${gasEndpoint.substring(0, 50)}...` : "未設定");

  if (!gasEndpoint) {
    console.error("GAS_ENDPOINTが設定されていません");
    return NextResponse.json(
      { success: false, error: "GAS_ENDPOINT is not configured" },
      { status: 500 }
    );
  }

  try {
    const url = new URL(gasEndpoint);
    url.searchParams.set("action", "getCallView");
    url.searchParams.set("spreadsheetId", companyFileId);

    console.log("リクエストURL:", url.toString());

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });

    console.log("レスポンスステータス:", response.status);
    console.log("レスポンスURL:", response.url);
    console.log("Content-Type:", response.headers.get("content-type"));

    const responseText = await response.text();
    console.log("レスポンス本文（先頭200文字）:", responseText.substring(0, 200));

    // HTMLが返ってきた場合のエラーハンドリング
    if (responseText.startsWith("<!") || responseText.startsWith("<html")) {
      console.error("GASがHTMLを返しました");
      return NextResponse.json(
        { success: false, error: "GAS returned HTML instead of JSON" },
        { status: 500 }
      );
    }

    // JSONとしてパース
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error("JSONパースエラー:", parseError);
      return NextResponse.json(
        { success: false, error: "Failed to parse JSON response" },
        { status: 500 }
      );
    }

    if (!response.ok) {
      console.error("GAS APIエラー:", response.status, result);
      return NextResponse.json(
        { success: false, error: `GAS API error: ${response.status}` },
        { status: response.status }
      );
    }

    if (!result.success) {
      console.error("GASレスポンスエラー:", result);
      return NextResponse.json(
        { success: false, error: result.error || "Failed to fetch call view data" },
        { status: 500 }
      );
    }

    console.log("call_viewデータ取得成功:", result.data?.length || 0, "件");
    return NextResponse.json({
      success: true,
      data: result.data || [],
    });
  } catch (error) {
    console.error("=== エラー発生 ===");
    console.error("エラー:", error instanceof Error ? error.message : "Unknown error");

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
