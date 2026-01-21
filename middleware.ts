import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

// 保護するパスを指定（ログインページとAPIルートは除外）
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /login (ログインページ)
     * - /api/auth (認証APIルート)
     * - /_next (Next.jsの内部ルート)
     * - /favicon.ico, /images など静的ファイル
     */
    "/((?!login|api/auth|_next|favicon.ico|images).*)",
  ],
};
