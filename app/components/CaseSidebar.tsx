"use client";

import { CallViewData } from "../types";

interface CaseSidebarProps {
  cases: CallViewData[];
  currentIndex: number;
  onSelectCase: (index: number) => void;
}

export default function CaseSidebar({
  cases,
  currentIndex,
  onSelectCase,
}: CaseSidebarProps) {
  // 議会/日付から自治体名を抽出
  const extractMunicipality = (councilDate: string): string => {
    // 例: "北海道苫小牧市議会 / 2025/12/09" → "北海道苫小牧市"
    const match = councilDate.match(/^(.+?)(議会|市議会|町議会|村議会)/);
    if (match) {
      return match[1];
    }
    // マッチしない場合は最初のスラッシュまで
    const slashIndex = councilDate.indexOf("/");
    if (slashIndex > 0) {
      return councilDate.substring(0, slashIndex).trim();
    }
    return councilDate;
  };

  // 日付を抽出
  const extractDate = (councilDate: string): string => {
    // 例: "北海道苫小牧市議会 / 2025/12/09" → "2025/12/09"
    const match = councilDate.match(/(\d{4}\/\d{1,2}\/\d{1,2})/);
    return match ? match[1] : "";
  };

  return (
    <div className="bg-white rounded-lg shadow h-full flex flex-col">
      {/* ヘッダー */}
      <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-sm font-bold text-gray-700">案件一覧</h2>
        <p className="text-xs text-gray-500">{cases.length}件</p>
      </div>

      {/* 案件リスト */}
      <div className="flex-1 overflow-y-auto">
        {cases.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            案件がありません
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {cases.map((caseItem, index) => {
              const isSelected = index === currentIndex;
              const municipality = extractMunicipality(caseItem.councilDate);
              const date = extractDate(caseItem.councilDate);

              return (
                <li key={caseItem.companyRowKey || index}>
                  <button
                    onClick={() => onSelectCase(index)}
                    className={`w-full text-left px-3 py-2 transition-colors ${
                      isSelected
                        ? "bg-blue-50 border-l-4 border-blue-500"
                        : "hover:bg-gray-50 border-l-4 border-transparent"
                    }`}
                  >
                    {/* 自治体名 */}
                    <div
                      className={`text-sm font-medium truncate ${
                        isSelected ? "text-blue-800" : "text-gray-800"
                      }`}
                    >
                      {municipality}
                    </div>

                    {/* 議題タイトル（省略表示） */}
                    <div className="text-xs text-gray-600 truncate mt-0.5">
                      {caseItem.agendaTitle}
                    </div>

                    {/* 日付とステータス */}
                    <div className="flex items-center gap-2 mt-1">
                      {date && (
                        <span className="text-xs text-gray-400">{date}</span>
                      )}
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          caseItem.status === "未着手"
                            ? "bg-gray-100 text-gray-600"
                            : caseItem.status === "対応中"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {caseItem.status}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          caseItem.priority === "A"
                            ? "bg-red-100 text-red-700"
                            : caseItem.priority === "B"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {caseItem.priority}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
