import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

// 保護するパスを指定（ログインページ、登録ページ、APIルートは除外）
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /login (ログインページ)
     * - /register (新規登録ページ)
     * - /api/auth (認証APIルート)
     * - /_next (Next.jsの内部ルート)
     * - /favicon.ico, /images など静的ファイル
     */
    "/((?!login|register|api/auth|_next|favicon.ico|images).*)",
  ],
};
