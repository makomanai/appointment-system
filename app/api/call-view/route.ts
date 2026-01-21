import { NextRequest, NextResponse } from "next/server";

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
