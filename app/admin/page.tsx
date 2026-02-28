"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Company {
  companyId: string;
  companyName: string;
  isHidden?: boolean;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // 基本state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // データ取込用（CSVアップロード）
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    totalFetched: number;
    zeroOrderPassed: number;
    importedCount: number;
    aiRankDistribution?: { A: number; B: number; C: number };
  } | null>(null);

  // ダッシュボード統計用
  const [stats, setStats] = useState<{
    totalTopics: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    recentImports: { today: number; thisWeek: number; thisMonth: number };
  } | null>(null);

  // 詳細設定の展開状態
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 詳細設定用state
  const [hiddenCompanies, setHiddenCompanies] = useState<Company[]>([]);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);

  // 除外/アプローチリスト
  const [exclusionFile, setExclusionFile] = useState<File | null>(null);
  const [inclusionFile, setInclusionFile] = useState<File | null>(null);
  const [isUploadingList, setIsUploadingList] = useState(false);

  // AI再判定用
  const [isReranking, setIsReranking] = useState(false);
  const [rerankPreview, setRerankPreview] = useState<{
    eligibleCount: number;
    rankedCount: number;
    totalCount: number;
  } | null>(null);
  const [rerankResult, setRerankResult] = useState<{
    summary: { A: number; B: number; C: number };
    processed: number;
  } | null>(null);
  const [showRerankConfirm, setShowRerankConfirm] = useState(false);

  // 認証チェック
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // 企業一覧を取得
  const fetchAllCompanies = async () => {
    try {
      const response = await fetch("/api/companies");
      const result = await response.json();
      if (result.success) {
        setCompanies(result.data || []);
        // 最初の企業を自動選択
        if (result.data?.length > 0 && !selectedCompanyId) {
          setSelectedCompanyId(result.data[0].companyId);
        }
      }

      // 非表示企業も取得
      const hiddenResponse = await fetch("/api/v2/companies?includeHidden=true");
      const hiddenResult = await hiddenResponse.json();
      if (hiddenResult.success) {
        const allCompanies = hiddenResult.data || [];
        const hidden = allCompanies
          .filter((c: { is_hidden: boolean }) => c.is_hidden)
          .map((c: { company_id: string; company_name: string }) => ({
            companyId: c.company_id,
            companyName: c.company_name,
            isHidden: true,
          }));
        setHiddenCompanies(hidden);
      }
    } catch (error) {
      console.error("Failed to fetch companies:", error);
    }
  };

  // ダッシュボード統計を取得
  const fetchStats = async () => {
    try {
      const response = await fetch("/api/v2/stats");
      const result = await response.json();
      if (result.success) {
        setStats(result.stats);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  // AI再判定の対象件数を取得
  const fetchRerankPreview = async (companyId: string) => {
    try {
      const response = await fetch(`/api/v2/topics/rerank?companyId=${companyId}`);
      const result = await response.json();
      if (result.success) {
        setRerankPreview({
          eligibleCount: result.eligibleCount,
          rankedCount: result.rankedCount,
          totalCount: result.totalCount,
        });
      }
    } catch (error) {
      console.error("Failed to fetch rerank preview:", error);
      setRerankPreview(null);
    }
  };

  useEffect(() => {
    fetchAllCompanies();
    fetchStats();
  }, []);

  // 企業選択時に再判定プレビューを取得
  useEffect(() => {
    if (selectedCompanyId) {
      fetchRerankPreview(selectedCompanyId);
      setShowRerankConfirm(false);
      setRerankResult(null);
    } else {
      setRerankPreview(null);
    }
  }, [selectedCompanyId]);

  // メイン機能: CSVアップロードでデータ取込
  const handleImport = async () => {
    if (!selectedCompanyId) {
      setMessage({ type: "error", text: "企業を選択してください" });
      return;
    }

    if (!csvFile) {
      setMessage({ type: "error", text: "CSVファイルを選択してください" });
      return;
    }

    setIsImporting(true);
    setImportResult(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      formData.append("companyId", selectedCompanyId);
      formData.append("dryRun", "false");

      const response = await fetch("/api/v2/connector/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setImportResult({
          totalFetched: result.totalFetched,
          zeroOrderPassed: result.zeroOrderPassed,
          importedCount: result.importedCount,
          aiRankDistribution: result.aiRankDistribution,
        });
        setMessage({
          type: "success",
          text: `${result.importedCount}件を取り込みました`,
        });
        setCsvFile(null);
        // 統計を更新
        await fetchStats();
      } else {
        setMessage({ type: "error", text: result.error || "データ取込に失敗しました" });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "データ取込に失敗しました",
      });
    } finally {
      setIsImporting(false);
    }
  };

  // AI再判定
  const handleRerank = async () => {
    if (!selectedCompanyId) {
      setMessage({ type: "error", text: "企業を選択してください" });
      return;
    }

    setIsReranking(true);
    setRerankResult(null);

    try {
      const response = await fetch("/api/v2/topics/rerank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          limit: 100,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setRerankResult({
          summary: result.summary,
          processed: result.processed,
        });
        setMessage({ type: "success", text: result.message });
        setShowRerankConfirm(false);
        // プレビューを更新
        await fetchRerankPreview(selectedCompanyId);
        await fetchStats();
      } else {
        setMessage({ type: "error", text: result.error || "AI再判定に失敗しました" });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "AI再判定に失敗しました",
      });
    } finally {
      setIsReranking(false);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: newCompanyName }),
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: "success", text: `企業「${newCompanyName}」を登録しました` });
        setNewCompanyName("");
        await fetchAllCompanies();
      } else {
        setMessage({ type: "error", text: result.error || "企業登録に失敗しました" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "企業登録に失敗しました" });
    } finally {
      setIsCreatingCompany(false);
    }
  };

  // 企業の表示/非表示切り替え
  const toggleCompanyVisibility = async (companyId: string, hide: boolean) => {
    try {
      const response = await fetch("/api/v2/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, is_hidden: hide }),
      });
      const result = await response.json();
      if (result.success) {
        setMessage({ type: "success", text: result.message });
        await fetchAllCompanies();
      } else {
        setMessage({ type: "error", text: result.error || "操作に失敗しました" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "操作に失敗しました" });
    }
  };

  // 除外リストアップロード
  const handleExclusionUpload = async () => {
    if (!exclusionFile || !selectedCompanyId) {
      setMessage({ type: "error", text: "企業とファイルを選択してください" });
      return;
    }

    setIsUploadingList(true);

    try {
      const formData = new FormData();
      formData.append("file", exclusionFile);
      formData.append("companyId", selectedCompanyId);
      formData.append("clearExisting", "false");

      const response = await fetch("/api/v2/exclusions", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: "success", text: result.message });
        setExclusionFile(null);
      } else {
        setMessage({ type: "error", text: result.error || "アップロードに失敗しました" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "アップロードに失敗しました" });
    } finally {
      setIsUploadingList(false);
    }
  };

  // アプローチ先リストアップロード
  const handleInclusionUpload = async () => {
    if (!inclusionFile || !selectedCompanyId) {
      setMessage({ type: "error", text: "企業とファイルを選択してください" });
      return;
    }

    setIsUploadingList(true);

    try {
      const formData = new FormData();
      formData.append("file", inclusionFile);
      formData.append("companyId", selectedCompanyId);
      formData.append("clearExisting", "false");

      const response = await fetch("/api/v2/inclusions", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: "success", text: result.message });
        setInclusionFile(null);
      } else {
        setMessage({ type: "error", text: result.error || "アップロードに失敗しました" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "アップロードに失敗しました" });
    } finally {
      setIsUploadingList(false);
    }
  };

  // ローディング中
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">管理画面</h1>
            <div className="flex items-center gap-4">
              <a href="/services" className="text-purple-600 hover:text-purple-800 text-sm">
                サービス管理
              </a>
              <a href="/" className="text-blue-600 hover:text-blue-800 text-sm">
                ← メイン画面
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* メッセージ */}
        {message && (
          <div
            className={`p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-100 text-green-800 border border-green-300"
                : "bg-red-100 text-red-800 border border-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* ダッシュボード */}
        {stats && (
          <section className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-lg p-6 text-white">
            <h2 className="text-lg font-bold mb-4">ダッシュボード</h2>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="bg-white/10 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{stats.totalTopics}</div>
                <div className="text-xs opacity-80">総トピック</div>
              </div>
              <div className="bg-white/10 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{stats.byStatus["未着手"] || 0}</div>
                <div className="text-xs opacity-80">未着手</div>
              </div>
              <div className="bg-white/10 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{stats.byStatus["対応中"] || 0}</div>
                <div className="text-xs opacity-80">対応中</div>
              </div>
              <div className="bg-white/10 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{stats.byStatus["完了"] || 0}</div>
                <div className="text-xs opacity-80">完了</div>
              </div>
            </div>
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400"></span>
                A: {stats.byPriority["A"] || 0}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                B: {stats.byPriority["B"] || 0}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                C: {stats.byPriority["C"] || 0}
              </span>
            </div>
          </section>
        )}

        {/* メイン操作パネル */}
        <section className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">データ取込</h2>

          {/* Step 1: 企業選択 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              1. 企業を選択
            </label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- 企業を選択 --</option>
              {companies.map((company) => (
                <option key={company.companyId} value={company.companyId}>
                  {company.companyId} - {company.companyName}
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: CSVファイル選択 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              2. JS-NEXTからダウンロードしたCSVを選択
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="hidden"
                id="csv-upload"
              />
              <label
                htmlFor="csv-upload"
                className="cursor-pointer block"
              >
                {csvFile ? (
                  <div className="text-blue-600">
                    <span className="font-medium">{csvFile.name}</span>
                    <span className="text-gray-500 text-sm ml-2">
                      ({(csvFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                ) : (
                  <div className="text-gray-500">
                    <span className="text-2xl">+</span>
                    <p className="text-sm mt-1">クリックしてCSVを選択</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Step 3: 実行ボタン */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              3. データを取り込む
            </label>
            <button
              onClick={handleImport}
              disabled={isImporting || !selectedCompanyId || !csvFile}
              className={`w-full py-4 rounded-lg font-bold text-lg text-white transition ${
                isImporting || !selectedCompanyId || !csvFile
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isImporting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                  取込中...（AI判定含む）
                </span>
              ) : (
                "CSVを取り込む"
              )}
            </button>
            <p className="text-xs text-gray-500 mt-2">
              処理: 0次フィルタ（AI） → 1次判定（SRT） → AI優先度判定 → DB保存
            </p>
          </div>

          {/* 取込結果 */}
          {importResult && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-medium text-blue-800 mb-2">取込結果</h3>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">取得: </span>
                  <span className="font-medium">{importResult.totalFetched}件</span>
                </div>
                <div>
                  <span className="text-gray-600">通過: </span>
                  <span className="font-medium">{importResult.zeroOrderPassed}件</span>
                </div>
                <div>
                  <span className="text-gray-600">保存: </span>
                  <span className="font-medium text-blue-600">{importResult.importedCount}件</span>
                </div>
              </div>
              {importResult.aiRankDistribution && (
                <div className="mt-2 flex gap-3 text-sm">
                  <span className="text-red-600">A: {importResult.aiRankDistribution.A}</span>
                  <span className="text-yellow-600">B: {importResult.aiRankDistribution.B}</span>
                  <span className="text-gray-600">C: {importResult.aiRankDistribution.C}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* AI再判定（未判定分） */}
        <section className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-medium text-gray-800">AI再判定</h3>
              <p className="text-xs text-gray-500">未判定のトピックをAI判定する</p>
            </div>
          </div>

          {/* プレビュー表示 */}
          {rerankPreview && selectedCompanyId && (
            <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                <div className="text-center">
                  <div className="text-lg font-bold text-purple-600">{rerankPreview.eligibleCount}</div>
                  <div className="text-xs text-gray-500">対象</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{rerankPreview.rankedCount}</div>
                  <div className="text-xs text-gray-500">判定済</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-600">{rerankPreview.totalCount}</div>
                  <div className="text-xs text-gray-500">全件</div>
                </div>
              </div>
              <div className="text-xs text-gray-500 border-t border-gray-200 pt-2 mt-2">
                <p className="font-medium mb-1">対象条件:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>ai_ranked_at が NULL（AI未判定）</li>
                  <li>is_archived = false（アーカイブなし）</li>
                  <li>status ≠ 完了（未完了のみ）</li>
                </ul>
              </div>
            </div>
          )}

          {/* アクションボタン */}
          {rerankPreview && rerankPreview.eligibleCount > 0 ? (
            !showRerankConfirm ? (
              <button
                onClick={() => setShowRerankConfirm(true)}
                disabled={!selectedCompanyId}
                className="w-full py-2 rounded-lg text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400"
              >
                {rerankPreview.eligibleCount}件を再判定する
              </button>
            ) : (
              <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                <p className="text-sm text-yellow-800 mb-2">
                  <strong>{rerankPreview.eligibleCount}件</strong>のトピックをAI再判定します。よろしいですか？
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleRerank}
                    disabled={isReranking}
                    className={`flex-1 py-2 rounded text-sm font-medium text-white ${
                      isReranking ? "bg-gray-400" : "bg-red-600 hover:bg-red-700"
                    }`}
                  >
                    {isReranking ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                        判定中...
                      </span>
                    ) : (
                      "実行する"
                    )}
                  </button>
                  <button
                    onClick={() => setShowRerankConfirm(false)}
                    disabled={isReranking}
                    className="flex-1 py-2 rounded text-sm font-medium bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )
          ) : rerankPreview ? (
            <div className="text-center text-sm text-gray-500 py-2">
              対象トピックがありません（全て判定済み）
            </div>
          ) : selectedCompanyId ? (
            <div className="text-center text-sm text-gray-400 py-2">
              読み込み中...
            </div>
          ) : (
            <div className="text-center text-sm text-gray-400 py-2">
              企業を選択してください
            </div>
          )}

          {/* 結果表示 */}
          {rerankResult && (
            <div className="mt-3 p-3 bg-purple-50 rounded text-sm border border-purple-200">
              <span className="text-purple-800">
                {rerankResult.processed}件判定完了:
                A {rerankResult.summary.A} / B {rerankResult.summary.B} / C {rerankResult.summary.C}
              </span>
            </div>
          )}
        </section>

        {/* 詳細設定（折りたたみ） */}
        <section className="bg-white rounded-lg shadow">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-6 py-4 flex items-center justify-between text-left"
          >
            <span className="font-medium text-gray-700">詳細設定</span>
            <span className="text-gray-400">{showAdvanced ? "▲" : "▼"}</span>
          </button>

          {showAdvanced && (
            <div className="px-6 pb-6 space-y-6 border-t border-gray-100">
              {/* 企業管理 */}
              <div className="pt-4">
                <h3 className="font-medium text-gray-800 mb-3">企業管理</h3>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="新規企業名"
                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleCreateCompany}
                    disabled={isCreatingCompany || !newCompanyName}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    登録
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {companies.map((company) => (
                    <span
                      key={company.companyId}
                      className="inline-flex items-center gap-1 bg-gray-100 rounded px-2 py-1 text-xs"
                    >
                      {company.companyId}: {company.companyName}
                      <button
                        onClick={() => toggleCompanyVisibility(company.companyId, true)}
                        className="ml-1 text-gray-400 hover:text-red-500"
                        title="非表示"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                {hiddenCompanies.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    非表示: {hiddenCompanies.map(c => c.companyName).join(", ")}
                    <button
                      onClick={() => hiddenCompanies.forEach(c => toggleCompanyVisibility(c.companyId, false))}
                      className="ml-2 text-blue-500 hover:underline"
                    >
                      全て復元
                    </button>
                  </div>
                )}
              </div>

              {/* 除外リスト */}
              <div className="pt-4 border-t border-gray-100">
                <h3 className="font-medium text-gray-800 mb-3">除外リスト（契約済み・NG自治体）</h3>
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setExclusionFile(e.target.files?.[0] || null)}
                    className="flex-1 text-sm"
                  />
                  <button
                    onClick={handleExclusionUpload}
                    disabled={isUploadingList || !exclusionFile || !selectedCompanyId}
                    className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:bg-gray-400"
                  >
                    登録
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">CSV形式: 都道府県, 市町村, 理由</p>
              </div>

              {/* アプローチ先リスト */}
              <div className="pt-4 border-t border-gray-100">
                <h3 className="font-medium text-gray-800 mb-3">アプローチ先リスト</h3>
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setInclusionFile(e.target.files?.[0] || null)}
                    className="flex-1 text-sm"
                  />
                  <button
                    onClick={handleInclusionUpload}
                    disabled={isUploadingList || !inclusionFile || !selectedCompanyId}
                    className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:bg-gray-400"
                  >
                    登録
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">CSV形式: 都道府県, 市町村, メモ</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
