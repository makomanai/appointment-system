# JS-NEXT データエクスポートAPI 仕様書

## 概要

本ドキュメントは、JS-NEXTの議会データを外部システムから取得するためのAPIエンドポイントの実装仕様です。
現在、Webブラウザ自動操作（Playwright）でCSVダウンロードを行っていますが、サーバーレス環境での運用が困難なため、REST APIでのデータ取得を希望します。

---

## 1. 認証

### 1.1 認証方式
以下のいずれかを希望（優先順位順）:

1. **APIキー認証**（推奨）
   - リクエストヘッダーに `X-API-Key` を付与
   - 例: `X-API-Key: your-api-key-here`

2. **Bearer Token認証**
   - OAuth2またはJWT形式
   - 例: `Authorization: Bearer <token>`

3. **Basic認証**
   - 既存のログイン情報（メール/パスワード）を使用
   - 例: `Authorization: Basic <base64(email:password)>`

### 1.2 認証エンドポイント（Bearer Tokenの場合）

```
POST /api/v1/auth/token
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**レスポンス:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

---

## 2. データエクスポートAPI

### 2.1 エンドポイント

```
GET /api/v1/export/answers
```

または

```
POST /api/v1/export/answers
Content-Type: application/json
```

### 2.2 リクエストパラメータ

| パラメータ | 型 | 必須 | 説明 | 例 |
|-----------|------|------|------|-----|
| `keyword` | string | × | 検索キーワード（スペース区切りでOR検索） | `児童虐待 児童相談` |
| `category` | string | × | カテゴリー | `福祉` |
| `stance` | string | × | 立場 | |
| `prefecture` | string | × | 都道府県 | `東京都` |
| `city` | string | × | 市区町村 | `新宿区` |
| `questioner` | string | × | 質問者名 | |
| `answerer` | string | × | 回答者名 | |
| `start_date` | string | × | 開始日（YYYY-MM-DD形式） | `2024-01-01` |
| `end_date` | string | × | 終了日（YYYY-MM-DD形式） | `2024-12-31` |
| `source` | string | × | ソース | |
| `limit` | integer | × | 取得件数上限（デフォルト: 1000） | `500` |
| `offset` | integer | × | オフセット（ページネーション用） | `0` |
| `format` | string | × | レスポンス形式（`json` or `csv`、デフォルト: `json`） | `json` |

### 2.3 リクエスト例

**GET方式:**
```
GET /api/v1/export/answers?keyword=児童虐待&start_date=2024-10-01&end_date=2025-01-31&limit=500
Authorization: X-API-Key: your-api-key
```

**POST方式:**
```
POST /api/v1/export/answers
Content-Type: application/json
Authorization: X-API-Key: your-api-key

{
  "keyword": "児童虐待 児童相談 虐待",
  "start_date": "2024-10-01",
  "end_date": "2025-01-31",
  "limit": 500
}
```

---

## 3. レスポンス仕様

### 3.1 JSON形式（format=json）

```json
{
  "success": true,
  "total_count": 1234,
  "returned_count": 500,
  "has_more": true,
  "data": [
    {
      "group_id": "pdbwk0Yxe7g",
      "prefecture": "東京都",
      "city": "新宿区",
      "council_date": "2024-12-15",
      "title": "児童虐待防止対策について",
      "summary": "児童虐待の早期発見と対応について質問...",
      "questioner": "山田太郎",
      "answerer": "福祉部長",
      "source_url": "https://www.youtube.com/watch?v=pdbwk0Yxe7g",
      "start_sec": 1200,
      "end_sec": 1800,
      "external_id": "topic_12345",
      "category": "福祉",
      "stance": ""
    },
    ...
  ]
}
```

### 3.2 フィールド定義

| フィールド | 型 | 説明 |
|-----------|------|------|
| `group_id` | string | グループID（YouTube動画IDなど） |
| `prefecture` | string | 都道府県 |
| `city` | string | 市区町村 |
| `council_date` | string | 議会日付（YYYY-MM-DD形式） |
| `title` | string | 議題タイトル |
| `summary` | string | 議題概要 |
| `questioner` | string | 質問者 |
| `answerer` | string | 回答者 |
| `source_url` | string | ソースURL（動画URLなど） |
| `start_sec` | integer | 開始秒数 |
| `end_sec` | integer | 終了秒数 |
| `external_id` | string | 議題ID（外部ID） |
| `category` | string | カテゴリー |
| `stance` | string | 立場 |

### 3.3 CSV形式（format=csv）

現在の「答弁エクスポート」と同じCSV形式で返却:

```csv
グループid,都道府県,市町村,議会の日付,議題タイトル,議題概要,質問者,回答者,ソースURL,開始秒数,終了秒数,議題ID,カテゴリ,立場
pdbwk0Yxe7g,東京都,新宿区,2024-12-15,児童虐待防止対策について,...
```

---

## 4. エラーレスポンス

### 4.1 エラー形式

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "認証に失敗しました"
  }
}
```

