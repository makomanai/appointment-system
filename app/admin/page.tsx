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

  // AIランク付け用
  const [rankCompanyId, setRankCompanyId] = useState("");
  const [isRanking, setIsRanking] = useState(false);
  const [rankResult, setRankResult] = useState<{ S: number; A: number; B: number; C: number } | null>(null);

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

  // ファイル選択
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setMessage(null);
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
            <a href="/" className="text-blue-600 hover:text-blue-800 text-sm">
              ← メイン画面に戻る
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
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

        {/* 今後の機能 */}
        <section className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            今後の機能
          </h2>
          <ul className="space-y-2 text-gray-600">
            <li className="flex items-center gap-2">
              <span className="text-yellow-500">⏳</span>
              SRT読み込み・抽出機能
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              AI自動ランク付け（ゴールデンルール）
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
