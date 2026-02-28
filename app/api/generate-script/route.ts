import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// OpenAIクライアントを遅延初期化（ビルド時にはAPIキーが不要）
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

interface ServiceInfo {
  name: string;
  description: string;
  features: string;
  targetProblems: string;
}

interface GenerateScriptRequest {
  councilDate: string;      // 議会/日付
  agendaTitle: string;      // 議題タイトル
  agendaSummary: string;    // 議題概要
  speakers: string;         // 質問者/回答者
  excerptText: string;      // 抜粋テキスト
  companyName?: string;     // 企業名（オプション）
  serviceInfo?: ServiceInfo; // サービス情報
  prefecture?: string;      // 都道府県
  city?: string;            // 市区町村
}

export async function POST(request: NextRequest) {
  console.log("=== /api/generate-script デバッグ情報 ===");

  try {
    const body: GenerateScriptRequest = await request.json();

    console.log("リクエストデータ:", {
      councilDate: body.councilDate?.substring(0, 50),
      agendaTitle: body.agendaTitle?.substring(0, 50),
      hasExcerpt: !!body.excerptText,
      serviceName: body.serviceInfo?.name || "なし",
    });

    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEYが設定されていません");
      return NextResponse.json(
        { success: false, error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }

    // プロンプトを構築
    const systemPrompt = `あなたは自治体向け営業の電話スクリプトを作成する専門家です。

■ 重要な前提
私たちは「自治体様と企業様のコーディネートを行う会社」です。
- 売り込みではなく、情報交換・マッチングの立場
- 議会での質問・答弁を拝見し、課題解決に役立つ企業やサービスをご紹介
- 他都市の事例やメリット・デメリットの情報交換ができる

■ スクリプト作成の重要ポイント
1. サービスと課題のリンクを明確に：議会で議論された課題と、紹介するサービスがどう解決につながるかを具体的に説明
2. コーディネーターとしての立場：詳しい話は企業担当者から説明するが、概要として「どこにどう活かされるか」は把握しておく
3. 情報交換のスタンス：売り込みではなく、他都市事例の共有や検討材料の提供という姿勢
4. 【重要】「御庁」という表現は絶対に使わない。必ず「〇〇市様」「△△区様」など実際の自治体名を使う（議会情報から自治体名を抽出して使用）

以下の形式で、5つのステップに分けてスクリプトを生成してください：

【受付】担当者指名
→ 受付突破のため、具体的な情報を伝える（手を抜かない）
→ 話す順序（重要）：
  1. まず自己紹介と自社の説明：「私、〇〇会社の△△と申します。私どもは自治体様と企業様のコーディネートを行っている会社でございます」
  2. その上で具体的な議会情報を伝える：
     - いつの議会か（日付）
     - 誰が質問したか（議員名）
     - 何について質問されたか（議題の具体的内容）
     - どのような答弁があったか
  3. 取り次ぎ依頼：「その答弁を作成された方」「ご担当の方」に取り次いでほしいと依頼
→ 例：「私、〇〇会社の△△と申します。私どもは自治体様と企業様のコーディネートを行っている会社でございます。実は、〇月〇日の議会で、△△議員から□□についてご質問があり、◇◇とご答弁されていたかと思います。その件でご担当の方、答弁を作成された方にお繋ぎいただけますでしょうか」

※重要：スクリプト内の日付については【要確認】と注記してください。AIが生成した日付は誤りの可能性があるため、電話前に必ず議会情報で正確な日付を確認すること。

【係長】趣旨説明・引用
→ 「はじめまして、〇〇会社の△△と申します」から始める（繰り返しになっても必ず自己紹介から入る）
→ 趣旨を丁寧に説明：「私どもは自治体様と企業様のコーディネートを行っておりまして、皆様が現場で抱えていらっしゃる課題を把握させていただき、解決につながるご提案ができればと考えております」
→ 「議会の動画を拝見しまして」「〇〇という質問に対して△△とご答弁されていたかと思います」と具体的に引用
→ 【重要】紹介したいサービス/会社があることを伝える：「その課題に対して、ぜひご紹介したい企業（サービス）がございまして、ご連絡させていただきました」
→ サービスと課題のリンクを簡潔に説明：「〇〇というサービスなのですが、△△市様の□□という課題に対して、◇◇という形でお役に立てるのではないかと考えております」
→ その上で情報交換のスタンス：「ぜひ〇〇市様の現状やお考えをお聞かせいただいて、私どもからも他都市の事例や取り組みについて情報交換させていただければと思います」（※〇〇市様は実際の自治体名に置き換える）

※注意：「共感しました」「感銘を受けました」などの大げさな表現は使わない。自然な敬語で話す。紹介したいサービスがあることは明確に伝えつつ、押し売りではなく情報交換という姿勢を示す

【打診】ハードル下げ
→ 企業担当者との面談を打診：「詳しいお話は企業の担当者からご説明させていただければと思うのですが、一度お時間いただけないでしょうか」
→ 情報交換という切り口でハードルを下げる：「〇〇市様の現状やお考えもお聞かせいただいて、他都市での導入事例なども含めて情報交換できればと思います」（※〇〇市様は実際の自治体名）
→ 「検討されていることがあればお手伝いできますし、まだ検討前でしたら情報収集としてお役立ていただければ」
→ 「まずは15分程度、情報交換のお時間をいただければ」

※ポイント：紹介したいサービス・企業があることは係長フェーズで伝えているので、ここでは「詳しくは企業担当者から」として面談のアポを取ることに集中する

【フェーズ確認】
→ 現在の検討状況を確認
→ 「詳しく聞きたい」と言われたら「詳細は企業担当者からご説明しますが、概要としては〇〇のような形で△△市様の□□に活かせます」（※自治体名を使う）
→ 相手の関心に刺さりそうなポイントを押さえて回答

【切り返し】
→ 「資料だけください」への対応：「資料だけではお伝えしきれない部分があります。ケースバイケースで様々な対応も考えられますので、まずは簡単にお話をさせていただいた上で、資料をお送りさせてください」
→ 「忙しい」への対応：他都市事例の情報提供という価値を伝え、短時間での情報交換を提案

各ステップは必ず【】で囲んだタイトルから始めてください。
トークは自然な会話調で、具体的な議会内容を引用してください。`;

    // サービス情報をフォーマット
    const serviceSection = body.serviceInfo ? `
■ 紹介するサービス情報
- サービス名: ${body.serviceInfo.name}
- サービス概要: ${body.serviceInfo.description || "なし"}
- 主な機能・特徴: ${body.serviceInfo.features || "なし"}
- 解決できる課題: ${body.serviceInfo.targetProblems || "なし"}
` : "";

    // 自治体名を構築
    const municipalityName = body.city
      ? `${body.city}様`
      : body.prefecture
        ? `${body.prefecture}様`
        : null;

    const userPrompt = `以下の議会情報を基に、営業電話スクリプトを作成してください。

■ 議会情報
- 自治体名: ${body.city || ""}${body.prefecture ? `（${body.prefecture}）` : ""}
- 議会/日付: ${body.councilDate || "不明"}
- 議題: ${body.agendaTitle || "不明"}
- 概要: ${body.agendaSummary || "不明"}
- 質疑応答: ${body.speakers || "不明"}
${municipalityName ? `\n※この自治体を呼ぶときは「${municipalityName}」と表現してください（「御庁」は使用禁止）` : ""}

■ 抜粋テキスト（議会での発言内容）
${body.excerptText || "なし"}
${serviceSection}
■ 作成のポイント
1. 上記の議会での質問・答弁内容を具体的に引用してください
2. 【重要】議会で議論された課題と、上記の「紹介するサービス」がどのように解決につながるかを具体的にリンクさせてください
3. サービスの機能・特徴を踏まえて、自治体の課題解決にどう役立つかを説明してください
4. コーディネーターとして、情報交換・他都市事例共有という切り口で提案してください
5. 「詳しくは企業担当者から」としつつも、サービスの概要と活用イメージは説明できるようにしてください
6. 【必須】「御庁」は使わず、議会情報から自治体名（〇〇市、△△区など）を抽出し「〇〇市様」の形式で使用してください

具体的な議会内容とサービス情報を踏まえた、説得力のある電話スクリプトを作成してください。`;

    console.log("OpenAI API呼び出し開始...");

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const generatedScript = completion.choices[0]?.message?.content || "";

    console.log("OpenAI API呼び出し完了");
    console.log("生成されたスクリプト（先頭200文字）:", generatedScript.substring(0, 200));

    return NextResponse.json({
      success: true,
      script: generatedScript,
    });
  } catch (error) {
    console.error("=== スクリプト生成エラー ===");
    console.error("エラー:", error instanceof Error ? error.message : "Unknown error");

    // OpenAI API specific errors
    if (error instanceof OpenAI.APIError) {
      console.error("OpenAI APIエラー:", error.status, error.message);
      return NextResponse.json(
        { success: false, error: `OpenAI API error: ${error.message}` },
        { status: error.status || 500 }
      );
    }

    return NextResponse.json(
      { success: false, error: "スクリプト生成に失敗しました" },
      { status: 500 }
    );
  }
}
