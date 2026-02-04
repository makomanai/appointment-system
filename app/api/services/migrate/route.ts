/**
 * Vercel KVからSupabaseへサービスを移行するエンドポイント
 *
 * POST: KVのサービスをSupabaseに移行
 * GET: 移行対象のサービス一覧を確認（ドライラン）
 */

import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../lib/supabase";

interface KVService {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  description: string;
  features: string;
  targetProblems: string;
  createdAt: string;
  updatedAt: string;
}

// 移行対象のサービス一覧を確認（ドライラン）
export async function GET() {
  try {
    // Vercel KVからサービスを取得
    const allServices = await kv.hgetall<Record<string, KVService>>("services") || {};
    const services = Object.values(allServices);

    if (services.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Vercel KVにサービスがありません",
        services: [],
      });
    }

    return NextResponse.json({
      success: true,
      message: `${services.length}件のサービスが移行対象です`,
      services: services.map(s => ({
        id: s.id,
        companyId: s.companyId,
        companyName: s.companyName,
        name: s.name,
        description: s.description?.substring(0, 100) + (s.description?.length > 100 ? "..." : ""),
        features: s.features?.substring(0, 100) + (s.features?.length > 100 ? "..." : ""),
        targetProblems: s.targetProblems?.substring(0, 100) + (s.targetProblems?.length > 100 ? "..." : ""),
      })),
    });
  } catch (error) {
    console.error("Migration check error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Vercel KVからSupabaseへ移行実行
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { dryRun = false } = body;

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: "Supabaseが設定されていません" },
        { status: 503 }
      );
    }

    // Vercel KVからサービスを取得
    const allServices = await kv.hgetall<Record<string, KVService>>("services") || {};
    const services = Object.values(allServices);

    if (services.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Vercel KVにサービスがありません",
        migrated: 0,
      });
    }

    // Supabase用のデータ形式に変換
    const supabaseServices = services.map(s => {
      // features と targetProblems からキーワードを抽出
      const keywords: string[] = [];

      // targetProblems からキーワード抽出（カンマや読点で区切る）
      if (s.targetProblems) {
        keywords.push(...s.targetProblems.split(/[,、\n]+/).map(k => k.trim()).filter(Boolean));
      }

      // features からもキーワード候補を抽出
      if (s.features) {
        const featureKeywords = s.features.split(/[,、\n]+/).map(k => k.trim()).filter(Boolean);
        keywords.push(...featureKeywords.slice(0, 5));
      }

      return {
        company_id: s.companyId,
        name: s.name,
        description: [s.description, s.features].filter(Boolean).join("\n\n"),
        target_keywords: keywords.slice(0, 20).join(","), // 上位20個をカンマ区切りで
        created_at: s.createdAt || new Date().toISOString(),
        updated_at: s.updatedAt || new Date().toISOString(),
      };
    });

    console.log("移行対象サービス:", supabaseServices.length, "件");

    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `ドライラン: ${services.length}件が移行対象です`,
        dryRun: true,
        services: supabaseServices,
      });
    }

    // Supabaseに挿入
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("services")
      .upsert(supabaseServices, {
        onConflict: "company_id,name",
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${data?.length || 0}件のサービスを移行しました`,
      migrated: data?.length || 0,
      services: data,
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
