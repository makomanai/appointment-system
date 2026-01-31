"use client";

import { CallViewData } from "@/app/types";

interface LeftPanelProps {
  data: CallViewData | null;
  keywords?: string[];
}

// 自治体名を抽出する関数
function extractMunicipalityName(councilDate: string): string {
  // "北海道苫小牧市議会 / 2025/12/09" → "北海道苫小牧市"
  const match = councilDate.match(/^(.+?)(議会|市議会|区議会|町議会|村議会)/);
  if (match) {
    return match[1];
  }
  // フォールバック: スラッシュの前を取得
  return councilDate.split(" / ")[0].replace(/議会$/, "");
}

// 議会日付を抽出する関数
function extractCouncilDate(councilDate: string): string {
  // "北海道苫小牧市議会 / 2025/12/09" → "2025/12/09"
  const parts = councilDate.split(" / ");
  if (parts.length >= 2) {
    return parts[1];
  }
  return "";
}

// キーワードハイライト関数
function highlightKeywords(text: string, keywords: string[]): React.ReactNode {
  if (!keywords || keywords.length === 0) return text;

  const regex = new RegExp(`(${keywords.join("|")})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (keywords.some((kw) => kw.toLowerCase() === part.toLowerCase())) {
      return (
        <mark key={index} className="bg-yellow-200 px-0.5 rounded">
          {part}
        </mark>
      );
    }
    return part;
  });
}

export default function LeftPanel({ data, keywords = [] }: LeftPanelProps) {
  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow p-4 h-full">
        <h2 className="text-lg font-semibold mb-4 text-gray-700">
          根拠・リサーチ
        </h2>
        <p className="text-gray-400 text-sm">データを読み込み中...</p>
      </div>
    );
  }

  const municipalityName = extractMunicipalityName(data.councilDate);
  const councilDate = extractCouncilDate(data.councilDate);

  // Google検索を開く
  const openGoogleSearch = (query: string) => {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 h-full overflow-y-auto">
      {/* 自治体名 - 大きく目立つように表示 */}
      <div className="mb-4 pb-3 border-b-2 border-blue-500">
        <div className="bg-blue-600 text-white px-4 py-3 rounded-lg mb-2">
          <h2 className="text-2xl font-bold tracking-wide">{municipalityName}</h2>
        </div>
        {councilDate && (
          <p className="text-sm text-gray-600 mt-2">
            議会日: <span className="font-medium text-gray-800">{councilDate}</span>
          </p>
        )}
      </div>

      {/* 議題タイトル */}
      <div className="mb-3">
        <h3 className="text-sm font-medium text-gray-500 mb-1">議題タイトル</h3>
        <p className="text-base font-semibold text-gray-800">
          {data.agendaTitle}
        </p>
      </div>

      {/* 議題概要 */}
      <div className="mb-3">
        <h3 className="text-sm font-medium text-gray-500 mb-1">議題概要</h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          {highlightKeywords(data.agendaSummary, keywords)}
        </p>
      </div>

      {/* 質問者/回答者 */}
      <div className="mb-3">
        <h3 className="text-sm font-medium text-gray-500 mb-1">質問者/回答者</h3>
        <p className="text-sm text-gray-700">{data.speakers}</p>
      </div>

      {/* ソースURL */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-500 mb-1">ソース</h3>
        <div className="flex flex-col gap-1">
          {data.sourceUrl1 && (
            <a
              href={data.sourceUrl1}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline truncate"
            >
              動画/議事録 1
            </a>
          )}
          {data.sourceUrl2 && (
            <a
              href={data.sourceUrl2}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline truncate"
            >
              動画/議事録 2
            </a>
          )}
        </div>
      </div>

      {/* 検索ボタン */}
      <div className="mb-4 flex flex-col gap-2">
        <button
          onClick={() =>
            openGoogleSearch(`${municipalityName} 担当課 電話番号 一覧`)
          }
          className="w-full px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors text-left"
        >
          🔍 担当課 電話番号を検索
        </button>
        <button
          onClick={() =>
            openGoogleSearch(`${municipalityName} 事務分掌 業務内容`)
          }
          className="w-full px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors text-left"
        >
          🔍 事務分掌・業務内容を検索
        </button>
      </div>

      {/* 抜粋テキスト - メイン表示 */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-500">
            抜粋テキスト (B9)
          </h3>
          {data.excerptRange && (
            <span className="text-xs text-gray-400">{data.excerptRange}</span>
          )}
        </div>
        <div className="bg-gray-50 p-3 rounded-md border border-gray-200 max-h-64 overflow-y-auto">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
            {highlightKeywords(data.excerptText, keywords)}
          </pre>
        </div>
      </div>

      {/* AI要約 */}
      {data.aiSummary && (
        <div className="mb-3">
          <h3 className="text-sm font-medium text-gray-500 mb-1">
            AI要約 (B10)
          </h3>
          <p className="text-sm text-gray-600 bg-blue-50 p-2 rounded-md">
            {data.aiSummary}
          </p>
        </div>
      )}
    </div>
  );
}
