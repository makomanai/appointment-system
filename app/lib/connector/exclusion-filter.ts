/**
 * 除外・アプローチ先フィルター - 企業別のリストでトピックをフィルタリング
 *
 * フィルタリングロジック:
 * 1. アプローチ先リスト（ホワイトリスト）がある場合 → リスト内の自治体のみ通過
 * 2. 除外リスト（ブラックリスト）がある場合 → リスト内の自治体を除外
 * 3. 両方ある場合 → アプローチ先でフィルタ後、除外リストで除外
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

export interface InclusionRule {
  id: string;
  company_id: string;
  prefecture: string | null;
  city: string | null;
  memo: string | null;
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
 * 企業のアプローチ先リスト（ホワイトリスト）を取得
 */
export async function getInclusionRules(companyId: string): Promise<InclusionRule[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("company_inclusions")
    .select("*")
    .eq("company_id", companyId);

  if (error) {
    console.error("[InclusionFilter] アプローチ先リスト取得エラー:", error);
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
 * 単一のトピックがアプローチ先リストに含まれるかチェック
 */
export function isIncluded(
  row: { prefecture: string; city: string },
  rules: InclusionRule[]
): boolean {
  for (const rule of rules) {
    // 都道府県のみ指定 → その県全体がアプローチ先
    if (rule.prefecture && !rule.city) {
      if (normalizeLocation(row.prefecture) === normalizeLocation(rule.prefecture)) {
        return true;
      }
    }

    // 都道府県+市区町村 → 特定の自治体がアプローチ先
    if (rule.prefecture && rule.city) {
      if (
        normalizeLocation(row.prefecture) === normalizeLocation(rule.prefecture) &&
        normalizeLocation(row.city) === normalizeLocation(rule.city)
      ) {
        return true;
      }
    }

    // 市区町村のみ指定（都道府県問わず）→ その市区町村名がアプローチ先
    if (!rule.prefecture && rule.city) {
      if (normalizeLocation(row.city) === normalizeLocation(rule.city)) {
        return true;
      }
    }
  }

  return false;
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
 * 除外・アプローチ先フィルターを適用
 *
 * 処理順序:
 * 1. アプローチ先リストがある場合、まずホワイトリストでフィルタ
 * 2. その後、除外リストでブラックリストフィルタ
 */
export async function applyExclusionFilter(
  rows: JsNextExportRow[],
  companyId: string
): Promise<{
  passed: JsNextExportRow[];
  excluded: Array<{ row: JsNextExportRow; reason: string }>;
  includedCount?: number;
}> {
  const [exclusionRules, inclusionRules] = await Promise.all([
    getExclusionRules(companyId),
    getInclusionRules(companyId),
  ]);

  let workingRows = rows;
  const excluded: Array<{ row: JsNextExportRow; reason: string }> = [];
  let includedCount: number | undefined;

  // Step 1: アプローチ先リスト（ホワイトリスト）でフィルタ
  if (inclusionRules.length > 0) {
    console.log(`[InclusionFilter] ${inclusionRules.length}件のアプローチ先でフィルタ中...`);

    const included: JsNextExportRow[] = [];
    for (const row of workingRows) {
      if (isIncluded(row, inclusionRules)) {
        included.push(row);
      } else {
        excluded.push({ row, reason: "アプローチ先リスト外" });
      }
    }

    console.log(`[InclusionFilter] 結果: ${included.length}件がアプローチ先に該当`);
    workingRows = included;
    includedCount = included.length;
  }

  // Step 2: 除外リスト（ブラックリスト）でフィルタ
  if (exclusionRules.length === 0) {
    if (inclusionRules.length === 0) {
      console.log("[Filter] フィルタルールなし、全件通過");
    }
    return { passed: workingRows, excluded, includedCount };
  }

  console.log(`[ExclusionFilter] ${exclusionRules.length}件の除外ルールを適用中...`);

  const passed: JsNextExportRow[] = [];

  for (const row of workingRows) {
    const result = isExcluded(row, exclusionRules);
    if (result.excluded) {
      excluded.push({ row, reason: result.reason || "除外対象" });
    } else {
      passed.push(row);
    }
  }

  console.log(`[ExclusionFilter] 結果: ${passed.length}件通過, ${excluded.length}件除外`);

  return { passed, excluded, includedCount };
}
