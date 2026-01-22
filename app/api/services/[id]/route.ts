import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { Service } from "../route";

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

    const updatedService: Service = {
      ...existingService,
      companyId: body.companyId ?? existingService.companyId,
      companyName: body.companyName ?? existingService.companyName,
      name: body.name ?? existingService.name,
      description: body.description ?? existingService.description,
      features: body.features ?? existingService.features,
      targetProblems: body.targetProblems ?? existingService.targetProblems,
      updatedAt: new Date().toISOString(),
    };

    await kv.hset("services", { [id]: updatedService });

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

    return NextResponse.json({ success: true, message: "サービスを削除しました" });
  } catch (error) {
    console.error("Service delete error:", error);
    return NextResponse.json(
      { success: false, error: "サービスの削除に失敗しました" },
      { status: 500 }
    );
  }
}
