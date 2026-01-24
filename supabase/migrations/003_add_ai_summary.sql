-- AI要約カラムを追加
-- 作成日: 2026-01-24

-- topicsテーブルにai_summaryカラムを追加
ALTER TABLE topics ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- コメント
COMMENT ON COLUMN topics.ai_summary IS '抽出テキストからAIが生成した要約';
