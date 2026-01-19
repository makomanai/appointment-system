import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // TODO: OpenAI APIを使用してスクリプトを生成

    return NextResponse.json({
      success: true,
      script: "生成されたスクリプト",
    });
  } catch (error) {
    console.error("Script generation error:", error);
    return NextResponse.json(
      { success: false, error: "スクリプト生成に失敗しました" },
      { status: 500 }
    );
  }
}
