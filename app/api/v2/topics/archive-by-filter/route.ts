/**
 * 除外・アプローチ先リストに基づいてトピックをアーカイブ
 *
 * POST: リストに該当しないトピックをアーカイブ（非表示）
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../../lib/supabase";
import {
  getExclusionRules,
  getInclusionRules,
  isExcluded,
  isIncluded,
} from "../../../../lib/connector/exclusion-filter";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  console.log("=== /api/v2/topics/archive-by-filter POST ===");

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { companyId, dryRun = true } = body;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "companyIdが必要です" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 除外・アプローチ先リストを取得
    const [exclusionRules, inclusionRules] = await Promise.all([
      getExclusionRules(companyId),
      getInclusionRules(companyId),
    ]);

    console.log(`[Archive] 除外ルール: ${exclusionRules.length}件`);
    console.log(`[Archive] アプローチ先: ${inclusionRules.length}件`);

    if (exclusionRules.length === 0 && inclusionRules.length === 0) {
      return NextResponse.json({
        success: true,
        message: "フィルタリストが登録されていません",
        toArchive: 0,
        archived: 0,
        dryRun,
      });
    }

    // 対象企業のアーカイブされていないトピックを取得
    const { data: topics, error: fetchError } = await supabase
      .from("topics")
      .select("id, prefecture, city, title")
      .eq("company_id", companyId)
      .eq("is_archived", false);

    if (fetchError) {
      throw fetchError;
    }

    if (!topics || topics.length === 0) {
      return NextResponse.json({
        success: true,
        message: "対象トピックがありません",
        toArchive: 0,
        archived: 0,
        dryRun,
      });
    }

    console.log(`[Archive] 対象トピック: ${topics.length}件`);

    // フィルタリング対象を特定
    const toArchive: Array<{ id: string; prefecture: string; city: string; title: string; reason: string }> = [];

    for (const topic of topics) {
      const pref = topic.prefecture || "";
      const city = topic.city || "";

      // アプローチ先リストがある場合、リスト外はアーカイブ
      if (inclusionRules.length > 0) {
        if (!isIncluded({ prefecture: pref, city }, inclusionRules)) {
          toArchive.push({
            id: topic.id,
            prefecture: pref,
            city,
            title: topic.title || "",
            reason: "アプローチ先リスト外",
          });
          continue;
        }
      }

      // 除外リストに該当する場合はアーカイブ
      const exclusionResult = isExcluded({ prefecture: pref, city }, exclusionRules);
      if (exclusionResult.excluded) {
        toArchive.push({
          id: topic.id,
          prefecture: pref,
          city,
          title: topic.title || "",
          reason: exclusionResult.reason || "除外対象",
        });
      }
    }

    console.log(`[Archive] アーカイブ対象: ${toArchive.length}件`);

    if (toArchive.length === 0) {
      return NextResponse.json({
        success: true,
        message: "アーカイブ対象のトピックはありません",
        toArchive: 0,
        archived: 0,
        dryRun,
        details: [],
      });
    }

    // ドライランの場合は実行せずに結果を返す
    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `${toArchive.length}件がアーカイブ対象です（ドライラン）`,
        toArchive: toArchive.length,
        archived: 0,
        dryRun: true,
        details: toArchive.slice(0, 20), // 先頭20件のみ
      });
    }

    // アーカイブ実行
    const ids = toArchive.map((t) => t.id);
    const { error: updateError } = await supabase
      .from("topics")
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .in("id", ids);

    if (updateError) {
      throw updateError;
    }

    console.log(`[Archive] アーカイブ完了: ${toArchive.length}件`);

    return NextResponse.json({
      success: true,
      message: `${toArchive.length}件をアーカイブしました`,
      toArchive: toArchive.length,
      archived: toArchive.length,
      dryRun: false,
      details: toArchive.slice(0, 20),
    });
  } catch (error) {
    console.error("Archive error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
