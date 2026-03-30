import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import Header from "@/components/layout/Header";
import ThemeShell from "@/components/layout/ThemeShell";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "アートデザインラボ シフト管理",
  description: "ファシリテーター向けシフト管理アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[var(--font-geist-sans)]">
        <AuthProvider>
          <ThemeShell>
            <Header />
            <main className="flex-1">{children}</main>
          </ThemeShell>
        </AuthProvider>
      </body>
    </html>
  );
}
