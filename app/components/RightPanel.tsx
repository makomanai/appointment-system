"use client";

import { useState, useMemo } from "react";
import {
  CallResultForm,
  Status,
  Priority,
  NextAction,
} from "@/app/types";

interface RightPanelProps {
  initialData?: Partial<CallResultForm>;
  onSave: (data: CallResultForm) => void;
  onSaveAndNext: (data: CallResultForm) => void;
  isSaving?: boolean;
}

const STATUS_OPTIONS: Status[] = ["未着手", "対応中", "完了"];
const PRIORITY_OPTIONS: Priority[] = ["A", "B", "C"];
const NEXT_ACTION_OPTIONS: NextAction[] = [
  "再コール",
  "資料送付",
  "アポ確定",
  "見送り",
  "担当者不在",
  "その他",
];

// メモをパースして構造化データに変換
const parseMemo = (memo: string) => {
  const result = {
    contactName: "",
    department: "",
    phone: "",
    otherMemo: "",
  };

  if (!memo) return result;

  // 「担当者: ○○ / 部署: △△ / 電話: XXX」形式をパース
  const contactMatch = memo.match(/担当者:\s*([^/\n]*)/);
  const deptMatch = memo.match(/部署:\s*([^/\n]*)/);
  const phoneMatch = memo.match(/電話:\s*([^/\n]*)/);

  if (contactMatch) result.contactName = contactMatch[1].trim();
  if (deptMatch) result.department = deptMatch[1].trim();
  if (phoneMatch) result.phone = phoneMatch[1].trim();

  // その他メモを抽出（構造化部分を除いた残り）
  let otherMemo = memo
    .replace(/担当者:\s*[^/\n]*\s*\/?\s*/g, "")
    .replace(/部署:\s*[^/\n]*\s*\/?\s*/g, "")
    .replace(/電話:\s*[^/\n]*\s*\/?\s*/g, "")
    .trim();

  // 先頭の改行を除去
  otherMemo = otherMemo.replace(/^\n+/, "");
  result.otherMemo = otherMemo;

  return result;
};

// 構造化データをメモ文字列に結合
const combineMemo = (
  contactName: string,
  department: string,
  phone: string,
  otherMemo: string
): string => {
  const parts: string[] = [];

  if (contactName.trim()) parts.push(`担当者: ${contactName.trim()}`);
  if (department.trim()) parts.push(`部署: ${department.trim()}`);
  if (phone.trim()) parts.push(`電話: ${phone.trim()}`);

  let result = parts.join(" / ");

  if (otherMemo.trim()) {
    result += result ? `\n\n${otherMemo.trim()}` : otherMemo.trim();
  }

  return result;
};