### 4.2 エラーコード一覧

| HTTPステータス | コード | 説明 |
|---------------|--------|------|
| 400 | `INVALID_PARAMETER` | パラメータが不正 |
| 401 | `UNAUTHORIZED` | 認証失敗 |
| 403 | `FORBIDDEN` | アクセス権限なし |
| 404 | `NOT_FOUND` | データが見つからない |
| 429 | `RATE_LIMIT_EXCEEDED` | レート制限超過 |
| 500 | `INTERNAL_ERROR` | サーバー内部エラー |

---

## 5. レート制限（希望）

| 項目 | 制限値 |
|------|--------|
| リクエスト/分 | 60回 |
| リクエスト/日 | 10,000回 |
| 1リクエストあたり最大件数 | 1,000件 |

---

## 6. 差分取得（オプション）

効率的なデータ同期のため、差分取得機能があると助かります:

### 6.1 更新日時による絞り込み

```
GET /api/v1/export/answers?updated_since=2025-01-15T00:00:00Z
```

| パラメータ | 型 | 説明 |
|-----------|------|------|
| `updated_since` | datetime | 指定日時以降に更新されたデータのみ取得（ISO 8601形式） |

---

## 7. 実装スケジュール（希望）

| フェーズ | 内容 | 希望時期 |
|---------|------|----------|
| Phase 1 | 基本的なエクスポートAPI | 2週間以内 |
| Phase 2 | 認証機能 | 3週間以内 |
| Phase 3 | 差分取得機能 | 1ヶ月以内 |

---

## 8. 連携イメージ

```
┌─────────────────┐     API Request      ┌─────────────┐
│                 │ ──────────────────→  │             │
│  当社システム    │                      │   JS-NEXT   │
│  (Vercel)       │  ←──────────────────  │   Server    │
│                 │     JSON/CSV Response │             │
└─────────────────┘                       └─────────────┘
```

**現在の方式（Playwright）:**
- ブラウザ自動操作が必要
- サーバーレス環境で実行不可
- エラーが発生しやすい

**希望する方式（REST API）:**
- シンプルなHTTPリクエスト
- サーバーレス環境で実行可能
- 安定した連携が可能

---

## 9. テスト環境

API実装後、以下の環境でテストを希望します:

- **ステージング環境**での先行テスト
- **本番環境**への段階的移行

---

## 10. 問い合わせ先

ご不明点がございましたら、以下までご連絡ください:

- 担当者: [担当者名]
- メール: [メールアドレス]
- 電話: [電話番号]

---

## 付録: 現在の連携仕様

### 現在使用しているCSVエクスポートの検索条件

| 項目 | 値 |
|------|-----|
| URL | https://js-next.com |
| 機能 | 答弁エクスポート |
| 検索条件 | キーワード、日付範囲、カテゴリ等 |
| 出力形式 | CSV（Shift-JIS or UTF-8） |

### 現在のデータ利用方法

1. JS-NEXTにログイン
2. 検索条件を設定
3. 「答弁エクスポート」ボタンでCSVダウンロード
4. CSVをパースしてDBに投入

**API化により期待される効果:**
- 自動化の安定性向上
- サーバーレス環境での運用可能
- エラー発生時の原因特定が容易
