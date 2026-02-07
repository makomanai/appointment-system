"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface Service {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  description: string;
  features: string;
  targetProblems: string;
  targetKeywords: string;
  createdAt: string;
  updatedAt: string;
}

interface Company {
  companyId: string;
  companyName: string;
}

export default function ServicesPage() {
  const { data: session } = useSession();
  const [services, setServices] = useState<Service[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [filterCompanyId, setFilterCompanyId] = useState<string>("");

  // フォーム状態
  const [formData, setFormData] = useState({
    companyId: "",
    companyName: "",
    name: "",
    description: "",
    features: "",
    targetProblems: "",
    targetKeywords: "",
  });

  // 企業一覧取得
  const fetchCompanies = useCallback(async () => {
    try {
      const response = await fetch("/api/companies");
      const result = await response.json();
      if (result.success) {
        setCompanies(result.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch companies:", error);
    }
  }, []);

  // サービス一覧取得
  const fetchServices = useCallback(async () => {
    try {
      const url = filterCompanyId
        ? `/api/services?companyId=${filterCompanyId}`
        : "/api/services";
      const response = await fetch(url);
      const result = await response.json();
      if (result.success) {
        setServices(result.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch services:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filterCompanyId]);

  useEffect(() => {
    fetchCompanies();
    fetchServices();
  }, [fetchCompanies, fetchServices]);

  // 企業選択時に企業名も設定
  const handleCompanyChange = (companyId: string) => {
    const company = companies.find((c) => c.companyId === companyId);
    setFormData({
      ...formData,
      companyId,
      companyName: company?.companyName || "",
    });
  };

  // フォーム送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingService
        ? `/api/services/${editingService.id}`
        : "/api/services";
      const method = editingService ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await response.json();
      if (result.success) {
        resetForm();
        fetchServices();
      } else {
        alert(result.error || "エラーが発生しました");
      }
    } catch (error) {
      console.error("Save error:", error);
      alert("保存に失敗しました");
    }
  };

  // 編集開始
  const handleEdit = (service: Service) => {
    setEditingService(service);
    setFormData({
      companyId: service.companyId,
      companyName: service.companyName,
      name: service.name,
      description: service.description,
      features: service.features,
      targetProblems: service.targetProblems,
      targetKeywords: service.targetKeywords || "",
    });
    setIsEditing(true);
  };

  // 削除
  const handleDelete = async (id: string) => {
    if (!confirm("このサービスを削除しますか？")) return;

    try {
      const response = await fetch(`/api/services/${id}`, { method: "DELETE" });
      const result = await response.json();
      if (result.success) {
        fetchServices();
      } else {
        alert(result.error || "削除に失敗しました");
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("削除に失敗しました");
    }
  };

  // フォームリセット
  const resetForm = () => {
    setFormData({
      companyId: "",
      companyName: "",
      name: "",
      description: "",
      features: "",
      targetProblems: "",
      targetKeywords: "",
    });
    setEditingService(null);
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">サービス管理</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              ← メイン画面へ戻る
            </Link>
            <span className="text-sm text-gray-500">
              {session?.user?.email}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 登録/編集フォーム */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">
                {editingService ? "サービス編集" : "新規サービス登録"}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    企業 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.companyId}
                    onChange={(e) => handleCompanyChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">選択してください</option>
                    {companies.map((company) => (
                      <option key={company.companyId} value={company.companyId}>
                        {company.companyName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    サービス名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="例: 防災アプリ"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    サービス概要
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="サービスの概要を入力"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    主な機能・特徴
                  </label>
                  <textarea
                    value={formData.features}
                    onChange={(e) =>
                      setFormData({ ...formData, features: e.target.value })
                    }
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="箇条書きで機能を入力"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    解決できる課題
                  </label>
                  <textarea
                    value={formData.targetProblems}
                    onChange={(e) =>
                      setFormData({ ...formData, targetProblems: e.target.value })
                    }
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="このサービスで解決できる自治体の課題"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    検索キーワード
                    <span className="ml-1 text-xs text-orange-600 font-normal">（0次判定で使用）</span>
                  </label>
                  <textarea
                    value={formData.targetKeywords}
                    onChange={(e) =>
                      setFormData({ ...formData, targetKeywords: e.target.value })
                    }
                    rows={2}
                    className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-orange-50"
                    placeholder="児童相談, 虐待, 一時保護, DX, システム（カンマ区切り）"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    上位10個が必須キーワード（+4点）、それ以降は推奨キーワード（+2点）として使用
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {editingService ? "更新" : "登録"}
                  </button>
                  {editingService && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      キャンセル
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* サービス一覧 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">登録済みサービス</h2>
                <select
                  value={filterCompanyId}
                  onChange={(e) => setFilterCompanyId(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">全企業</option>
                  {companies.map((company) => (
                    <option key={company.companyId} value={company.companyId}>
                      {company.companyName}
                    </option>
                  ))}
                </select>
              </div>

              {isLoading ? (
                <div className="text-center py-8 text-gray-500">
                  読み込み中...
                </div>
              ) : services.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  サービスが登録されていません
                </div>
              ) : (
                <div className="space-y-4">
                  {services.map((service) => (
                    <div
                      key={service.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                              {service.companyName}
                            </span>
                          </div>
                          <h3 className="font-semibold text-gray-800">
                            {service.name}
                          </h3>
                          {service.description && (
                            <p className="text-sm text-gray-600 mt-1">
                              {service.description}
                            </p>
                          )}
                          {service.features && (
                            <div className="mt-2">
                              <span className="text-xs font-medium text-gray-500">
                                機能・特徴:
                              </span>
                              <p className="text-sm text-gray-600 whitespace-pre-line">
                                {service.features}
                              </p>
                            </div>
                          )}
                          {service.targetProblems && (
                            <div className="mt-2">
                              <span className="text-xs font-medium text-gray-500">
                                解決できる課題:
                              </span>
                              <p className="text-sm text-gray-600 whitespace-pre-line">
                                {service.targetProblems}
                              </p>
                            </div>
                          )}
                          {service.targetKeywords && (
                            <div className="mt-2">
                              <span className="text-xs font-medium text-orange-600">
                                検索キーワード:
                              </span>
                              <p className="text-sm text-orange-700 bg-orange-50 px-2 py-1 rounded mt-1">
                                {service.targetKeywords}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleEdit(service)}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDelete(service.id)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
