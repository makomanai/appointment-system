import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isSupabaseConfigured } from "../../../../lib/supabase";

/**
 * ゴールデンルール - 高確度リード抽出ロジック
 *
 * スコアリング:
 * - タイミング (Timing): +4点
 * - 具体的手段 (Specific Means): +5点
 * - 定量的根拠・反省 (Evidence/Pain): +3点
 *
 * 減点:
 * - 慎重姿勢: -10点
 * - 手遅れ: -5点
 * - 具体性なし: -2点
 *
 * ランク:
 * - S: 10点以上
 * - A: 6〜9点
 * - B: 1〜5点
 * - C: 0点以下
 */

// タイミングキーワード (+4点)
const TIMING_KEYWORDS = [
  "来年度", "新年度", "令和7年度", "令和8年度", "令和9年度",
  "計画策定", "移行", "終了し", "見直し", "リニューアル", "刷新", "開始",
  "予算", "予算化", "予算要求", "来期", "次年度", "年度内",
];

// 具体的手段キーワード (+5点)
const SPECIFIC_MEANS_KEYWORDS = [
  // Web系
  "ポータルサイト", "HP", "ホームページ", "LP", "ランディングページ",
  "広報", "Web", "ウェブ", "アプリ", "可視化", "透明性", "プラットフォーム",
  "サイト構築", "サイト制作", "ウェブサイト",
  // DX/AI系
  "システム", "チャットボット", "研修", "リテラシー", "ガイドライン",
  "デジタル化", "DX", "AI", "自動化", "効率化", "オンライン",
  "クラウド", "SaaS", "導入", "構築",
];

// 定量的根拠・反省キーワード (+3点)
const EVIDENCE_KEYWORDS = [
  // 数字関連
  "時間", "分", "件", "円", "万円", "億円", "削減", "効果", "実績",
  "%", "パーセント", "増加", "向上", "改善",
  // 反省関連
  "未達", "減少", "課題", "困難", "低迷", "伸び悩み", "不足",
  "問題", "懸念", "遅れ", "停滞",
];

// 慎重姿勢キーワード (-10点)
const CAUTIOUS_KEYWORDS = [
  "慎重な姿勢", "慎重に", "困難である", "時期尚早", "見送り",
  "難しい", "厳しい状況", "予定はない", "考えていない",
];

// 手遅れキーワード (-5点)
const TOO_LATE_KEYWORDS = [
  "契約済み", "入札終了", "業者選定済み", "決定済み", "導入済み",
  "稼働中", "運用中", "既に", "すでに導入",
];

// 具体性なしキーワード (-2点)
const VAGUE_KEYWORDS = [
  "検討中", "研究する", "注視する", "調査中", "情報収集",
  "検討していく", "考えていきたい", "模索", "様子を見",
];

interface ScoreResult {
  score: number;
  rank: "S" | "A" | "B" | "C";
  details: {
    timing: { score: number; matches: string[] };
    specificMeans: { score: number; matches: string[] };
    evidence: { score: number; matches: string[] };
    cautious: { score: number; matches: string[] };
    tooLate: { score: number; matches: string[] };
    vague: { score: number; matches: string[] };
  };
}

// テキストからキーワードを検索
function findKeywords(text: string, keywords: string[]): string[] {
  const matches: string[] = [];
  const lowerText = text.toLowerCase();

  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matches.push(keyword);
    }
  }

  return Array.from(new Set(matches)); // 重複を除去
}

