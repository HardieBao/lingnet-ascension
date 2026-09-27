import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "灵网纪元 · 任务大殿",
  description: "接取真实 AI 任务，完成天道审判，在赛博修仙世界中修炼成长。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
