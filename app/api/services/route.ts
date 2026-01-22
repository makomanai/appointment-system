import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export interface Service {
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

// サービス一覧取得
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get("companyId");

    // 全サービスを取得
    const allServices = await kv.hgetall<Record<string, Service>>("services") || {};

    let services = Object.values(allServices);

    // companyIdでフィルタリング
    if (companyId) {
      services = services.filter(s => s.companyId === companyId);
    }

    // 作成日時でソート（新しい順）
    services.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, data: services });
  } catch (error) {
    console.error("Services fetch error:", error);
    return NextResponse.json(
      { success: false, error: "サービス一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}

// サービス登録
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, companyName, name, description, features, targetProblems } = body;

    if (!companyId || !name) {
      return NextResponse.json(
        { success: false, error: "企業IDとサービス名は必須です" },
        { status: 400 }
      );
    }

    const id = `svc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const service: Service = {
      id,
      companyId,
      companyName: companyName || "",
      name,
      description: description || "",
      features: features || "",
      targetProblems: targetProblems || "",
      createdAt: now,
      updatedAt: now,
    };

    await kv.hset("services", { [id]: service });

    return NextResponse.json({ success: true, data: service });
  } catch (error) {
    console.error("Service create error:", error);
    return NextResponse.json(
      { success: false, error: "サービスの登録に失敗しました" },
      { status: 500 }
    );
  }
}
