"use client";

import { useState, useEffect } from "react";
import { Company, SelectedCompany } from "../types";

interface CompanySelectorProps {
  onSelect: (company: SelectedCompany) => void;
}

export default function CompanySelector({ onSelect }: CompanySelectorProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch("/api/companies");
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "企業一覧の取得に失敗しました");
        }

        setCompanies(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "エラーが発生しました");
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, []);

  const handleSelect = () => {
    const company = companies.find((c) => c.companyId === selectedId);
    if (company) {
      console.log("=== [CompanySelector] 企業選択 ===");
      console.log("選択された企業ID:", company.companyId);
      console.log("選択された企業名:", company.companyName);
      console.log("companyFileId:", company.companyFileId);
      onSelect({
        companyId: company.companyId,
        companyName: company.companyName,
        companyFileId: company.companyFileId,
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">企業一覧を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-5xl mb-4">!</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">エラー</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-lg w-full">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">
          Company Pack Web
        </h1>
        <p className="text-gray-600 mb-6 text-center">
          どの企業の案件に対応しますか？
        </p>

        <div className="space-y-2 mb-6 max-h-80 overflow-y-auto">
          {companies.map((company) => (
            <label
              key={company.companyId}
              className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                selectedId === company.companyId
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="company"
                value={company.companyId}
                checked={selectedId === company.companyId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-4 h-4 text-blue-600"
              />
              <div className="ml-3">
                <span className="text-sm text-gray-500 font-mono">
                  {company.companyId}
                </span>
                <span className="mx-2 text-gray-300">|</span>
                <span className="text-gray-800 font-medium">
                  {company.companyName}
                </span>
              </div>
            </label>
          ))}
        </div>

        <button
          onClick={handleSelect}
          disabled={!selectedId}
          className={`w-full py-3 rounded-lg font-medium transition-all ${
            selectedId
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          決定
        </button>
      </div>
    </div>
  );
}
