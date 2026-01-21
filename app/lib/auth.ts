import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { kv } from "@vercel/kv";

// 環境変数から許可されたユーザーを取得（フォールバック用）
function getAllowedUsersFromEnv(): Map<string, string> {
  const usersMap = new Map<string, string>();
  const usersEnv = process.env.ALLOWED_USERS || "";

  if (!usersEnv) {
    return usersMap;
  }

  const users = usersEnv.split(",");
  for (const user of users) {
    const [email, hashedPassword] = user.split(":");
    if (email && hashedPassword) {
      usersMap.set(email.trim(), hashedPassword.trim());
    }
  }

  return usersMap;
}

// KVまたは環境変数からユーザーのパスワードハッシュを取得
async function getUserPassword(email: string): Promise<string | null> {
  try {
    // まずKVをチェック
    const kvPassword = await kv.hget<string>("users", email);
    if (kvPassword) {
      return kvPassword;
    }
  } catch (error) {
    console.log("KV接続エラー（環境変数にフォールバック）:", error);
  }

  // 環境変数にフォールバック
  const envUsers = getAllowedUsersFromEnv();
  return envUsers.get(email) || null;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "メール/パスワード",
      credentials: {
        email: { label: "メールアドレス", type: "email" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.log("認証失敗: 認証情報が不足しています");
          return null;
        }

        const hashedPassword = await getUserPassword(credentials.email);

        if (!hashedPassword) {
          console.log(`認証失敗: ユーザーが見つかりません - ${credentials.email}`);
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, hashedPassword);

        if (!isValid) {
          console.log(`認証失敗: パスワードが一致しません - ${credentials.email}`);
          return null;
        }

        console.log(`認証成功: ${credentials.email}`);
        return {
          id: credentials.email,
          email: credentials.email,
          name: credentials.email.split("@")[0],
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30日
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email;
      }
      return session;
    },
  },
};

// パスワードハッシュ生成ヘルパー
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
