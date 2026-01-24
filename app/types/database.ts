// Supabaseデータベース型定義

export type TopicStatus = "未着手" | "対応中" | "完了";
export type Priority = "A" | "B" | "C";
export type DispatchStatus = "NOT_SENT" | "SENT" | "COMPLETED";
export type CallResultType =
  | "未実施"
  | "不通"
  | "受付止まり"
  | "担当につながった"
  | "折り返し依頼"
  | "面談OK"
  | "NG";
export type NextActionType =
  | "再架電"
  | "資料送付"
  | "メール送付"
  | "折返待ち"
  | "面談日程調整"
  | "クローズ";

// 企業テーブル
export interface Company {
  id: string;
  company_id: string;
  company_name: string;
  company_file_id: string | null;
  script_base: string | null;
  created_at: string;
  updated_at: string;
}

// トピックテーブル
export interface Topic {
  id: string;
  company_id: string | null;
  company_row_key: string;

  // 議会情報
  prefecture: string | null;
  city: string | null;
  council_date: string | null;
  title: string | null;
  summary: string | null;
  questioner: string | null;
  answerer: string | null;
  source_url: string | null;

  // SRT関連
  group_id: string | null;
  start_sec: number | null;
  end_sec: number | null;
  excerpt_text: string | null;
  excerpt_range: string | null;

  // ステータス
  status: TopicStatus;
  priority: Priority;
  dispatch_status: DispatchStatus;

  // AI生成
  script_draft: string | null;
  ai_summary: string | null;

  created_at: string;
  updated_at: string;
}

// 架電結果テーブル
export interface CallResult {
  id: string;
  topic_id: string;

  call_result: CallResultType | null;
  next_action: NextActionType | null;
  next_date: string | null;
  memo: string | null;

  // クライアント提出用
  contact_name: string | null;
  department: string | null;
  phone: string | null;

  logged_by: string | null;
  logged_at: string;
}

// SRTインデックステーブル
export interface SrtIndex {
  id: string;
  group_id: string;
  file_id: string;
  file_name: string | null;
  created_at: string;
}

// フロントエンド用: トピックと最新の架電結果を結合したビュー
export interface TopicWithCallResult extends Topic {
  latest_call_result?: CallResult | null;
  company?: Company | null;
}

// インサート用型
export type InsertCompany = Omit<Company, "id" | "created_at" | "updated_at">;
export type InsertTopic = Omit<Topic, "id" | "created_at" | "updated_at">;
export type InsertCallResult = Omit<CallResult, "id" | "logged_at">;

// 更新用型
export type UpdateTopic = Partial<Omit<Topic, "id" | "company_row_key" | "created_at" | "updated_at">>;
export type UpdateCallResult = Partial<Omit<CallResult, "id" | "topic_id" | "logged_at">>;
