import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { Service } from "../route";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../lib/supabase";

// サービス更新
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    // 既存のサービスを取得
    const existingService = await kv.hget<Service>("services", id);
    if (!existingService) {
      return NextResponse.json(
        { success: false, error: "サービスが見つかりません" },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    const updatedService: Service = {
      ...existingService,
      companyId: body.companyId ?? existingService.companyId,
      companyName: body.companyName ?? existingService.companyName,
      name: body.name ?? existingService.name,
      description: body.description ?? existingService.description,
      features: body.features ?? existingService.features,
      targetProblems: body.targetProblems ?? existingService.targetProblems,
      targetKeywords: body.targetKeywords ?? existingService.targetKeywords ?? "",
      updatedAt: now,
    };

    await kv.hset("services", { [id]: updatedService });

    // Supabaseにも同期（0次判定で使用するため）
    if (isSupabaseConfigured()) {
      const supabase = createServerSupabaseClient();
      await supabase.from("services").upsert({
        id,
        company_id: updatedService.companyId,
        name: updatedService.name,
        description: updatedService.description,
        features: updatedService.features,
        target_problems: updatedService.targetProblems,
        target_keywords: updatedService.targetKeywords,
        updated_at: now,
      }, { onConflict: "id" });
    }

    return NextResponse.json({ success: true, data: updatedService });
  } catch (error) {
    console.error("Service update error:", error);
    return NextResponse.json(
      { success: false, error: "サービスの更新に失敗しました" },
      { status: 500 }
    );
  }
}

// サービス削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 既存のサービスを確認
    const existingService = await kv.hget<Service>("services", id);
    if (!existingService) {
      return NextResponse.json(
        { success: false, error: "サービスが見つかりません" },
        { status: 404 }
      );
    }

    await kv.hdel("services", id);

    // Supabaseからも削除
    if (isSupabaseConfigured()) {
      const supabase = createServerSupabaseClient();
      await supabase.from("services").delete().eq("id", id);
    }

    return NextResponse.json({ success: true, message: "サービスを削除しました" });
  } catch (error) {
    console.error("Service delete error:", error);
    return NextResponse.json(
      { success: false, error: "サービスの削除に失敗しました" },
      { status: 500 }
    );
  }
}
