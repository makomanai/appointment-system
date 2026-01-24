import { google } from "googleapis";

// サービスアカウント認証を初期化
function getAuthClient() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not configured");
  }

  const key = JSON.parse(keyJson);

  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

// Google Drive クライアントを取得
function getDriveClient() {
  const auth = getAuthClient();
  return google.drive({ version: "v3", auth });
}

// フォルダ内のファイル一覧を取得
export async function listFilesInFolder(folderId: string): Promise<Array<{
  id: string;
  name: string;
}>> {
  const drive = getDriveClient();

  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder'`,
    fields: "files(id, name)",
    pageSize: 1000,
  });

  return (response.data.files || []).map((file) => ({
    id: file.id || "",
    name: file.name || "",
  }));
}

// ファイル名（グループID）でSRTファイルを検索
export async function findSrtFileByGroupId(
  folderId: string,
  groupId: string
): Promise<{ id: string; name: string } | null> {
  const drive = getDriveClient();

  // グループID.srt で検索
  const response = await drive.files.list({
    q: `'${folderId}' in parents and name = '${groupId}.srt'`,
    fields: "files(id, name)",
    pageSize: 1,
  });

  const files = response.data.files || [];
  if (files.length === 0) {
    return null;
  }

  return {
    id: files[0].id || "",
    name: files[0].name || "",
  };
}

// SRTファイルの内容を取得
export async function getSrtFileContent(fileId: string): Promise<string> {
  const drive = getDriveClient();

  const response = await drive.files.get(
    {
      fileId,
      alt: "media",
    },
    { responseType: "text" }
  );

  return response.data as string;
}

// グループIDからSRT内容を取得（便利関数）
export async function getSrtContentByGroupId(groupId: string): Promise<string | null> {
  const folderId = process.env.GOOGLE_DRIVE_SRT_FOLDER_ID;
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_SRT_FOLDER_ID is not configured");
  }

  const file = await findSrtFileByGroupId(folderId, groupId);
  if (!file) {
    return null;
  }

  return getSrtFileContent(file.id);
}

// Google Drive設定が有効かチェック
export function isGoogleDriveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
    process.env.GOOGLE_DRIVE_SRT_FOLDER_ID
  );
}
