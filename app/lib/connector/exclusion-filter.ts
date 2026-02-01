/**
 * 除外フィルター - 企業別の除外リストでトピックをフィルタリング
 */

import { createServerSupabaseClient, isSupabaseConfigured } from "../supabase";
import { JsNextExportRow } from "./types";

export interface ExclusionRule {
  id: string;
  company_id: string;
  prefecture: string | null;
  city: string | null;
  reason: string | null;
}

/**
 * 企業の除外リストを取得
 */
export async function getExclusionRules(companyId: string): Promise<ExclusionRule[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("company_exclusions")
    .select("*")
    .eq("company_id", companyId);

  if (error) {
    console.error("[ExclusionFilter] 除外リスト取得エラー:", error);
    return [];
  }

  return data || [];
}

/**
 * 単一のトピックが除外対象かチェック
 */
export function isExcluded(
  row: { prefecture: string; city: string },
  rules: ExclusionRule[]
): { excluded: boolean; reason?: string } {
  for (const rule of rules) {
    // 都道府県のみ指定 → その県全体を除外
    if (rule.prefecture && !rule.city) {
      if (normalizeLocation(row.prefecture) === normalizeLocation(rule.prefecture)) {
        return { excluded: true, reason: rule.reason || "都道府県が除外対象" };
      }
    }

    // 都道府県+市区町村 → 特定の自治体を除外
    if (rule.prefecture && rule.city) {
      if (
        normalizeLocation(row.prefecture) === normalizeLocation(rule.prefecture) &&
        normalizeLocation(row.city) === normalizeLocation(rule.city)
      ) {
        return { excluded: true, reason: rule.reason || "自治体が除外対象" };
      }
    }

    // 市区町村のみ指定（都道府県問わず）→ その市区町村名を除外
    if (!rule.prefecture && rule.city) {
      if (normalizeLocation(row.city) === normalizeLocation(rule.city)) {
        return { excluded: true, reason: rule.reason || "市区町村が除外対象" };
      }
    }
  }

  return { excluded: false };
}

/**
 * 地名を正規化（比較用）
 */
function normalizeLocation(name: string | null): string {
  if (!name) return "";
  return name
    .trim()
    .replace(/\s+/g, "")
    .replace(/県$/, "")
    .replace(/府$/, "")
    .replace(/都$/, "")
    .replace(/道$/, "")
    .replace(/市$/, "")
    .replace(/区$/, "")
    .replace(/町$/, "")
    .replace(/村$/, "");
}

/**
 * 除外フィルターを適用
 */
export async function applyExclusionFilter(
  rows: JsNextExportRow[],
  companyId: string
): Promise<{
  passed: JsNextExportRow[];
  excluded: Array<{ row: JsNextExportRow; reason: string }>;
}> {
  const rules = await getExclusionRules(companyId);

  if (rules.length === 0) {
    console.log("[ExclusionFilter] 除外ルールなし、全件通過");
    return { passed: rows, excluded: [] };
  }

  console.log(`[ExclusionFilter] ${rules.length}件の除外ルールを適用中...`);

  const passed: JsNextExportRow[] = [];
  const excluded: Array<{ row: JsNextExportRow; reason: string }> = [];

  for (const row of rows) {
    const result = isExcluded(row, rules);
    if (result.excluded) {
      excluded.push({ row, reason: result.reason || "除外対象" });
    } else {
      passed.push(row);
    }
  }

  console.log(`[ExclusionFilter] 結果: ${passed.length}件通過, ${excluded.length}件除外`);

  return { passed, excluded };
}
