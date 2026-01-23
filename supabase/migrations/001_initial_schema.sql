-- システム再設計: 初期スキーマ
-- 作成日: 2026-01-23

-- 企業テーブル
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL,
  company_file_id TEXT, -- 旧スプレッドシートID（移行用）
  script_base TEXT, -- 企業専用の話法・設定
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- トピックテーブル
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT REFERENCES companies(company_id),
  company_row_key TEXT UNIQUE NOT NULL,

  -- 議会情報
  prefecture TEXT, -- 都道府県
  city TEXT, -- 市町村
  council_date DATE, -- 議会の日付
  title TEXT, -- 議題タイトル
  summary TEXT, -- 議題概要
  questioner TEXT, -- 質問者
  answerer TEXT, -- 回答者
  source_url TEXT, -- ソースURL

  -- SRT関連
  group_id TEXT, -- SRTファイルのグループID
  start_sec INTEGER, -- 開始秒数
  end_sec INTEGER, -- 終了秒数
  excerpt_text TEXT, -- 抽出テキスト
  excerpt_range TEXT, -- 抽出範囲

  -- ステータス
  status TEXT DEFAULT '未着手' CHECK (status IN ('未着手', '対応中', '完了')),
  priority TEXT DEFAULT 'A' CHECK (priority IN ('A', 'B', 'C')),
  dispatch_status TEXT DEFAULT 'NOT_SENT' CHECK (dispatch_status IN ('NOT_SENT', 'SENT', 'COMPLETED')),

  -- AI生成スクリプト
  script_draft TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 架電結果テーブル
CREATE TABLE IF NOT EXISTS call_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,

  -- 架電結果
  call_result TEXT CHECK (call_result IN (
    '未実施', '不通', '受付止まり', '担当につながった',
    '折り返し依頼', '面談OK', 'NG'
  )),
  next_action TEXT CHECK (next_action IN (
    '再架電', '資料送付', 'メール送付', '折返待ち',
    '面談日程調整', 'クローズ'
  )),
  next_date DATE,
  memo TEXT,

  -- クライアント提出用必須情報
  contact_name TEXT, -- 担当者名
  department TEXT, -- 部署名
  phone TEXT, -- 電話番号

  -- ログ情報
  logged_by TEXT, -- 記録者
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SRTインデックステーブル
CREATE TABLE IF NOT EXISTS srt_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT UNIQUE NOT NULL,
  file_id TEXT NOT NULL, -- Google DriveのファイルID
  file_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 更新日時の自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_topics_updated_at
  BEFORE UPDATE ON topics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- インデックス
CREATE INDEX IF NOT EXISTS idx_topics_company_id ON topics(company_id);
CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);
CREATE INDEX IF NOT EXISTS idx_topics_dispatch_status ON topics(dispatch_status);
CREATE INDEX IF NOT EXISTS idx_call_results_topic_id ON call_results(topic_id);
CREATE INDEX IF NOT EXISTS idx_srt_index_group_id ON srt_index(group_id);

-- Row Level Security (RLS) 有効化
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE srt_index ENABLE ROW LEVEL SECURITY;

-- 基本的なRLSポリシー（認証済みユーザーは全てアクセス可能）
CREATE POLICY "Authenticated users can read companies" ON companies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read topics" ON topics
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read call_results" ON call_results
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read srt_index" ON srt_index
  FOR SELECT TO authenticated USING (true);

-- 書き込み権限（認証済みユーザー）
CREATE POLICY "Authenticated users can insert topics" ON topics
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update topics" ON topics
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert call_results" ON call_results
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update call_results" ON call_results
  FOR UPDATE TO authenticated USING (true);

-- サービスロール用ポリシー（バックエンドからのフルアクセス）
CREATE POLICY "Service role has full access to companies" ON companies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to topics" ON topics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to call_results" ON call_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to srt_index" ON srt_index
  FOR ALL TO service_role USING (true) WITH CHECK (true);
