// Google Apps Script (GAS) 連携設定
import { Company, CallViewData } from "../types";

// 環境変数
const GAS_ENDPOINT = process.env.GAS_ENDPOINT;
const MASTER_SPREADSHEET_ID = process.env.MASTER_SPREADSHEET_ID;

interface SheetData {
  [key: string]: unknown;
}

// GASレスポンスの型
interface GASResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 企業一覧を取得（マスタースプレッドシートのcompaniesシートから）
 */
export async function fetchCompanies(): Promise<Company[]> {
  if (!GAS_ENDPOINT) {
    throw new Error("GAS_ENDPOINT is not set");
  }

  const url = new URL(GAS_ENDPOINT);
  url.searchParams.set("action", "getCompanies");
  if (MASTER_SPREADSHEET_ID) {
    url.searchParams.set("spreadsheetId", MASTER_SPREADSHEET_ID);
  }

  console.log("[fetchCompanies] リクエストURL:", url.toString());

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
  });

  console.log("[fetchCompanies] レスポンスステータス:", response.status);
  console.log("[fetchCompanies] レスポンスURL:", response.url);

  if (!response.ok) {
    throw new Error(`GAS API error: ${response.status}`);
  }

  const result: GASResponse<Company[]> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch companies");
  }

  return result.data;
}

/**
 * 指定した企業のcall_viewデータを取得
 */
export async function fetchCallViewByCompany(
  companyFileId: string
): Promise<CallViewData[]> {
  if (!GAS_ENDPOINT) {
    throw new Error("GAS_ENDPOINT is not set");
  }

  const url = new URL(GAS_ENDPOINT);
  url.searchParams.set("action", "getCallView");
  url.searchParams.set("spreadsheetId", companyFileId);

  console.log("[fetchCallViewByCompany] リクエストURL:", url.toString());

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
  });

  console.log("[fetchCallViewByCompany] レスポンスステータス:", response.status);
  console.log("[fetchCallViewByCompany] レスポンスURL:", response.url);

  if (!response.ok) {
    throw new Error(`GAS API error: ${response.status}`);
  }

  const result: GASResponse<CallViewData[]> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch call view data");
  }

  return result.data;
}

/**
 * 汎用的なシートデータ取得（後方互換性のため残す）
 */
export async function fetchSheetData(): Promise<SheetData[]> {
  if (!GAS_ENDPOINT) {
    throw new Error("GAS_ENDPOINT is not set");
  }

  console.log("[fetchSheetData] リクエストURL:", GAS_ENDPOINT);

  const response = await fetch(GAS_ENDPOINT, {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
  });

  console.log("[fetchSheetData] レスポンスステータス:", response.status);

  if (!response.ok) {
    throw new Error(`GAS API error: ${response.status}`);
  }

  return response.json();
}

/**
 * シートにデータを保存（企業のlogシートへ）
 */
export async function saveToSheet(
  data: SheetData,
  companyFileId?: string
): Promise<void> {
  if (!GAS_ENDPOINT) {
    throw new Error("GAS_ENDPOINT is not set");
  }

  const response = await fetch(GAS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "saveLog",
      spreadsheetId: companyFileId,
      ...data,
    }),
  });

  if (!response.ok) {
    throw new Error(`GAS API error: ${response.status}`);
  }
}
