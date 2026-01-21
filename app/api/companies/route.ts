import { NextResponse } from "next/server";

// 開発用モックデータ
const mockCompanies = [
  {
    companyId: "C001",
    companyName: "aitegrity",
    companyFileId: "mock_file_id_001",
  },
  {
    companyId: "C002",
    companyName: "ウルフカムイ",
    companyFileId: "mock_file_id_002",
  },
  {
    companyId: "C003",
    companyName: "アクセリア",
    companyFileId: "mock_file_id_003",
  },
  {
    companyId: "C008",
    companyName: "ミライズエネチェンジ",
    companyFileId: "mock_file_id_008",
  },
  {
    companyId: "C009",
    companyName: "エピックベース株式会社",
    companyFileId: "mock_file_id_009",
  },
];

export async function GET() {
  // デバッグ: 環境変数の確認
  const gasEndpoint = process.env.GAS_ENDPOINT;
  const masterSpreadsheetId = process.env.MASTER_SPREADSHEET_ID;

  console.log("=== /api/companies デバッグ情報 ===");
  console.log("GAS_ENDPOINT:", gasEndpoint ? `${gasEndpoint.substring(0, 50)}...` : "未設定");
  console.log("MASTER_SPREADSHEET_ID:", masterSpreadsheetId || "未設定");

  try {
    // GAS_ENDPOINTが設定されていない場合はモックデータを返す
    if (!gasEndpoint || gasEndpoint === "your_gas_endpoint_here") {
      console.log("モックデータを返します（GAS_ENDPOINT未設定）");
      return NextResponse.json({
        success: true,
        data: mockCompanies,
        isMock: true,
      });
    }

    // GASエンドポイントにリクエスト
    const url = new URL(gasEndpoint);
    url.searchParams.set("action", "getCompanies");
    if (masterSpreadsheetId) {
      url.searchParams.set("spreadsheetId", masterSpreadsheetId);
    }

    console.log("リクエストURL:", url.toString());

    // GASへのfetch - GETリクエストではContent-Typeヘッダーは不要
    // cache: 'no-store'でキャッシュを無効化
    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });

    console.log("レスポンスステータス:", response.status);
    console.log("レスポンスURL:", response.url);
    console.log("Content-Type:", response.headers.get("content-type"));

    // レスポンスのテキストを取得
    const responseText = await response.text();
    console.log("レスポンス本文（先頭200文字）:", responseText.substring(0, 200));

    // HTMLが返ってきた場合のエラーハンドリング
    if (responseText.startsWith("<!") || responseText.startsWith("<html")) {
      console.error("GASがHTMLを返しました。デプロイ設定を確認してください。");
      console.log("モックデータにフォールバックします");
      return NextResponse.json({
        success: true,
        data: mockCompanies,
        isMock: true,
        warning: "GASエンドポイントがHTMLを返したためモックデータを使用",
      });
    }

    // JSONとしてパース
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error("JSONパースエラー:", parseError);
      console.log("モックデータにフォールバックします");
      return NextResponse.json({
        success: true,
        data: mockCompanies,
        isMock: true,
        warning: "JSONパースに失敗したためモックデータを使用",
      });
    }

    if (!response.ok) {
      console.error("GAS APIエラー:", response.status, result);
      throw new Error(`GAS API error: ${response.status}`);
    }

    if (!result.success || !result.data) {
      console.error("GASレスポンスエラー:", result);
      throw new Error(result.error || "Failed to fetch companies");
    }

    console.log("企業データ取得成功:", result.data.length, "件");
    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error("=== エラー発生 ===");
    console.error("エラー名:", error instanceof Error ? error.name : "Unknown");
    console.error("エラーメッセージ:", error instanceof Error ? error.message : "Unknown error");
    console.error("スタックトレース:", error instanceof Error ? error.stack : "N/A");

    // エラー時はモックデータにフォールバック
    console.log("モックデータにフォールバックします");
    return NextResponse.json({
      success: true,
      data: mockCompanies,
      isMock: true,
      warning: `GASエラーのためモックデータを使用: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}
