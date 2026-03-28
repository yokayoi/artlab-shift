"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/lib/firebase/auth";
import { useState } from "react";

export default function Header() {
  const { user, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return null;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href={isAdmin ? "/admin" : "/schedule"} className="font-bold text-gray-800">
          アートデザインラボ <span className="text-sm font-normal text-gray-500">シフト</span>
        </Link>
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
              {isAdmin && (
                <>
                  <Link
                    href="/admin"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    管理画面
                  </Link>
                  <Link
                    href="/schedule"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    スケジュール
                  </Link>
                </>
              )}
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