// スコアを計算
function calculateScore(text: string): ScoreResult {
  const timingMatches = findKeywords(text, TIMING_KEYWORDS);
  const specificMeansMatches = findKeywords(text, SPECIFIC_MEANS_KEYWORDS);
  const evidenceMatches = findKeywords(text, EVIDENCE_KEYWORDS);
  const cautiousMatches = findKeywords(text, CAUTIOUS_KEYWORDS);
  const tooLateMatches = findKeywords(text, TOO_LATE_KEYWORDS);
  const vagueMatches = findKeywords(text, VAGUE_KEYWORDS);

  // スコア計算
  const timingScore = timingMatches.length > 0 ? 4 : 0;
  const specificMeansScore = specificMeansMatches.length > 0 ? 5 : 0;
  const evidenceScore = evidenceMatches.length > 0 ? 3 : 0;
  const cautiousScore = cautiousMatches.length > 0 ? -10 : 0;
  const tooLateScore = tooLateMatches.length > 0 ? -5 : 0;
  const vagueScore = vagueMatches.length > 0 ? -2 : 0;

  const totalScore =
    timingScore +
    specificMeansScore +
    evidenceScore +
    cautiousScore +
    tooLateScore +
    vagueScore;

  // ランク判定
  let rank: "S" | "A" | "B" | "C";
  if (totalScore >= 10) {
    rank = "S";
  } else if (totalScore >= 6) {
    rank = "A";
  } else if (totalScore >= 1) {
    rank = "B";
  } else {
    rank = "C";
  }

  return {
    score: totalScore,
    rank,
    details: {
      timing: { score: timingScore, matches: timingMatches },
      specificMeans: { score: specificMeansScore, matches: specificMeansMatches },
      evidence: { score: evidenceScore, matches: evidenceMatches },
      cautious: { score: cautiousScore, matches: cautiousMatches },
      tooLate: { score: tooLateScore, matches: tooLateMatches },
      vague: { score: vagueScore, matches: vagueMatches },
    },
  };
}

// 単一トピックをランク付け
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const topicId = searchParams.get("topicId");

  if (!topicId) {
    return NextResponse.json(
      { success: false, error: "topicId is required" },
      { status: 400 }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();

    const { data: topic, error } = await supabase
      .from("topics")
      .select("id, title, summary, excerpt_text")
      .eq("id", topicId)
      .single();

    if (error || !topic) {
      return NextResponse.json(
        { success: false, error: "Topic not found" },
        { status: 404 }
      );
    }

    // テキストを結合して分析
    const text = [topic.title, topic.summary, topic.excerpt_text]
      .filter(Boolean)
      .join(" ");

    const result = calculateScore(text);

    return NextResponse.json({
      success: true,
      data: {
        topicId: topic.id,
        ...result,
      },
    });
  } catch (error) {
    console.error("Rank error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// 企業のトピックを一括ランク付け
export async function POST(request: NextRequest) {
  console.log("=== /api/v2/topics/rank POST ===");

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { companyId, updateDb = true } = body;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "companyId is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 企業のトピックを取得
    const { data: topics, error } = await supabase
      .from("topics")
      .select("id, title, summary, excerpt_text, priority")
      .eq("company_id", companyId);

    if (error) {
      throw error;
    }

    if (!topics || topics.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No topics found",
        results: [],
      });
    }

    console.log(`Processing ${topics.length} topics for ${companyId}`);

    // 各トピックをスコアリング
    const results = [];
    const rankCounts = { S: 0, A: 0, B: 0, C: 0 };

    for (const topic of topics) {
      const text = [topic.title, topic.summary, topic.excerpt_text]
        .filter(Boolean)
        .join(" ");

      const scoreResult = calculateScore(text);

      // priorityをランクに応じて設定 (S/A → A, B → B, C → C)
      const newPriority = scoreResult.rank === "S" || scoreResult.rank === "A" ? "A" : scoreResult.rank;

      results.push({
        topicId: topic.id,
        oldPriority: topic.priority,
        newPriority,
        ...scoreResult,
      });

      rankCounts[scoreResult.rank]++;

      // DBを更新
      if (updateDb && topic.priority !== newPriority) {
        await supabase
          .from("topics")
          .update({ priority: newPriority })
          .eq("id", topic.id);
      }
    }

    console.log("Rank distribution:", rankCounts);

    return NextResponse.json({
      success: true,
      message: `${topics.length}件のトピックをランク付けしました`,
      summary: rankCounts,
      results,
    });
  } catch (error) {
    console.error("Rank error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
