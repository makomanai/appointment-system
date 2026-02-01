/**
 * フェッチ履歴管理
 * 差分取得のために最終フェッチ日時を保存・取得
 */

import { kv } from "@vercel/kv";

const FETCH_HISTORY_KEY = "connector:fetch_history";

export interface FetchHistoryEntry {
  serviceId: string;
  lastFetchDate: string;      // ISO日付（YYYY-MM-DD）
  lastFetchTimestamp: number; // Unix timestamp
  totalFetched: number;       // 累計取得件数
  lastCount: number;          // 最後の取得件数
}

/**
 * フェッチ履歴を取得
 */
export async function getFetchHistory(serviceId: string): Promise<FetchHistoryEntry | null> {
  try {
    const history = await kv.hget<FetchHistoryEntry>(FETCH_HISTORY_KEY, serviceId);
    return history;
  } catch (error) {
    console.error("[FetchHistory] 取得エラー:", error);
    return null;
  }
}

/**
 * フェッチ履歴を更新
 */
export async function updateFetchHistory(
  serviceId: string,
  fetchedCount: number
): Promise<void> {
  try {
    const now = new Date();
    const existing = await getFetchHistory(serviceId);

    const entry: FetchHistoryEntry = {
      serviceId,
      lastFetchDate: now.toISOString().split("T")[0],
      lastFetchTimestamp: now.getTime(),
      totalFetched: (existing?.totalFetched || 0) + fetchedCount,
      lastCount: fetchedCount,
    };

    await kv.hset(FETCH_HISTORY_KEY, { [serviceId]: entry });
    console.log(`[FetchHistory] 更新: ${serviceId} - ${fetchedCount}件`);
  } catch (error) {
    console.error("[FetchHistory] 更新エラー:", error);
  }
}

/**
 * 全フェッチ履歴を取得
 */
export async function getAllFetchHistory(): Promise<Record<string, FetchHistoryEntry>> {
  try {
    const history = await kv.hgetall<Record<string, FetchHistoryEntry>>(FETCH_HISTORY_KEY);
    return history || {};
  } catch (error) {
    console.error("[FetchHistory] 全取得エラー:", error);
    return {};
  }
}

/**
 * フェッチ履歴をクリア
 */
export async function clearFetchHistory(serviceId?: string): Promise<void> {
  try {
    if (serviceId) {
      await kv.hdel(FETCH_HISTORY_KEY, serviceId);
    } else {
      await kv.del(FETCH_HISTORY_KEY);
    }
  } catch (error) {
    console.error("[FetchHistory] クリアエラー:", error);
  }
}

/**
 * 差分取得用の日付範囲を計算
 * - 初回: 4ヶ月前から今日まで
 * - 2回目以降: 最終フェッチ日から今日まで
 */
export async function getDateRangeForFetch(
  serviceId: string,
  initialMonthsBack: number = 4
): Promise<{ startDate: string; endDate: string; isInitial: boolean }> {
  const history = await getFetchHistory(serviceId);
  const now = new Date();
  const endDate = now.toISOString().split("T")[0];

  if (!history) {
    // 初回: N ヶ月前から
    const start = new Date(now);
    start.setMonth(start.getMonth() - initialMonthsBack);
    return {
      startDate: start.toISOString().split("T")[0],
      endDate,
      isInitial: true,
    };
  }

  // 2回目以降: 最終フェッチ日から（1日のオーバーラップで漏れ防止）
  const lastDate = new Date(history.lastFetchDate);
  lastDate.setDate(lastDate.getDate() - 1); // 1日前から取得（漏れ防止）

  return {
    startDate: lastDate.toISOString().split("T")[0],
    endDate,
    isInitial: false,
  };
}
