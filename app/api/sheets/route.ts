import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    // TODO: スプレッドシートからデータを取得

    return NextResponse.json({
      success: true,
      data: [],
    });
  } catch (error) {
    console.error("Sheets API error:", error);
    return NextResponse.json(
      { success: false, error: "データ取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // TODO: スプレッドシートにデータを書き込み

    return NextResponse.json({
      success: true,
      message: "データを保存しました",
    });
  } catch (error) {
    console.error("Sheets API error:", error);
    return NextResponse.json(
      { success: false, error: "データ保存に失敗しました" },
      { status: 500 }
    );
  }
}
