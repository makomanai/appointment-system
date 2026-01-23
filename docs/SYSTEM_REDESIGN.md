# システム再設計 - 要件定義書

## 現状の課題

### GAS/スプレッドシート運用の問題点
- 企業ごとにGASスクリプトを個別管理 → 更新が面倒
- GASデプロイの複雑さ、エンドポイントの不安定さ
- スクリプト更新時に各企業ファイルへの反映が必要

---

## ビジネス目標

**商談率を極限まで上げる**ために以下を実現：

1. **情報伝達の高速化**
   - 時間が経つと商談相手の気が変わるケースがある
   - スピーディにクライアントへ情報を伝える

2. **情報リレーの事故防止**
   - クライアントへの渡しそびれをなくす
   - アポインターの記録をそのままクライアントに渡せる（加工不要）
   - ボトルネックを排除

3. **クライアントの理解しやすさ**
   - 状況共有が一目でわかる形式

4. **アポインターの作業精度**
   - 現在のUIで納得してもらえている
   - エラーなく記録できることが最重要

---

## 現行システム構成

### データフロー
```
別DB → CSVダウンロード → topics_master取込 → 企業ファイルへ配布(Push)
                                    ↓
                              SRTファイルと合体
                                    ↓
                            アポインターが架電・記録
                                    ↓
                              ログ吸い上げ(Pull)
                                    ↓
                         クライアントへデータ提供
```

### データソース
- **SRTファイル**: Google Drive上に2.5GB
- **トピックデータ**: 別DBから事前にフィルタリング済みでダウンロード
- **SRT + トピック**: GASで合体処理

### マスタースプレッドシート構成
| シート名 | 用途 |
|---------|------|
| topics_master | 案件の本体（配布元） |
| companies | 企業台帳 |
| srt_index | SRTファイルの索引 |
| logs_master | 回収ログの倉庫 |

### 企業ファイル構成（各社ごと）
| シート名 | 用途 |
|---------|------|
| queue | 案件一覧・入力欄 |
| script_base | 企業専用の話法・設定 |
| log | 架電ログ |

---

## データ構造

### topics_master 主要列
- company_id, company_row_key, status, dispatch_status
- 議会の日付, 議題タイトル, 議題概要
- 質問者, 回答者, ソースURL
- excerpt_text, excerpt_range
- 開始秒数, 終了秒数, グループID

### 企業ファイル queue 主要列
- status (未着手/対応中/完了)
- priority (A/B/C)
- call_result, memo, script_draft
- excerpt_text, excerpt_range
- 都道府県, 市町村, 議会/日付
- 議題タイトル, 議題概要, 質問者/回答者
- ソースURL, next_action, next_date
- company_row_key, log_status

### 結果入力フォーム（UIで入力する項目）
```
- ステータス: 未着手 / 対応中 / 完了
- 優先度: A / B / C
- 架電結果: 未実施/不通/受付止まり/担当につながった/折り返し依頼/面談OK/NG
- 次のアクション: 再架電/資料送付/メール送付/折返待ち/面談日程調整/クローズ
- 次回日程: 日付
- 必須情報（クライアント提出用）:
  - 担当者名
  - 部署名
  - 電話番号
- その他メモ: 自由記述
```

---

## 要件

### 機能要件

1. **企業分離表示**
   - UI上で会社ごとにデータを分離表示（アポインターの混乱防止）
   - データは統合管理でも可

2. **管理者機能**
   - トピックデータのアップロード・管理
   - 見込みの高いデータの事前整理
   - 企業ごとのデータ割り当て

3. **エクスポート機能**
   - 企業ごとにデータをダウンロード可能
   - クライアントが再コンタクトできる形式

4. **SRT連携**
   - トピックの発言箇所をSRTから抽出
   - 前後5分の範囲で抽出

### 非機能要件

1. **信頼性**: エラーなく記録できる
2. **速度**: 情報リレーの高速化
3. **保守性**: GASの個別管理から解放
4. **コスト**: 無料枠内での運用が望ましい

---

## 新アーキテクチャ案

### 構成
```
┌─────────────────────────────────────────────┐
│               Google Drive                   │
│            (SRTファイル 2.5GB)               │
└──────────────────┬──────────────────────────┘
                   │ Google Drive API
                   ▼
┌─────────────────────────────────────────────┐
│            Next.js アプリ                    │
│  ・SRT読み込み・パース                       │
│  ・トピック管理                              │
│  ・AI台本生成                                │
│  ・エクスポート機能                          │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│         データベース (Supabase)              │
│  ・companies (企業)                          │
│  ・topics (トピック・字幕データ)             │
│  ・call_results (架電結果)                   │
│  ・logs (ログ)                               │
└─────────────────────────────────────────────┘
```

### メリット
- GAS不要 → スクリプト個別管理から解放
- 無料枠で対応可能 → Supabase 500MB無料
- エクスポート簡単 → SQLでフィルタしてCSV出力
- バックアップ自動 → DBなので堅牢
- 現在のUIを維持可能

### DB設計案

```sql
-- 企業テーブル
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  company_id TEXT UNIQUE,
  company_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- トピックテーブル
CREATE TABLE topics (
  id UUID PRIMARY KEY,
  company_id TEXT REFERENCES companies(company_id),
  company_row_key TEXT UNIQUE,

  -- 議会情報
  prefecture TEXT,
  city TEXT,
  council_date DATE,
  title TEXT,
  summary TEXT,
  questioner TEXT,
  answerer TEXT,
  source_url TEXT,

  -- SRT関連
  group_id TEXT,
  start_sec INTEGER,
  end_sec INTEGER,
  excerpt_text TEXT,
  excerpt_range TEXT,

  -- ステータス
  status TEXT DEFAULT '未着手',
  priority TEXT DEFAULT 'A',
  dispatch_status TEXT DEFAULT 'NOT_SENT',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 架電結果テーブル
CREATE TABLE call_results (
  id UUID PRIMARY KEY,
  topic_id UUID REFERENCES topics(id),

  call_result TEXT,
  next_action TEXT,
  next_date DATE,
  memo TEXT,

  -- クライアント提出用
  contact_name TEXT,
  department TEXT,
  phone TEXT,

  logged_at TIMESTAMP DEFAULT NOW()
);
```

---

## 移行計画

### Phase 1: DB設計・API構築
- Supabase設定
- テーブル作成
- API エンドポイント実装

### Phase 2: データ移行
- 既存スプレッドシートからデータエクスポート
- DBへインポート

### Phase 3: フロントエンド対応
- 既存UIを維持しながらバックエンドを切り替え
- エクスポート機能追加

### Phase 4: 運用切り替え
- テスト運用
- 本番切り替え

---

## 注意事項（運用マニュアルより）

### 絶対NG（現行システム）
1. topics_master の列名変更・並べ替え
2. srt_index の A列(group_id) と B列(file_id) を手でいじる
3. topics_master の行を並べ替えて運用
4. dispatch_status を手で変更

### 削除ルール
- company_row_key が入った行は削除NG（ログと突合できなくなる）
- company_file_id が入っている行は削除NG

---

## 作成日
2026-01-23

## 更新履歴
- 2026-01-23: 初版作成（現行システム分析・要件整理）
