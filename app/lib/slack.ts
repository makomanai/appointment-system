/**
 * Slack通知ユーティリティ
 *
 * 環境変数 SLACK_WEBHOOK_URL を設定すると通知が有効になります
 */

interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
}

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
}

/**
 * Slackが設定されているかチェック
 */
export function isSlackConfigured(): boolean {
  return !!process.env.SLACK_WEBHOOK_URL;
}

/**
 * Slackにメッセージを送信
 */
export async function sendSlackMessage(message: SlackMessage): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log("[Slack] Webhook URLが設定されていません");
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      console.error("[Slack] 送信エラー:", response.status, response.statusText);
      return false;
    }

    console.log("[Slack] 通知送信完了");
    return true;
  } catch (error) {
    console.error("[Slack] 送信エラー:", error);
    return false;
  }
}

/**
 * パイプライン完了通知を送信
 */
export async function notifyPipelineComplete(params: {
  companyName: string;
  serviceName: string;
  totalFetched: number;
  zeroOrderPassed: number;
  importedCount: number;
  dryRun: boolean;
  errors?: string[];
}): Promise<boolean> {
  const {
    companyName,
    serviceName,
    totalFetched,
    zeroOrderPassed,
    importedCount,
    dryRun,
    errors = [],
  } = params;

  const statusEmoji = errors.length > 0 ? "⚠️" : "✅";
  const modeText = dryRun ? "（ドライラン）" : "";

  const message: SlackMessage = {
    text: `${statusEmoji} データ取込完了${modeText}: ${companyName}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${statusEmoji} データ取込完了${modeText}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*企業:*\n${companyName}`,
          },
          {
            type: "mrkdwn",
            text: `*サービス:*\n${serviceName}`,
          },
          {
            type: "mrkdwn",
            text: `*取得件数:*\n${totalFetched}件`,
          },
          {
            type: "mrkdwn",
            text: `*0次通過:*\n${zeroOrderPassed}件`,
          },
          {
            type: "mrkdwn",
            text: `*DB投入:*\n${importedCount}件`,
          },
          {
            type: "mrkdwn",
            text: `*モード:*\n${dryRun ? "ドライラン" : "本番"}`,
          },
        ],
      },
    ],
  };

  if (errors.length > 0) {
    message.blocks?.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*エラー:*\n${errors.join("\n")}`,
      },
    });
  }

  return sendSlackMessage(message);
}

/**
 * スケジューラー完了通知を送信
 */
export async function notifySchedulerComplete(params: {
  totalCompanies: number;
  successCount: number;
  errorCount: number;
  totalImported: number;
  errors?: Array<{ companyId: string; error: string }>;
}): Promise<boolean> {
  const {
    totalCompanies,
    successCount,
    errorCount,
    totalImported,
    errors = [],
  } = params;

  const statusEmoji = errorCount > 0 ? "⚠️" : "✅";

  const message: SlackMessage = {
    text: `${statusEmoji} スケジューラー完了: ${successCount}/${totalCompanies}社`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${statusEmoji} スケジューラー完了`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*処理企業:*\n${successCount}/${totalCompanies}社`,
          },
          {
            type: "mrkdwn",
            text: `*エラー:*\n${errorCount}社`,
          },
          {
            type: "mrkdwn",
            text: `*総DB投入:*\n${totalImported}件`,
          },
        ],
      },
    ],
  };

  if (errors.length > 0) {
    const errorText = errors
      .slice(0, 5)
      .map((e) => `• ${e.companyId}: ${e.error}`)
      .join("\n");

    message.blocks?.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*エラー詳細:*\n${errorText}${errors.length > 5 ? `\n...他${errors.length - 5}件` : ""}`,
      },
    });
  }

  return sendSlackMessage(message);
}

/**
 * エラー通知を送信
 */
export async function notifyError(params: {
  title: string;
  error: string;
  context?: Record<string, string>;
}): Promise<boolean> {
  const { title, error, context } = params;

  const message: SlackMessage = {
    text: `🚨 エラー: ${title}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🚨 ${title}`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*エラー内容:*\n\`\`\`${error}\`\`\``,
        },
      },
    ],
  };

  if (context) {
    const contextFields = Object.entries(context).map(([key, value]) => ({
      type: "mrkdwn",
      text: `*${key}:*\n${value}`,
    }));

    message.blocks?.push({
      type: "section",
      fields: contextFields,
    });
  }

  return sendSlackMessage(message);
}
