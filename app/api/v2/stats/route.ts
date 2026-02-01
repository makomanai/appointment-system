/**
 * ダッシュボード統計API
 *
 * GET: 企業別・全体の統計情報を取得
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

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

    // 企業一覧を取得
    const { data: companies } = await supabase
      .from("companies")
      .select("company_id, company_name")
      .order("company_name");

    // トピック統計を取得
    let topicsQuery = supabase
      .from("topics")
      .select("company_id, status, priority, created_at");

    if (companyId) {
      topicsQuery = topicsQuery.eq("company_id", companyId);
    }

    const { data: topics } = await topicsQuery;

    // 統計を計算
    const stats = {
      totalTopics: topics?.length || 0,
      byStatus: {
        未着手: 0,
        架電中: 0,
        完了: 0,
        保留: 0,
        対象外: 0,
      } as Record<string, number>,
      byPriority: {
        S: 0,
        A: 0,
        B: 0,
        C: 0,
      } as Record<string, number>,
      byCompany: {} as Record<string, {
        companyName: string;
        total: number;
        未着手: number;
        完了: number;
      }>,
      recentImports: {
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
      },
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    for (const topic of topics || []) {
      // ステータス別
      const status = topic.status || "未着手";
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

      // 優先度別
      const priority = topic.priority || "B";
      stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;

      // 企業別
      const cid = topic.company_id;
      if (!stats.byCompany[cid]) {
        const company = companies?.find((c) => c.company_id === cid);
        stats.byCompany[cid] = {
          companyName: company?.company_name || cid,
          total: 0,
          未着手: 0,
          完了: 0,
        };
      }
      stats.byCompany[cid].total++;
      if (status === "未着手") stats.byCompany[cid].未着手++;
      if (status === "完了") stats.byCompany[cid].完了++;

      // 最近のインポート
      const createdAt = new Date(topic.created_at);
      if (createdAt >= todayStart) stats.recentImports.today++;
      if (createdAt >= weekStart) stats.recentImports.thisWeek++;
      if (createdAt >= monthStart) stats.recentImports.thisMonth++;
    }

    return NextResponse.json({
      success: true,
      stats,
      companies: companies || [],
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
