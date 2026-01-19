import { NextResponse } from "next/server";
import { fetchCompanies } from "@/app/lib/sheets";

// 開発用モックデータ
const mockCompanies = [
  {
    companyId: "C001",
    companyName: "aitegrity",
    companyFileId: "mock_file_id_001",
  },
  {
    companyId: "C002",
    companyName: "ウルフカムイ",
    companyFileId: "mock_file_id_002",
  },
  {
    companyId: "C003",
    companyName: "アクセリア",
    companyFileId: "mock_file_id_003",
  },
  {
    companyId: "C008",
    companyName: "ミライズエネチェンジ",
    companyFileId: "mock_file_id_008",
  },
  {
    companyId: "C009",
    companyName: "エピックベース株式会社",
    companyFileId: "mock_file_id_009",
  },
];

export async function GET() {
  try {
    // GAS_ENDPOINTが設定されていない場合はモックデータを返す
    if (!process.env.GAS_ENDPOINT || process.env.GAS_ENDPOINT === "your_gas_endpoint_here") {
      return NextResponse.json({
        success: true,
        data: mockCompanies,
        isMock: true,
      });
    }

    const companies = await fetchCompanies();
    return NextResponse.json({
      success: true,
      data: companies,
    });
  } catch (error) {
    console.error("Failed to fetch companies:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
