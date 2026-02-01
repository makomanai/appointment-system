/**
 * コネクタAPI - 0次判定→一次判定→既存取り込みへの統合
 *
 * POST: CSVをアップロードして0次→一次→DB投入まで実行
 * GET: パイプライン状態の確認（将来用）
 */

import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "../../../lib/supabase";
import { runPipelineFromCSV } from "../../../lib/connector/pipeline";

export async function POST(request: NextRequest) {
  console.log("=== /api/v2/connector POST ===");

  try {
    const contentType = request.headers.get("content-type") || "";

    // FormData（CSVファイルアップロード）の場合
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const companyId = formData.get("companyId") as string | null;
      const dryRun = formData.get("dryRun") === "true";
      const limit = parseInt(formData.get("limit") as string || "50", 10);

      if (!file) {
        return NextResponse.json(
          { success: false, error: "CSVファイルが必要です" },
          { status: 400 }
        );
      }

      if (!companyId) {
        return NextResponse.json(
          { success: false, error: "companyIdが必要です" },
          { status: 400 }
        );
      }

      const csvText = await file.text();
      const result = await runPipelineFromCSV(csvText, companyId, {
        zeroOrderLimit: limit,
        dryRun,
      });

      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    // JSONの場合（CSVテキストを直接送信）
    const body = await request.json();
    const { csvText, companyId, dryRun = false, limit = 50 } = body;

    if (!csvText) {
      return NextResponse.json(
        { success: false, error: "csvTextが必要です" },
        { status: 400 }
      );
    }

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "companyIdが必要です" },
        { status: 400 }
      );
    }

    const result = await runPipelineFromCSV(csvText, companyId, {
      zeroOrderLimit: limit,
      dryRun,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Connector error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * パイプライン設定と状態を取得
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const companyId = searchParams.get("companyId");

  return NextResponse.json({
    success: true,
    config: {
      supabaseConfigured: isSupabaseConfigured(),
      defaultLimit: 50,
      paddingSeconds: 30,
      maxSnippets: 10,
    },
    scoring: {
      must: "+4点",
      should: "+2点",
      not: "-10点",
      passCondition: "(must>=1 & score>=8) OR (should>=3 & score>=7)",
    },
    usage: {
      endpoint: "/api/v2/connector",
      method: "POST",
      contentType: "multipart/form-data または application/json",
      parameters: {
        file: "CSVファイル（FormDataの場合）",
        csvText: "CSVテキスト（JSONの場合）",
        companyId: "企業ID（必須）",
        dryRun: "trueでDB投入をスキップ（デフォルト: false）",
        limit: "0次判定の上限件数（デフォルト: 50）",
      },
    },
  });
}
