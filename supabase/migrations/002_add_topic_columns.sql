-- 追加マイグレーション: トピックテーブルに新しい列を追加
-- 作成日: 2026-01-24

-- 外部議題ID（元データの識別子）
ALTER TABLE topics ADD COLUMN IF NOT EXISTS external_id TEXT;

-- カテゴリ
ALTER TABLE topics ADD COLUMN IF NOT EXISTS category TEXT;

-- 立場（導入状況）
ALTER TABLE topics ADD COLUMN IF NOT EXISTS stance TEXT;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_topics_external_id ON topics(external_id);
CREATE INDEX IF NOT EXISTS idx_topics_category ON topics(category);
CREATE INDEX IF NOT EXISTS idx_topics_stance ON topics(stance);
