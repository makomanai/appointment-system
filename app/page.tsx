"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import LeftPanel from "./components/LeftPanel";
import CenterPanel from "./components/CenterPanel";
import RightPanel from "./components/RightPanel";
import CompanySelector from "./components/CompanySelector";
import CaseSidebar from "./components/CaseSidebar";
import { CallViewData, CallResultForm, SelectedCompany } from "./types";

// LocalStorageのキー
const SELECTED_COMPANY_KEY = "selectedCompany";

export default function Home() {
  // セッション情報
  const { data: session } = useSession();

  // 選択中の企業
  const [selectedCompany, setSelectedCompany] =
    useState<SelectedCompany | null>(null);
  // 企業選択状態の初期化フラグ
  const [isInitialized, setIsInitialized] = useState(false);
  // データ再取得用のキー
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  // 現在のインデックス
  const [currentIndex, setCurrentIndex] = useState(0);
  // データリスト（モックデータを使用）
  const [dataList, setDataList] = useState<CallViewData[]>([]);
  // データ読み込み中フラグ
  const [isLoadingData, setIsLoadingData] = useState(false);
  // 保存中フラグ
  const [isSaving, setIsSaving] = useState(false);
  // AI生成中フラグ
  const [isGenerating, setIsGenerating] = useState(false);
  // モバイルサイドバー開閉
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 初回読み込み時にLocalStorageから企業情報を復元
  useEffect(() => {
    const savedCompany = localStorage.getItem(SELECTED_COMPANY_KEY);
    if (savedCompany) {
      try {
        const company = JSON.parse(savedCompany) as SelectedCompany;
        setSelectedCompany(company);
      } catch (e) {
        console.error("Failed to parse saved company:", e);
        localStorage.removeItem(SELECTED_COMPANY_KEY);
      }
    }
    setIsInitialized(true);
  }, []);

  // 企業が選択されたらデータを取得
  useEffect(() => {
    if (!selectedCompany) {
      console.log("[page.tsx] 企業が選択されていません");
      setDataList([]);
      return;
    }

    // クロージャで最新の値をキャプチャ
    const companyToFetch = { ...selectedCompany };

    const fetchData = async () => {
      console.log("=== [page.tsx] データ取得開始 ===");
      console.log("企業ID:", companyToFetch.companyId);
      console.log("企業名:", companyToFetch.companyName);
      console.log("companyFileId:", companyToFetch.companyFileId);
      console.log("dataRefreshKey:", dataRefreshKey);

      setIsLoadingData(true);
      try {
        // タイムスタンプを追加してキャッシュを完全に回避
        const timestamp = Date.now();
        const apiUrl = `/api/call-view?companyFileId=${encodeURIComponent(companyToFetch.companyFileId)}&_t=${timestamp}`;
        console.log("APIリクエスト:", apiUrl);

        const response = await fetch(apiUrl, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        });
        const result = await response.json();

        console.log("APIレスポンス:", {
          success: result.success,
          dataLength: result.data?.length,
          error: result.error,
        });

        if (!result.success) {
          throw new Error(result.error || "データの取得に失敗しました");
        }

        // APIレスポンスをCallViewData形式にマッピング
        // eslint-disable-next-line
        const mappedData: CallViewData[] = (result.data || []).map((item: any) => ({
          councilDate: item.council || "",
          agendaTitle: item.title || "",
          agendaSummary: item.summary || "",
          speakers: item.qa || "",
          sourceUrl1: item.url || "",
          sourceUrl2: "",
          excerptRange: item.excerptRange || "",
          excerptText: item.excerptText || "",
          aiSummary: item.summary || "",
          aiScript: "",
          confirmedRelation: "",
          scriptDraft: "",
          status: item.status || "未着手",
          priority: item.priority || "C",
          callResult: item.callResult || "",
          nextAction: item.nextAction || "",
          nextDate: item.nextDate || "",
          memo: item.memo || "",
          companyRowKey: item.companyRowKey || "",
        }));

        // 優先度Aのみをフィルタリング
        const filteredData = mappedData.filter(
          (item) => item.priority === "A"
        );
        console.log("マッピング後のデータ:", mappedData.length, "件");
        console.log("優先度Aのデータ:", filteredData.length, "件");
        console.log("最初のデータ:", filteredData[0]?.agendaTitle || "なし");

        setDataList(filteredData);
        setCurrentIndex(0);
      } catch (error) {
        console.error("[page.tsx] データ取得エラー:", error);
        setDataList([]);
      } finally {
        setIsLoadingData(false);
        console.log("=== [page.tsx] データ取得完了 ===");
      }
    };

    fetchData();
  }, [selectedCompany, dataRefreshKey]);

  // 現在のデータ
  const currentData = dataList[currentIndex] || null;

  // キーワードハイライト用（商材関連キーワード）
  const keywords = ["防災", "DX", "AI", "アプリ", "デジタル", "子育て", "支援"];

  // 企業選択
  const handleCompanySelect = useCallback((company: SelectedCompany) => {
    console.log("=== [page.tsx] 企業選択 ===");
    console.log("選択された企業:", company);
    setSelectedCompany(company);
    setDataRefreshKey((prev) => prev + 1); // データ再取得をトリガー
    localStorage.setItem(SELECTED_COMPANY_KEY, JSON.stringify(company));
  }, []);

  // 企業切り替え（選択画面に戻る）
  const handleChangeCompany = useCallback(() => {
    console.log("=== [page.tsx] 企業変更（選択画面へ戻る） ===");
    setSelectedCompany(null);
    setDataList([]); // データリストをクリア
    setCurrentIndex(0);
    localStorage.removeItem(SELECTED_COMPANY_KEY);
  }, []);

  // 保存処理
  const handleSave = useCallback(
    async (formData: CallResultForm) => {
      setIsSaving(true);
      try {
        // TODO: 実際のAPI呼び出しに置き換える
        console.log("保存データ:", {
          companyId: selectedCompany?.companyId,
          companyFileId: selectedCompany?.companyFileId,
          companyRowKey: currentData?.companyRowKey,
          ...formData,
        });

        // データを更新
        setDataList((prev) =>
          prev.map((item, index) =>
            index === currentIndex
              ? {
                  ...item,
                  status: formData.status,
                  priority: formData.priority,
                  callResult: formData.callResult,
                  nextAction: formData.nextAction,
                  nextDate: formData.nextDate,
                  memo: formData.memo,
                }
              : item
          )
        );

        // 成功メッセージ（後でトースト通知に置き換え）
        console.log("保存完了");
      } catch (error) {
        console.error("保存エラー:", error);
      } finally {
        setIsSaving(false);
      }
    },
    [currentIndex, currentData, selectedCompany]
  );

  // 保存して次へ
  const handleSaveAndNext = useCallback(
    async (formData: CallResultForm) => {
      await handleSave(formData);

      // 次のデータへ移動
      if (currentIndex < dataList.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        // 最後のデータの場合
        console.log("全ての案件を処理しました");
      }
    },
    [handleSave, currentIndex, dataList.length]
  );

  // AI生成処理
  const handleGenerateScript = useCallback(async () => {
    if (!currentData) {
      console.log("[handleGenerateScript] currentDataがありません");
      return;
    }

    console.log("=== [page.tsx] AIスクリプト生成開始 ===");
    console.log("対象:", currentData.agendaTitle);

    setIsGenerating(true);
    try {
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          councilDate: currentData.councilDate,
          agendaTitle: currentData.agendaTitle,
          agendaSummary: currentData.agendaSummary,
          speakers: currentData.speakers,
          excerptText: currentData.excerptText,
          companyName: selectedCompany?.companyName,
        }),
      });

      const result = await response.json();

      console.log("APIレスポンス:", {
        success: result.success,
        hasScript: !!result.script,
        error: result.error,
      });

      if (!result.success) {
        throw new Error(result.error || "スクリプト生成に失敗しました");
      }

      // 現在のデータを更新（生成されたスクリプトを設定）
      setDataList((prev) =>
        prev.map((item, index) =>
          index === currentIndex
            ? {
                ...item,
                scriptDraft: result.script,
                aiScript: result.script,
              }
            : item
        )
      );

      console.log("AIスクリプト生成完了");
    } catch (error) {
      console.error("AI生成エラー:", error);
      alert(error instanceof Error ? error.message : "スクリプト生成に失敗しました");
    } finally {
      setIsGenerating(false);
    }
  }, [currentData, currentIndex, selectedCompany?.companyName]);

  // 前へ
  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  // 次へ
  const handleNext = () => {
    if (currentIndex < dataList.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  // 案件選択
  const handleSelectCase = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsSidebarOpen(false); // モバイルでは選択後にサイドバーを閉じる
  }, []);

  // 自治体名を抽出（モバイル表示用）
  const extractMunicipality = (councilDate: string): string => {
    const match = councilDate.match(/^(.+?)(議会|市議会|町議会|村議会)/);
    if (match) {
      return match[1];
    }
    const slashIndex = councilDate.indexOf("/");
    if (slashIndex > 0) {
      return councilDate.substring(0, slashIndex).trim();
    }
    return councilDate;
  };

  // 初期化中は何も表示しない（ちらつき防止）
  if (!isInitialized) {
    return null;
  }

  // 企業が選択されていない場合は企業選択画面を表示
  if (!selectedCompany) {
    return <CompanySelector onSelect={handleCompanySelect} />;
  }

  // データ読み込み中
  if (isLoadingData) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {selectedCompany.companyName}の案件を読み込み中...
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-full mx-auto px-3 md:px-4 py-2 md:py-3">
          <div className="flex items-center justify-between gap-2">
            {/* 左側：メニューボタン（モバイル）+ タイトル + 企業名 */}
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              {/* ハンバーガーメニュー（モバイルのみ） */}
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-800"
                aria-label="メニュー"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>

              {/* タイトル（PCのみ） */}
              <h1 className="hidden md:block text-xl font-bold text-gray-800">
                Company Pack Web
              </h1>

              {/* 企業名表示 */}
              <div className="flex items-center gap-1 md:gap-2 bg-blue-50 px-2 md:px-3 py-1 md:py-1.5 rounded-lg min-w-0">
                <span className="hidden sm:inline text-xs md:text-sm text-blue-600 font-medium">
                  {selectedCompany.companyId}
                </span>
                <span className="hidden sm:inline text-blue-300">|</span>
                <span className="text-xs md:text-sm text-blue-800 font-semibold truncate">
                  {selectedCompany.companyName}
                </span>
                <button
                  onClick={handleChangeCompany}
                  className="hidden sm:inline ml-1 md:ml-2 text-xs text-blue-500 hover:text-blue-700 underline flex-shrink-0"
                >
                  変更
                </button>
              </div>
            </div>

            {/* 右側：ナビゲーション */}
            <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
              {/* ナビゲーション */}
              <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                <button
                  onClick={handlePrevious}
                  disabled={currentIndex === 0}
                  className={`px-2 md:px-3 py-1 rounded ${
                    currentIndex === 0
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  }`}
                >
                  <span className="hidden sm:inline">← </span>前
                </button>
                <span className="text-gray-600 text-xs md:text-sm">
                  {dataList.length > 0
                    ? `${currentIndex + 1}/${dataList.length}`
                    : "0/0"}
                </span>
                <button
                  onClick={handleNext}
                  disabled={
                    currentIndex === dataList.length - 1 || dataList.length === 0
                  }
                  className={`px-2 md:px-3 py-1 rounded ${
                    currentIndex === dataList.length - 1 || dataList.length === 0
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  }`}
                >
                  次<span className="hidden sm:inline"> →</span>
                </button>
              </div>

              {/* ステータスバッジ（PCのみ） */}
              {currentData && (
                <span
                  className={`hidden md:inline px-2 py-1 text-xs rounded-full ${
                    currentData.status === "未着手"
                      ? "bg-gray-100 text-gray-600"
                      : currentData.status === "対応中"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {currentData.status}
                </span>
              )}

              {/* ユーザー情報・ログアウト */}
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
                <span className="hidden md:inline text-xs text-gray-500">
                  {session?.user?.name || session?.user?.email}
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="text-xs text-gray-500 hover:text-red-600 transition-colors"
                >
                  ログアウト
                </button>
              </div>
            </div>
          </div>

          {/* モバイル用：現在の案件名表示 */}
          {currentData && (
            <div className="lg:hidden mt-2 pt-2 border-t border-gray-100">
              <p className="text-sm text-gray-700 font-medium truncate">
                {extractMunicipality(currentData.councilDate)}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {currentData.agendaTitle}
              </p>
            </div>
          )}
        </div>
      </header>

      {/* モバイルサイドバー（ドロワー） */}
      {isSidebarOpen && (
        <>
          {/* オーバーレイ */}
          <div
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setIsSidebarOpen(false)}
          />
          {/* ドロワー */}
          <div className="lg:hidden fixed inset-y-0 left-0 w-72 bg-white shadow-xl z-50 overflow-hidden flex flex-col">
            {/* ドロワーヘッダー */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="font-bold text-gray-800">案件一覧</h2>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 text-gray-500 hover:text-gray-700"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            {/* 企業変更ボタン */}
            <div className="px-4 py-2 border-b border-gray-100">
              <button
                onClick={handleChangeCompany}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                企業を変更
              </button>
            </div>
            {/* 案件リスト */}
            <div className="flex-1 overflow-y-auto">
              <CaseSidebar
                cases={dataList}
                currentIndex={currentIndex}
                onSelectCase={handleSelectCase}
              />
            </div>
          </div>
        </>
      )}

      {/* メインコンテンツ */}
      <div className="max-w-full mx-auto p-2 md:p-4 h-[calc(100vh-72px)] md:h-[calc(100vh-72px)]">
        {dataList.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600 mb-4">
              この企業には優先度Aの案件がありません
            </p>
            <button
              onClick={handleChangeCompany}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              別の企業を選択
            </button>
          </div>
        ) : (
          <div className="flex gap-4 h-full">
            {/* 案件一覧サイドバー（PCのみ） */}
            <div className="hidden lg:block w-64 flex-shrink-0 h-full">
              <CaseSidebar
                cases={dataList}
                currentIndex={currentIndex}
                onSelectCase={handleSelectCase}
              />
            </div>

            {/* 3カラムレイアウト */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-2 md:gap-4 min-w-0 overflow-y-auto lg:overflow-visible">
              {/* 左パネル: 根拠・リサーチ */}
              <div className="lg:col-span-1 min-h-[300px] lg:h-full overflow-hidden">
                <LeftPanel data={currentData} keywords={keywords} />
              </div>

              {/* 中央パネル: AIスクリプト */}
              <div className="lg:col-span-1 min-h-[450px] lg:h-full overflow-hidden">
                <CenterPanel
                  data={currentData}
                  onGenerateScript={handleGenerateScript}
                  isGenerating={isGenerating}
                />
              </div>

              {/* 右パネル: 結果入力 */}
              <div className="lg:col-span-1 min-h-[400px] lg:h-full overflow-hidden">
                <RightPanel
                  key={currentData?.companyRowKey}
                  initialData={
                    currentData
                      ? {
                          status: currentData.status,
                          priority: currentData.priority,
                          callResult: currentData.callResult,
                          nextAction:
                            currentData.nextAction as CallResultForm["nextAction"],
                          nextDate: currentData.nextDate,
                          memo: currentData.memo,
                        }
                      : undefined
                  }
                  onSave={handleSave}
                  onSaveAndNext={handleSaveAndNext}
                  isSaving={isSaving}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
