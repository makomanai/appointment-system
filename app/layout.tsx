import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Appointment System",
  description: "自治体向け予約システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
