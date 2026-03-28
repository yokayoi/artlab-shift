"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/lib/firebase/auth";
import { useState } from "react";

export default function Header() {
  const { user, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  if (!user) return null;

  const isOnAdminPage = pathname.startsWith("/admin");

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={isAdmin ? "/admin" : "/schedule"} className="font-bold text-gray-800">
            アートデザインラボ <span className="text-sm font-normal text-gray-500">シフト</span>
          </Link>
          {isAdmin && (
            <nav className="flex gap-1 ml-2">
              <Link
                href="/admin"
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  isOnAdminPage
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                管理
              </Link>
              <Link
                href="/schedule"
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  !isOnAdminPage
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                スケジュール
              </Link>
            </nav>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
          >
            <span className="hidden sm:inline">{user.displayName}</span>
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium text-sm">
              {user.displayName?.[0] || "?"}
            </div>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48">
              <div className="px-4 py-2 text-sm text-gray-500 border-b">
                {user.email}
              </div>
              <button
                onClick={() => { signOut(); setMenuOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
