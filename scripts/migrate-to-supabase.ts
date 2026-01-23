/**
 * データ移行スクリプト: Google Spreadsheet → Supabase
 *
 * 使い方:
 * npx ts-node scripts/migrate-to-supabase.ts
 *
 * または:
 * npx tsx scripts/migrate-to-supabase.ts
 */

import { createClient } from "@supabase/supabase-js";

// 環境変数
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ccghfmimznxqeazfvrxh.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_Uz42oZZtrXqzyXnR1eH7lg_Sr9EdGfF";
const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbxszo3ocRdlzVCuZ-rvQ7QKEB-MlMffDzWswaMUMtIuZRpyS1D72Rn6UGq2QG4sIDwv/exec";
const MASTER_SPREADSHEET_ID = "142V0QeflViTwnin1v08s_kGYzNocgGox16GzVgzuVc4";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface GASCompany {
  companyId: string;
  companyName: string;
  companyFileId: string;
}

interface GASCallViewItem {
  companyRowKey: string;
  status: string;
  priority: string;
  callResult: string;
  nextAction: string;
  nextDate: string;
  memo: string;
  excerptText: string;
  excerptRange: string;
  prefecture: string;
  city: string;
  councilDate: string;
  title: string;
  summary: string;
  questioner: string;
  answerer: string;
  sourceUrl: string;
  scriptDraft: string;
  groupId?: string;
  startSec?: number;
  endSec?: number;
}

// GASからデータを取得
async function fetchFromGAS(action: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(GAS_ENDPOINT);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  console.log(`  リクエスト: ${action}`);

  const response = await fetch(url.toString(), {
    method: "GET",
    redirect: "follow",
  });

  const text = await response.text();

  if (text.startsWith("<")) {
    throw new Error("GASがHTMLを返しました");
  }

  return JSON.parse(text);
}

// 企業データを移行
async function migrateCompanies(): Promise<GASCompany[]> {
  console.log("\n=== 企業データ移行 ===");

  const result = await fetchFromGAS("getCompanies", { spreadsheetId: MASTER_SPREADSHEET_ID }) as {
    success: boolean;
    data: GASCompany[];
  };

  if (!result.success || !result.data) {
    throw new Error("企業データの取得に失敗しました");
  }

  const companies = result.data;
  console.log(`  取得件数: ${companies.length}件`);

  // Supabaseに挿入
  for (const company of companies) {
    const { error } = await supabase.from("companies").upsert({
      company_id: company.companyId,
      company_name: company.companyName,
      company_file_id: company.companyFileId,
    }, {
      onConflict: "company_id",
    });

    if (error) {
      console.error(`  エラー (${company.companyName}):`, error.message);
    } else {
      console.log(`  ✓ ${company.companyName}`);
    }
  }

  return companies;
}

// トピック・架電データを移行
async function migrateTopics(companies: GASCompany[]): Promise<void> {
  console.log("\n=== トピック・架電データ移行 ===");

  for (const company of companies) {
    console.log(`\n[${company.companyName}]`);

    try {
      const result = await fetchFromGAS("getCallView", { spreadsheetId: company.companyFileId }) as {
        success: boolean;
        data: GASCallViewItem[];
        error?: string;
      };

      if (!result.success) {
        console.log(`  スキップ: ${result.error || "データなし"}`);
        continue;
      }

      const items = result.data || [];
      console.log(`  取得件数: ${items.length}件`);

      for (const item of items) {
        if (!item.companyRowKey) {
          continue;
        }

        // トピックを挿入
        const { data: topicData, error: topicError } = await supabase
          .from("topics")
          .upsert({
            company_id: company.companyId,
            company_row_key: item.companyRowKey,
            prefecture: item.prefecture || null,
            city: item.city || null,
            council_date: item.councilDate || null,
            title: item.title || null,
            summary: item.summary || null,
            questioner: item.questioner || null,
            answerer: item.answerer || null,
            source_url: item.sourceUrl || null,
            group_id: item.groupId || null,
            start_sec: item.startSec || null,
            end_sec: item.endSec || null,
            excerpt_text: item.excerptText || null,
            excerpt_range: item.excerptRange || null,
            status: item.status || "未着手",
            priority: item.priority || "A",
            script_draft: item.scriptDraft || null,
          }, {
            onConflict: "company_row_key",
          })
          .select("id")
          .single();

        if (topicError) {
          console.error(`  トピックエラー (${item.companyRowKey}):`, topicError.message);
          continue;
        }

        // 架電結果があれば挿入
        if (item.callResult && item.callResult !== "未実施" && topicData?.id) {
          const { error: callError } = await supabase.from("call_results").insert({
            topic_id: topicData.id,
            call_result: item.callResult || null,
            next_action: item.nextAction || null,
            next_date: item.nextDate || null,
            memo: item.memo || null,
          });

          if (callError) {
            console.error(`  架電結果エラー:`, callError.message);
          }
        }
      }

      console.log(`  ✓ 完了`);
    } catch (error) {
      console.error(`  エラー:`, error instanceof Error ? error.message : error);
    }
  }
}

// メイン処理
async function main() {
  console.log("========================================");
  console.log("データ移行スクリプト開始");
  console.log("========================================");
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`GAS Endpoint: ${GAS_ENDPOINT.substring(0, 50)}...`);

  try {
    // 1. 企業データ移行
    const companies = await migrateCompanies();

    // 2. トピック・架電データ移行
    await migrateTopics(companies);

    console.log("\n========================================");
    console.log("移行完了!");
    console.log("========================================");

    // 結果確認
    const { count: companyCount } = await supabase.from("companies").select("*", { count: "exact", head: true });
    const { count: topicCount } = await supabase.from("topics").select("*", { count: "exact", head: true });
    const { count: callResultCount } = await supabase.from("call_results").select("*", { count: "exact", head: true });

    console.log(`\n最終結果:`);
    console.log(`  企業: ${companyCount}件`);
    console.log(`  トピック: ${topicCount}件`);
    console.log(`  架電結果: ${callResultCount}件`);

  } catch (error) {
    console.error("\n移行エラー:", error);
    process.exit(1);
  }
}

main();
