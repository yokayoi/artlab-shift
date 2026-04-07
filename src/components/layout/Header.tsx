"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/lib/firebase/auth";
import { useState } from "react";
import { getTier } from "@/lib/utils/constants";

export default function Header() {
  const { user, profile, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  if (!user) return null;

  const isOnAdminPage = pathname.startsWith("/admin");
  const tier = getTier(profile?.classCount || 0);

  return (
    <header className={`border-b sticky top-0 z-50 ${isOnAdminPage ? "bg-gray-50 border-gray-300" : "bg-white border-gray-200"}`}>
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={isAdmin ? "/admin" : "/schedule"}>
            <img src="/logo.svg" alt="アートデザインラボ シフト" className="h-7" />
          </Link>
          {isAdmin && (
            <nav className="flex gap-1 ml-2">
              <Link
                href="/admin"
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  isOnAdminPage
                    ? "bg-gray-200 text-gray-800"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                管理
              </Link>
              <Link
                href="/schedule"
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  !isOnAdminPage
                    ? "bg-brand-100 text-brand-700"
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
            <span className="hidden sm:inline">{profile?.nickname || user.displayName}</span>
            {tier && <span className="text-xs">{tier.emoji}</span>}
            <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-100 flex items-center justify-center text-brand-700 font-medium text-sm">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="" className="w-full h-full object-cover" />
              ) : (
                (profile?.nickname || user.displayName)?.[0] || "?"
              )}
            </div>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48">
              <div className="px-4 py-2 text-sm text-gray-500 border-b">
                {user.email}
              </div>
              <Link
                href="/profile"
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                プロフィール編集
              </Link>
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
