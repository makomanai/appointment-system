"use client";

import { useState } from "react";
import { CallViewData, SCRIPT_STEPS } from "@/app/types";

export interface ServiceOption {
  id: string;
  name: string;
  description: string;
  features: string;
  targetProblems: string;
}

interface CenterPanelProps {
  data: CallViewData | null;
  onGenerateScript?: (serviceId: string) => void;
  isGenerating?: boolean;
  services?: ServiceOption[];
  selectedServiceId?: string;
  onServiceChange?: (serviceId: string) => void;
}

// スクリプトをステップごとに分割する関数
function parseScriptToSteps(
  script: string
): { id: string; title: string; content: string }[] {
  const steps: { id: string; title: string; content: string }[] = [];

  // ステップのパターンを定義
  const stepPatterns = [
    { id: "reception", pattern: /【受付】/ },
    { id: "chief", pattern: /【係長】/ },
    { id: "proposal", pattern: /【打診】/ },
    { id: "phase", pattern: /【フェーズ確認】/ },
    { id: "counter", pattern: /【切り返し】/ },
  ];

  // スクリプトを各ステップで分割
  let remainingScript = script;

  for (let i = 0; i < stepPatterns.length; i++) {
    const currentPattern = stepPatterns[i];
    const nextPattern = stepPatterns[i + 1];

    const currentMatch = remainingScript.match(currentPattern.pattern);
    if (currentMatch) {
      const startIndex = currentMatch.index! + currentMatch[0].length;
      let endIndex = remainingScript.length;

      if (nextPattern) {
        const nextMatch = remainingScript.match(nextPattern.pattern);
        if (nextMatch) {
          endIndex = nextMatch.index!;
        }
      }

      const content = remainingScript.slice(startIndex, endIndex).trim();
      const stepInfo = SCRIPT_STEPS.find((s) => s.id === currentPattern.id);

      steps.push({
        id: currentPattern.id,
        title: stepInfo?.title || currentPattern.id,
        content: content,
      });
    }
  }

  // ステップが見つからない場合は全体を1つのステップとして扱う
  if (steps.length === 0 && script.trim()) {
    steps.push({
      id: "full",
      title: "スクリプト全文",
      content: script,
    });
  }

  return steps;
}

export default function CenterPanel({
  data,
  onGenerateScript,
  isGenerating = false,
  services = [],
  selectedServiceId = "",
  onServiceChange,
}: CenterPanelProps) {
  const [activeTab, setActiveTab] = useState<string>("all");

  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow p-4 h-full">
        <h2 className="text-lg font-semibold mb-4 text-gray-700">
          AIスクリプト
        </h2>
        <p className="text-gray-400 text-sm">データを読み込み中...</p>
      </div>
    );
  }

  // スクリプトを取得（scriptDraftがあればそちらを優先）
  const script = data.scriptDraft || data.aiScript || "";
  const steps = parseScriptToSteps(script);

  // タブリスト
  const tabs = [
    { id: "all", title: "全体" },
    ...steps.map((s) => ({ id: s.id, title: s.title.replace(/【|】/g, "") })),
  ];

  return (
    <div className="bg-white rounded-lg shadow p-4 h-full flex flex-col">
      {/* ヘッダー */}
      <div className="mb-4 pb-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-700">AIスクリプト</h2>
        </div>

        {/* サービス選択 */}
        {services.length > 0 && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              紹介するサービス
            </label>
            <select
              value={selectedServiceId}
              onChange={(e) => onServiceChange?.(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">サービスを選択してください</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {onGenerateScript && (
          <button
            onClick={() => onGenerateScript(selectedServiceId)}
            disabled={isGenerating || !selectedServiceId}
            className={`w-full px-4 py-2 text-sm rounded-md transition-colors ${
              isGenerating || !selectedServiceId
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {isGenerating ? "生成中..." : !selectedServiceId ? "サービスを選択してください" : "AI生成"}
          </button>
        )}
      </div>

      {/* タブナビゲーション */}
      {steps.length > 0 && (
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.title}
            </button>
          ))}
        </div>
      )}

      {/* スクリプト表示エリア */}
      <div className="flex-1 overflow-y-auto min-h-[200px] md:min-h-[250px]">
        {!script ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm">
              スクリプトがありません。「AI生成」ボタンを押してください。
            </p>
          </div>
        ) : activeTab === "all" ? (
          // 全体表示
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className="bg-gray-50 rounded-lg p-4 border border-gray-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {index + 1}
                  </span>
                  <h3 className="font-semibold text-gray-800">{step.title}</h3>
                </div>
                <div className="pl-8">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {step.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // 個別ステップ表示
          <div className="h-full">
            {steps
              .filter((s) => s.id === activeTab)
              .map((step) => (
                <div key={step.id} className="h-full flex flex-col">
                  <h3 className="font-semibold text-lg text-gray-800 mb-3">
                    {step.title}
                  </h3>
                  <div className="flex-1 bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p className="text-base text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {step.content}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* 確定関連キーワード */}
      {data.confirmedRelation && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <h4 className="text-xs font-medium text-gray-500 mb-1">
            関連キーワード
          </h4>
          <div className="flex flex-wrap gap-1">
            {data.confirmedRelation.split("、").map((keyword, index) => (
              <span
                key={index}
                className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