export default function RightPanel({
  initialData,
  onSave,
  onSaveAndNext,
  isSaving = false,
}: RightPanelProps) {
  // 初期メモをパース
  const initialMemoData = useMemo(
    () => parseMemo(initialData?.memo || ""),
    [initialData?.memo]
  );

  const [formData, setFormData] = useState<CallResultForm>({
    status: initialData?.status || "未着手",
    priority: initialData?.priority || "B",
    callResult: initialData?.callResult || "",
    nextAction: initialData?.nextAction || "",
    nextDate: initialData?.nextDate || "",
    memo: initialData?.memo || "",
  });

  // メモの構造化フィールド
  const [contactName, setContactName] = useState(initialMemoData.contactName);
  const [department, setDepartment] = useState(initialMemoData.department);
  const [phone, setPhone] = useState(initialMemoData.phone);
  const [otherMemo, setOtherMemo] = useState(initialMemoData.otherMemo);

  // 必須情報が未入力かチェック
  const hasEmptyRequiredFields =
    !contactName.trim() || !department.trim() || !phone.trim();

  const handleChange = (
    field: keyof CallResultForm,
    value: string
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // メモを結合してformDataを作成
  const getFormDataWithMemo = (): CallResultForm => {
    const combinedMemo = combineMemo(contactName, department, phone, otherMemo);
    return { ...formData, memo: combinedMemo };
  };

  const handleSave = () => {
    onSave(getFormDataWithMemo());
  };

  const handleSaveAndNext = () => {
    onSaveAndNext(getFormDataWithMemo());
  };

  // ステータスに応じた色を取得
  const getStatusColor = (status: Status) => {
    switch (status) {
      case "未着手":
        return "bg-gray-100 text-gray-700";
      case "対応中":
        return "bg-yellow-100 text-yellow-700";
      case "完了":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  // 優先度に応じた色を取得
  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case "A":
        return "bg-red-100 text-red-700 border-red-300";
      case "B":
        return "bg-yellow-100 text-yellow-700 border-yellow-300";
      case "C":
        return "bg-blue-100 text-blue-700 border-blue-300";
      default:
        return "bg-gray-100 text-gray-700 border-gray-300";
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 h-full flex flex-col">
      <h2 className="text-lg font-semibold mb-4 pb-3 border-b border-gray-200 text-gray-700">
        結果入力
      </h2>

      <div className="flex-1 space-y-4 overflow-y-auto">
        {/* ステータス */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            ステータス <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                onClick={() => handleChange("status", status)}
                className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                  formData.status === status
                    ? getStatusColor(status) + " border-current font-medium"
                    : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* 優先度 */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            優先度
          </label>
          <div className="flex gap-2">
            {PRIORITY_OPTIONS.map((priority) => (
              <button
                key={priority}
                onClick={() => handleChange("priority", priority)}
                className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                  formData.priority === priority
                    ? getPriorityColor(priority) + " font-medium"
                    : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {priority}
              </button>
            ))}
          </div>
        </div>

        {/* 架電結果 */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            架電結果
          </label>
          <textarea
            value={formData.callResult}
            onChange={(e) => handleChange("callResult", e.target.value)}
            placeholder="架電の結果を入力..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        {/* 次のアクション */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            次のアクション
          </label>
          <select
            value={formData.nextAction}
            onChange={(e) => handleChange("nextAction", e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="">選択してください</option>
            {NEXT_ACTION_OPTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>

        {/* 次回日程 */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            次回日程
          </label>
          <input
            type="date"
            value={formData.nextDate}
            onChange={(e) => handleChange("nextDate", e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* 必須情報（担当者・部署・電話） */}
        <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
          <p className="text-sm font-semibold text-yellow-800 mb-3 flex items-center gap-1">
            <span>必須情報</span>
            <span className="text-xs font-normal text-yellow-600">
              （クライアント提出用）
            </span>
          </p>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-yellow-700 mb-1">
                担当者名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="例: 山田太郎"
                className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent ${
                  !contactName.trim()
                    ? "border-yellow-400 bg-yellow-50"
                    : "border-gray-300 bg-white"
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-yellow-700 mb-1">
                部署名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="例: 企画政策課"
                className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent ${
                  !department.trim()
                    ? "border-yellow-400 bg-yellow-50"
                    : "border-gray-300 bg-white"
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-yellow-700 mb-1">
                電話番号 <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="例: 0123-45-6789"
                className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent ${
                  !phone.trim()
                    ? "border-yellow-400 bg-yellow-50"
                    : "border-gray-300 bg-white"
                }`}
              />
            </div>
          </div>
          {hasEmptyRequiredFields && (
            <p className="text-xs text-yellow-700 mt-2 flex items-center gap-1">
              <span>!</span>
              <span>未入力の項目があります</span>
            </p>
          )}
        </div>

        {/* その他メモ */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            その他メモ（任意）
          </label>
          <textarea
            value={otherMemo}
            onChange={(e) => setOtherMemo(e.target.value)}
            placeholder="その他の情報を入力..."
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>
      </div>

      {/* ボタンエリア */}
      <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
        <button
          onClick={handleSaveAndNext}
          disabled={isSaving}
          className={`w-full px-4 py-3 text-sm font-medium rounded-md transition-colors ${
            isSaving
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {isSaving ? "保存中..." : "保存して次へ →"}
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`w-full px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            isSaving
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-gray-100 hover:bg-gray-200 text-gray-700"
          }`}
        >
          保存のみ
        </button>
      </div>
    </div>
  );
}
