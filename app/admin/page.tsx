"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Company {
  companyId: string;
  companyName: string;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // CSVプレビュー用
  const [csvPreview, setCsvPreview] = useState<{
    headers: string[];
    rows: string[][];
    mappedHeaders: Record<string, string>;
  } | null>(null);

  // AIランク付け用（キーワード版）
  const [rankCompanyId, setRankCompanyId] = useState("");
  const [isRanking, setIsRanking] = useState(false);
  const [rankResult, setRankResult] = useState<{ S: number; A: number; B: number; C: number } | null>(null);

  // AIランク付け用（AI判定版）
  const [aiRankCompanyId, setAiRankCompanyId] = useState("");
  const [aiRankLimit, setAiRankLimit] = useState(50);
  const [isAiRanking, setIsAiRanking] = useState(false);
  const [aiRankResult, setAiRankResult] = useState<{
    summary: { S: number; A: number; B: number; C: number };
    results: Array<{
      topicId: string;
      title: string;
      rank: string;
      score: number;
      reasoning: string;
      oldPriority?: string;
      newPriority?: string;
    }>;
  } | null>(null);

  // SRT読み込み用（手動）
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [srtGroupId, setSrtGroupId] = useState("");
  const [isParsingSrt, setIsParsingSrt] = useState(false);
  const [srtLinkResult, setSrtLinkResult] = useState<{
    updatedCount: number;
    skippedCount: number;
    topicsFound: number;
    srtEntries: number;
  } | null>(null);

  // SRT自動紐付け用（Google Drive）
  const [autoLinkCompanyId, setAutoLinkCompanyId] = useState("");
  const [isAutoLinking, setIsAutoLinking] = useState(false);
  const [autoLinkResult, setAutoLinkResult] = useState<{
    processed: number;
    updated: number;
    skipped: number;
    failed: number;
  } | null>(null);

  // AI要約生成用
  const [summarizeCompanyId, setSummarizeCompanyId] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarizeResult, setSummarizeResult] = useState<{
    processed: number;
    updated: number;
    skipped: number;
    failed: number;
  } | null>(null);

  // 企業新規登録用
  const [newCompanyName, setNewCompanyName] = useState("");
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);

  // 認証チェック
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // 企業一覧を取得
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch("/api/companies");
        const result = await response.json();
        if (result.success) {
          setCompanies(result.data || []);
        }
      } catch (error) {
        console.error("Failed to fetch companies:", error);
      }
    };

    fetchCompanies();
  }, []);

  // ヘッダー名のマッピング
  const headerMapping: Record<string, string> = {
    企業ID: "company_id",
    企業id: "company_id",
    都道府県: "prefecture",
    市町村: "city",
    議会日付: "council_date",
    "議会の日付": "council_date",
    議題タイトル: "title",
    タイトル: "title",
    議題概要: "summary",
    概要: "summary",
    質問者: "questioner",
    回答者: "answerer",
    ソースURL: "source_url",
    URL: "source_url",
    グループID: "group_id",
    group_id: "group_id",
    開始秒数: "start_sec",
    終了秒数: "end_sec",
    議題ID: "external_id",
    カテゴリ: "category",
    立場: "stance",
  };

  // CSVをパースしてプレビュー
  const parseCSVForPreview = (text: string) => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 1) return null;

    // ヘッダー行をパース
    const headers = parseCSVLine(lines[0]);

    // マッピングを作成
    const mappedHeaders: Record<string, string> = {};
    headers.forEach((h) => {
      const normalized = h.trim();
      mappedHeaders[normalized] = headerMapping[normalized] || normalized.toLowerCase().replace(/\s+/g, "_");
    });

    // データ行（最大5行）
    const rows: string[][] = [];
    for (let i = 1; i < Math.min(lines.length, 6); i++) {
      rows.push(parseCSVLine(lines[i]));
    }

    return { headers, rows, mappedHeaders };
  };

  // CSV行をパース（クォート対応）
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  // ファイル選択
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setMessage(null);

      // CSVをプレビュー用にパース
      try {
        const text = await selectedFile.text();
        const preview = parseCSVForPreview(text);
        setCsvPreview(preview);
      } catch {
        setCsvPreview(null);
      }
    }
  };

  // SRTファイル選択
  const handleSrtFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setSrtFile(selectedFile);
      setSrtLinkResult(null);
      setMessage(null);
    }
  };

  // SRT自動紐付け（Google Drive）
  const handleAutoLink = async () => {
    if (!autoLinkCompanyId) {
      return;
    }

    setIsAutoLinking(true);
    setAutoLinkResult(null);

    try {
      const response = await fetch("/api/v2/srt/auto-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId: autoLinkCompanyId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setAutoLinkResult({
          processed: result.processed,
          updated: result.updated,
          skipped: result.skipped,
          failed: result.failed,
        });
        setMessage({ type: "success", text: result.message });
      } else {
        setMessage({ type: "error", text: result.error || "自動紐付けに失敗しました" });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "自動紐付けに失敗しました",
      });
    } finally {
      setIsAutoLinking(false);
    }
  };

  // 企業新規登録
  const handleCreateCompany = async () => {
    if (!newCompanyName) {
      setMessage({ type: "error", text: "企業名を入力してください" });
      return;
    }

    setIsCreatingCompany(true);

    try {
      const response = await fetch("/api/v2/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_name: newCompanyName,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const newId = result.data?.company_id || "";
        setMessage({ type: "success", text: `企業「${newCompanyName}」を登録しました（ID: ${newId}）` });
        setNewCompanyName("");
        // 企業一覧を再取得
        const refreshResponse = await fetch("/api/companies");
        const refreshResult = await refreshResponse.json();
        if (refreshResult.success) {
          setCompanies(refreshResult.data || []);
        }
      } else {
        setMessage({ type: "error", text: result.error || "企業登録に失敗しました" });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "企業登録に失敗しました",
      });
    } finally {
      setIsCreatingCompany(false);
    }
  };

  // SRT紐付け処理
  const handleLinkSrt = async () => {
    if (!srtFile || !srtGroupId) {
      setMessage({ type: "error", text: "グループIDとSRTファイルを指定してください" });
      return;
    }

    setIsParsingSrt(true);
    setSrtLinkResult(null);

    try {
      const formData = new FormData();
      formData.append("file", srtFile);
      formData.append("groupId", srtGroupId);

      const response = await fetch("/api/v2/srt/link", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setSrtLinkResult({
          updatedCount: result.updatedCount,
          skippedCount: result.skippedCount,
          topicsFound: result.topicsFound,
          srtEntries: result.srtEntries,
        });
        setMessage({ type: "success", text: result.message });
      } else {
        setMessage({ type: "error", text: result.error || "SRTの紐付けに失敗しました" });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "SRTの紐付けに失敗しました",
      });
    } finally {
      setIsParsingSrt(false);
    }
  };

  // AI要約生成処理
  const handleSummarize = async () => {
    if (!summarizeCompanyId) {
      return;
    }

    setIsSummarizing(true);
    setSummarizeResult(null);

    try {
      const response = await fetch("/api/v2/topics/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId: summarizeCompanyId,
          forceUpdate: false,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSummarizeResult({
          processed: result.processed,
          updated: result.updated,
          skipped: result.skipped,
          failed: result.failed,
        });
        setMessage({ type: "success", text: result.message });
      } else {
        setMessage({ type: "error", text: result.error || "AI要約生成に失敗しました" });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "AI要約生成に失敗しました",
      });
    } finally {
      setIsSummarizing(false);
    }
  };

  // AIランク付け処理
  const handleRank = async () => {
    if (!rankCompanyId) {
      return;
    }

    setIsRanking(true);
    setRankResult(null);

    try {
      const response = await fetch("/api/v2/topics/rank", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId: rankCompanyId,
          updateDb: true,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setRankResult(result.summary);
        setMessage({ type: "success", text: result.message });
      } else {
        setMessage({ type: "error", text: result.error || "ランク付けに失敗しました" });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "ランク付けに失敗しました",
      });
    } finally {
      setIsRanking(false);
    }
  };

  // AI判定版ランク付け処理
  const handleAiRank = async () => {
    if (!aiRankCompanyId) {
      return;
    }

    setIsAiRanking(true);
    setAiRankResult(null);

    try {
      const response = await fetch("/api/v2/topics/rank-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId: aiRankCompanyId,
          updateDb: false, // テスト時はDB更新しない
          limit: aiRankLimit,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setAiRankResult({
          summary: result.summary,
          results: result.results,
        });
        setMessage({ type: "success", text: result.message });
      } else {
        setMessage({ type: "error", text: result.error || "AI判定に失敗しました" });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "AI判定に失敗しました",
      });
    } finally {
      setIsAiRanking(false);
    }
  };

  // アップロード処理
  const handleUpload = async () => {
    if (!file || !selectedCompanyId) {
      setMessage({ type: "error", text: "企業とファイルを選択してください" });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", selectedCompanyId);

      const response = await fetch("/api/v2/topics/import", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: "success", text: result.message });
        setFile(null);
        setCsvPreview(null);
        // ファイル入力をリセット
        const fileInput = document.getElementById("csv-file") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
      } else {
        setMessage({ type: "error", text: result.error || "アップロードに失敗しました" });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "アップロードに失敗しました",
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">管理画面</h1>
            <div className="flex items-center gap-4">
              <a href="/services" className="text-purple-600 hover:text-purple-800 text-sm">
                サービス管理
              </a>
              <a href="/" className="text-blue-600 hover:text-blue-800 text-sm">
                ← メイン画面に戻る
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* 企業新規登録セクション */}
        <section className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            企業新規登録
          </h2>

          <div className="space-y-4">
            {/* 企業名 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                企業名 *
              </label>
              <input
                type="text"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="例: 株式会社サンプル"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                企業IDは自動で採番されます（C001, C002, ...）
              </p>
            </div>

            {/* 登録ボタン */}
            <button
              onClick={handleCreateCompany}
              disabled={isCreatingCompany || !newCompanyName}
              className={`w-full py-3 rounded-lg font-medium text-white ${
                isCreatingCompany || !newCompanyName
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isCreatingCompany ? "登録中..." : "企業を登録"}
            </button>

            {/* 登録済み企業一覧 */}
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">登録済み企業 ({companies.length}件)</h3>
              <div className="flex flex-wrap gap-2">
                {companies.map((company) => (
                  <span
                    key={company.companyId}
                    className="inline-block bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-600"
                  >
                    {company.companyId}: {company.companyName}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CSVアップロードセクション */}
        <section className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            トピックCSVアップロード
          </h2>

          <div className="space-y-4">
            {/* 企業選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                企業を選択 *
              </label>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- 企業を選択 --</option>
                {companies.map((company) => (
                  <option key={company.companyId} value={company.companyId}>
                    {company.companyId} - {company.companyName}
                  </option>
                ))}
              </select>
            </div>

            {/* ファイル選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CSVファイル *
              </label>
              <input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {file && (
                <p className="text-sm text-gray-500 mt-1">
                  選択中: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            {/* CSVプレビュー */}
            {csvPreview && (
              <div className="border border-blue-200 rounded-lg overflow-hidden">
                <div className="bg-blue-50 px-3 py-2 border-b border-blue-200">
                  <h4 className="text-sm font-medium text-blue-800">
                    CSVプレビュー（先頭5行）
                  </h4>
                </div>

                {/* カラムマッピング */}
                <div className="px-3 py-2 bg-blue-50/50 border-b border-blue-100">
                  <p className="text-xs text-blue-700 mb-1">カラムマッピング:</p>
                  <div className="flex flex-wrap gap-1">
                    {csvPreview.headers.map((h, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center text-xs bg-white border border-blue-200 rounded px-2 py-0.5"
                      >
                        <span className="text-gray-600">{h}</span>
                        <span className="mx-1 text-gray-400">→</span>
                        <span className="text-blue-600 font-medium">
                          {csvPreview.mappedHeaders[h]}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* データプレビュー */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100">
                      <tr>
                        {csvPreview.headers.map((h, i) => (
                          <th key={i} className="px-2 py-1 text-left text-gray-700 border-b">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.rows.map((row, rowIdx) => (
                        <tr key={rowIdx} className="border-b border-gray-100">
                          {row.map((cell, cellIdx) => (
                            <td key={cellIdx} className="px-2 py-1 text-gray-800 max-w-[200px] truncate">
                              {cell || <span className="text-gray-400">-</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* メッセージ */}
            {message && (
              <div
                className={`p-3 rounded-lg ${
                  message.type === "success"
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {message.text}
              </div>
            )}

            {/* アップロードボタン */}
            <button
              onClick={handleUpload}
              disabled={isUploading || !file || !selectedCompanyId}
              className={`w-full py-3 rounded-lg font-medium text-white ${
                isUploading || !file || !selectedCompanyId
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isUploading ? "アップロード中..." : "アップロード"}
            </button>
          </div>

          {/* CSV形式の説明 */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              CSVファイル形式
            </h3>
            <p className="text-xs text-gray-600 mb-2">
              以下の列名に対応しています（日本語・英語どちらでも可）:
            </p>
            <code className="text-xs bg-gray-200 px-2 py-1 rounded block overflow-x-auto">
              都道府県, 市町村, 議会日付, 議題タイトル, 議題概要, 質問者, 回答者, ソースURL, group_id
            </code>
          </div>
        </section>

        {/* AIランク付けセクション */}
        <section className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            AI自動ランク付け（ゴールデンルール）
          </h2>

          <div className="space-y-4">
            {/* 企業選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                企業を選択 *
              </label>
              <select
                value={rankCompanyId}
                onChange={(e) => setRankCompanyId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- 企業を選択 --</option>
                {companies.map((company) => (
                  <option key={company.companyId} value={company.companyId}>
                    {company.companyId} - {company.companyName}
                  </option>
                ))}
              </select>
            </div>

            {/* ランク結果表示 */}
            {rankResult && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-800 mb-2">ランク付け結果</h3>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-red-100 p-2 rounded">
                    <div className="text-2xl font-bold text-red-600">{rankResult.S}</div>
                    <div className="text-xs text-red-600">Sランク</div>
                  </div>
                  <div className="bg-orange-100 p-2 rounded">
                    <div className="text-2xl font-bold text-orange-600">{rankResult.A}</div>
                    <div className="text-xs text-orange-600">Aランク</div>
                  </div>
                  <div className="bg-yellow-100 p-2 rounded">
                    <div className="text-2xl font-bold text-yellow-600">{rankResult.B}</div>
                    <div className="text-xs text-yellow-600">Bランク</div>
                  </div>
                  <div className="bg-gray-200 p-2 rounded">
                    <div className="text-2xl font-bold text-gray-600">{rankResult.C}</div>
                    <div className="text-xs text-gray-600">Cランク</div>
                  </div>
                </div>
              </div>
            )}

            {/* ランク付けボタン */}
            <button
              onClick={handleRank}
              disabled={isRanking || !rankCompanyId}
              className={`w-full py-3 rounded-lg font-medium text-white ${
                isRanking || !rankCompanyId
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {isRanking ? "ランク付け中..." : "AIランク付け実行"}
            </button>
          </div>

          {/* ゴールデンルール説明 */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-sm font-medium text-blue-800 mb-2">
              ゴールデンルール スコアリング
            </h3>
            <ul className="text-xs text-blue-700 space-y-1">
              <li><strong>タイミング (+4点):</strong> 来年度, 計画策定, 移行, 予算 など</li>
              <li><strong>具体的手段 (+5点):</strong> システム, アプリ, DX, チャットボット など</li>
              <li><strong>定量的根拠 (+3点):</strong> 削減, 効果, 課題, 未達 など</li>
              <li><strong>慎重姿勢 (-10点):</strong> 時期尚早, 見送り など</li>
              <li><strong>手遅れ (-5点):</strong> 契約済み, 導入済み など</li>
            </ul>
            <p className="text-xs text-blue-600 mt-2">
              S: 10点以上 / A: 6〜9点 / B: 1〜5点 / C: 0点以下
            </p>
          </div>
        </section>

        {/* AI判定版ランク付けセクション */}
        <section className="bg-white rounded-lg shadow-lg p-6 mb-8 border-2 border-purple-300">
          <h2 className="text-lg font-bold text-purple-800 mb-4">
            AI自動ランク付け（GPT-5.2判定版）
            <span className="ml-2 text-xs font-normal text-purple-600 bg-purple-100 px-2 py-1 rounded">テスト機能</span>
          </h2>

          <div className="space-y-4">
            {/* 企業選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                企業を選択 *
              </label>
              <select
                value={aiRankCompanyId}
                onChange={(e) => setAiRankCompanyId(e.target.value)}
                className="w-full border border-purple-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">-- 企業を選択 --</option>
                {companies.map((company) => (
                  <option key={company.companyId} value={company.companyId}>
                    {company.companyId} - {company.companyName}
                  </option>
                ))}
              </select>
            </div>

            {/* 件数制限 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                テスト件数（コスト節約のため）
              </label>
              <select
                value={aiRankLimit}
                onChange={(e) => setAiRankLimit(Number(e.target.value))}
                className="w-full border border-purple-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value={10}>10件</option>
                <option value={20}>20件</option>
                <option value={50}>50件</option>
                <option value={100}>100件</option>
              </select>
            </div>

            {/* AI判定ボタン */}
            <button
              onClick={handleAiRank}
              disabled={isAiRanking || !aiRankCompanyId}
              className={`w-full py-3 rounded-lg font-medium text-white ${
                isAiRanking || !aiRankCompanyId
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-purple-600 hover:bg-purple-700"
              }`}
            >
              {isAiRanking ? "AI判定中..." : "GPT-5.2でランク判定（テスト）"}
            </button>

            {/* AI判定結果表示 */}
            {aiRankResult && (
              <div className="space-y-4">
                {/* CSVエクスポートボタン */}
                <button
                  onClick={() => {
                    const csvHeader = "トピックID,タイトル,AIランク,スコア,判定理由\n";
                    const csvRows = aiRankResult.results.map(item =>
                      `"${item.topicId}","${(item.title || "").replace(/"/g, '""')}","${item.rank}","${item.score}","${(item.reasoning || "").replace(/"/g, '""')}"`
                    ).join("\n");
                    const csvContent = csvHeader + csvRows;
                    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `ai_ranking_${aiRankCompanyId}_${new Date().toISOString().slice(0,10)}.csv`;
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="w-full py-2 rounded-lg font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 border border-purple-300"
                >
                  📥 判定結果をCSVダウンロード
                </button>

                {/* サマリー */}
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h3 className="font-medium text-purple-800 mb-2">AI判定結果サマリー</h3>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-red-100 p-2 rounded">
                      <div className="text-2xl font-bold text-red-600">{aiRankResult.summary.S}</div>
                      <div className="text-xs text-red-600">Sランク</div>
                    </div>
                    <div className="bg-orange-100 p-2 rounded">
                      <div className="text-2xl font-bold text-orange-600">{aiRankResult.summary.A}</div>
                      <div className="text-xs text-orange-600">Aランク</div>
                    </div>
                    <div className="bg-yellow-100 p-2 rounded">
                      <div className="text-2xl font-bold text-yellow-600">{aiRankResult.summary.B}</div>
                      <div className="text-xs text-yellow-600">Bランク</div>
                    </div>
                    <div className="bg-gray-200 p-2 rounded">
                      <div className="text-2xl font-bold text-gray-600">{aiRankResult.summary.C}</div>
                      <div className="text-xs text-gray-600">Cランク</div>
                    </div>
                  </div>
                </div>

                {/* 詳細結果 */}
                <div className="p-4 bg-gray-50 rounded-lg max-h-96 overflow-y-auto">
                  <h3 className="font-medium text-gray-800 mb-2">判定詳細（AIの理由付き）</h3>
                  <div className="space-y-3">
                    {aiRankResult.results.map((item, index) => (
                      <div key={index} className="p-3 bg-white rounded border border-gray-200">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            item.rank === "S" ? "bg-red-100 text-red-700" :
                            item.rank === "A" ? "bg-orange-100 text-orange-700" :
                            item.rank === "B" ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-700"
                          }`}>
                            {item.rank}ランク（{item.score}点）
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 mb-1">{item.title}</p>
                        <p className="text-xs text-gray-600">{item.reasoning}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 説明 */}
          <div className="mt-6 p-4 bg-purple-50 rounded-lg">
            <h3 className="text-sm font-medium text-purple-800 mb-2">
              GPT-5.2判定の特徴
            </h3>
            <ul className="text-xs text-purple-700 space-y-1 list-disc list-inside">
              <li>文脈を理解した高精度な判定</li>
              <li>判定理由を自然言語で説明</li>
              <li>サービス情報と連携した判定</li>
              <li>テスト時はDB更新なし（確認後に適用可能）</li>
            </ul>
            <p className="text-xs text-purple-600 mt-2">
              ※ 推定コスト: 約$0.005/件（500件で約$2.50）
            </p>
          </div>
        </section>

        {/* AI要約生成セクション */}
        <section className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            AI要約生成（抽出テキスト分析）
          </h2>

          <div className="space-y-4">
            {/* 企業選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                企業を選択 *
              </label>
              <select
                value={summarizeCompanyId}
                onChange={(e) => setSummarizeCompanyId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- 企業を選択 --</option>
                {companies.map((company) => (
                  <option key={company.companyId} value={company.companyId}>
                    {company.companyId} - {company.companyName}
                  </option>
                ))}
              </select>
            </div>

            {/* AI要約生成ボタン */}
            <button
              onClick={handleSummarize}
              disabled={isSummarizing || !summarizeCompanyId}
              className={`w-full py-3 rounded-lg font-medium text-white ${
                isSummarizing || !summarizeCompanyId
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {isSummarizing ? "AI要約生成中..." : "AI要約を生成"}
            </button>

            {/* 結果表示 */}
            {summarizeResult && (
              <div className="p-4 bg-indigo-50 rounded-lg">
                <h3 className="font-medium text-indigo-800 mb-2">AI要約生成結果</h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2 rounded border border-indigo-200">
                    <div className="text-xl font-bold text-green-600">{summarizeResult.updated}</div>
                    <div className="text-xs text-green-600">生成成功</div>
                  </div>
                  <div className="bg-white p-2 rounded border border-indigo-200">
                    <div className="text-xl font-bold text-gray-600">{summarizeResult.skipped}</div>
                    <div className="text-xs text-gray-600">スキップ</div>
                  </div>
                  <div className="bg-white p-2 rounded border border-indigo-200">
                    <div className="text-xl font-bold text-red-600">{summarizeResult.failed}</div>
                    <div className="text-xs text-red-600">失敗</div>
                  </div>
                </div>
                <p className="text-xs text-indigo-700 mt-2 text-center">
                  {summarizeResult.processed}件のトピックを処理
                </p>
              </div>
            )}
          </div>

          {/* 説明 */}
          <div className="mt-6 p-4 bg-indigo-50 rounded-lg">
            <h3 className="text-sm font-medium text-indigo-800 mb-2">
              AI要約の内容
            </h3>
            <ul className="text-xs text-indigo-700 space-y-1 list-disc list-inside">
              <li><strong>質問要点:</strong> 質問者が何を問題視し、何を求めているか</li>
              <li><strong>回答要点:</strong> 行政側がどう回答したか、具体的な取り組み</li>
              <li><strong>キーワード:</strong> 予算、時期、システム、DXなどの重要語</li>
              <li><strong>営業ポイント:</strong> アポイントに活かせる課題認識・導入意欲</li>
            </ul>
            <p className="text-xs text-indigo-600 mt-2">
              ※ 抽出テキストがあり、AI要約がまだないトピックが対象
            </p>
          </div>
        </section>

        {/* SRT自動紐付けセクション（Google Drive） */}
        <section className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            SRT字幕 自動紐付け（Google Drive連携）
          </h2>

          <div className="space-y-4">
            {/* 企業選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                企業を選択 *
              </label>
              <select
                value={autoLinkCompanyId}
                onChange={(e) => setAutoLinkCompanyId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">-- 企業を選択 --</option>
                {companies.map((company) => (
                  <option key={company.companyId} value={company.companyId}>
                    {company.companyId} - {company.companyName}
                  </option>
                ))}
              </select>
            </div>

            {/* 自動紐付けボタン */}
            <button
              onClick={handleAutoLink}
              disabled={isAutoLinking || !autoLinkCompanyId}
              className={`w-full py-3 rounded-lg font-medium text-white ${
                isAutoLinking || !autoLinkCompanyId
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-purple-600 hover:bg-purple-700"
              }`}
            >
              {isAutoLinking ? "自動紐付け中..." : "Google DriveからSRTを自動取得・紐付け"}
            </button>

            {/* 結果表示 */}
            {autoLinkResult && (
              <div className="p-4 bg-purple-50 rounded-lg">
                <h3 className="font-medium text-purple-800 mb-2">自動紐付け結果</h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2 rounded border border-purple-200">
                    <div className="text-xl font-bold text-green-600">{autoLinkResult.updated}</div>
                    <div className="text-xs text-green-600">更新成功</div>
                  </div>
                  <div className="bg-white p-2 rounded border border-purple-200">
                    <div className="text-xl font-bold text-gray-600">{autoLinkResult.skipped}</div>
                    <div className="text-xs text-gray-600">スキップ</div>
                  </div>
                  <div className="bg-white p-2 rounded border border-purple-200">
                    <div className="text-xl font-bold text-red-600">{autoLinkResult.failed}</div>
                    <div className="text-xs text-red-600">失敗</div>
                  </div>
                </div>
                <p className="text-xs text-purple-700 mt-2 text-center">
                  {autoLinkResult.processed}件のトピックを処理
                </p>
              </div>
            )}
          </div>

          {/* 説明 */}
          <div className="mt-6 p-4 bg-purple-50 rounded-lg">
            <h3 className="text-sm font-medium text-purple-800 mb-2">
              自動紐付けの仕組み
            </h3>
            <ol className="text-xs text-purple-700 space-y-1 list-decimal list-inside">
              <li>選択した企業のトピック（抽出テキストが空のもの）を取得</li>
              <li>各トピックのグループID（YouTube動画ID）を確認</li>
              <li>Google Driveから該当するSRTファイルを自動取得</li>
              <li>開始秒数〜終了秒数の範囲の字幕を抽出して保存</li>
            </ol>
          </div>
        </section>

        {/* SRT手動紐付けセクション */}
        <section className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            SRT字幕 手動紐付け（ファイルアップロード）
          </h2>

          <div className="space-y-4">
            {/* グループID入力 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                グループID（YouTube動画ID）*
              </label>
              <input
                type="text"
                value={srtGroupId}
                onChange={(e) => setSrtGroupId(e.target.value)}
                placeholder="例: pdbwk0Yxe7g"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>

            {/* SRTファイル選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                SRTファイル *
              </label>
              <input
                id="srt-file"
                type="file"
                accept=".srt"
                onChange={handleSrtFileChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
              {srtFile && (
                <p className="text-sm text-gray-500 mt-1">
                  選択中: {srtFile.name} ({(srtFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            {/* 紐付けボタン */}
            <button
              onClick={handleLinkSrt}
              disabled={isParsingSrt || !srtFile || !srtGroupId}
              className={`w-full py-3 rounded-lg font-medium text-white ${
                isParsingSrt || !srtFile || !srtGroupId
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gray-600 hover:bg-gray-700"
              }`}
            >
              {isParsingSrt ? "紐付け中..." : "手動でSRTを紐付け"}
            </button>

            {/* 結果表示 */}
            {srtLinkResult && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-800 mb-2">紐付け結果</h3>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-white p-2 rounded border border-gray-200">
                    <div className="text-xl font-bold text-green-600">{srtLinkResult.updatedCount}</div>
                    <div className="text-xs text-green-600">更新成功</div>
                  </div>
                  <div className="bg-white p-2 rounded border border-gray-200">
                    <div className="text-xl font-bold text-gray-600">{srtLinkResult.skippedCount}</div>
                    <div className="text-xs text-gray-600">スキップ</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 機能一覧 */}
        <section className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            実装済み機能
          </h2>
          <ul className="space-y-2 text-gray-600">
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              トピックCSVアップロード
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              AI自動ランク付け（ゴールデンルール）
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              AI要約生成（抽出テキスト分析）
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              SRT読み込み・抽出機能（Google Drive連携）
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              CSVエクスポート（/api/v2/export?companyId=xxx）
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
