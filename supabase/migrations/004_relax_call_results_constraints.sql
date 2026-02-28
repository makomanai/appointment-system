-- call_resultsテーブルのCHECK制約を緩和
-- 作成日: 2026-02-18
--
-- 問題: フロントエンドの入力値とDBのCHECK制約が不一致のため、
-- INSERTが失敗しデータが保存されていなかった。
--
-- call_result: フロントエンドはtextareaで自由入力 → 固定enum不適合
-- next_action: フロントエンドの選択肢（再コール, アポ確定, 見送り, 担当者不在, その他）
--             がDBの制約値（再架電, 面談日程調整, クローズ）と一致しない

-- call_result の CHECK 制約を削除（自由テキスト入力に対応）
ALTER TABLE call_results DROP CONSTRAINT IF EXISTS call_results_call_result_check;

-- next_action の CHECK 制約を削除し、フロントエンドの選択肢に合わせて再作成
ALTER TABLE call_results DROP CONSTRAINT IF EXISTS call_results_next_action_check;
ALTER TABLE call_results ADD CONSTRAINT call_results_next_action_check
  CHECK (next_action IN (
    '再架電', '資料送付', 'メール送付', '折返待ち', '面談日程調整', 'クローズ',
    '再コール', 'アポ確定', '見送り', '担当者不在', 'その他'
  ));
