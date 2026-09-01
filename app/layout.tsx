import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "会議アジェンダ",
  description: "会議アジェンダとタスクを一元管理するワークスペース",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
