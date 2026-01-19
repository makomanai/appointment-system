// 企業マスターの型
export interface Company {
  companyId: string;      // 例: "C009"
  companyName: string;    // 例: "エピックベース株式会社"
  companyFileId: string;  // 企業別スプレッドシートのID
}

// 選択中の企業情報
export interface SelectedCompany {
  companyId: string;
  companyName: string;
  companyFileId: string;
}

// call_viewシートのデータ型
export interface CallViewData {
  // A列: 議会/日付
  councilDate: string;
  // B列: 議題タイトル
  agendaTitle: string;
  // C列: 議題概要
  agendaSummary: string;
  // D列: 質問者/回答者
  speakers: string;
  // E列: ソースURL（1つ目）
  sourceUrl1: string;
  // F列: ソースURL（2つ目）
  sourceUrl2: string;
  // G列: 抜粋期間
  excerptRange: string;
  // H列: 抜粋テキスト(B9)
  excerptText: string;
  // I列: AI要約(B10)
  aiSummary: string;
  // K列: AI台本(B12)
  aiScript: string;
  // M列: 確定関連(B14)
  confirmedRelation: string;
  // O列: 脚本ベース(script_draft)
  scriptDraft: string;
  // ステータス関連
  status: Status;
  priority: Priority;
  callResult: string;
  nextAction: string;
  nextDate: string;
  memo: string;
  // 識別子
  companyRowKey: string;
}

// ステータスの型
export type Status = "未着手" | "対応中" | "完了";

// 優先度の型
export type Priority = "A" | "B" | "C";

// 次のアクションの型
export type NextAction =
  | "再コール"
  | "資料送付"
  | "アポ確定"
  | "見送り"
  | "担当者不在"
  | "その他";

// 結果入力フォームの型
export interface CallResultForm {
  status: Status;
  priority: Priority;
  callResult: string;
  nextAction: NextAction | "";
  nextDate: string;
  memo: string;
}

// AIスクリプトのステップ
export interface ScriptStep {
  id: string;
  title: string;
  content: string;
}

// スクリプトのステップ定義
export const SCRIPT_STEPS = [
  { id: "reception", title: "【受付】担当者指名" },
  { id: "chief", title: "【係長】共感・引用" },
  { id: "proposal", title: "【打診】ハードル下げ" },
  { id: "phase", title: "【フェーズ確認】" },
  { id: "counter", title: "【切り返し】" },
] as const;
