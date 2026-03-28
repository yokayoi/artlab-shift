"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers, updateUserRole } from "@/lib/firebase/firestore";
import { UserProfile } from "@/lib/types";

export default function AdminUsersPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      const allUsers = await getAllUsers();
      setUsers(allUsers.sort((a, b) => a.displayName.localeCompare(b.displayName)));
      setDataLoading(false);
    })();
  }, [user, isAdmin]);

  const handleToggleRole = async (targetUser: UserProfile) => {
    if (targetUser.uid === user?.uid) return;
    const newRole = targetUser.role === "admin" ? "facilitator" : "admin";
    await updateUserRole(targetUser.uid, newRole);
    setUsers((prev) =>
      prev.map((u) => (u.uid === targetUser.uid ? { ...u, role: newRole } : u))
    );
  };

  const handleCopyInviteLink = async () => {
    const url = `${window.location.origin}/login`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const admins = users.filter((u) => u.role === "admin");
  const facilitators = users.filter((u) => u.role === "facilitator");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => router.push("/admin")} className="text-sm text-blue-600 mb-4 inline-block">
        ← ダッシュボード
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-6">ユーザー管理</h1>

      {/* Invite Link */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 mb-6">
        <p className="text-sm text-blue-800 mb-2">
          下記リンクを共有して、ファシリテーターを招待できます。Googleログイン後に自動登録されます。
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={typeof window !== "undefined" ? `${window.location.origin}/login` : ""}
            className="flex-1 text-sm bg-white border border-blue-200 rounded-lg px-3 py-2 text-gray-700"
          />
          <button
            onClick={handleCopyInviteLink}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            {copied ? "コピー済み" : "コピー"}
          </button>
        </div>
      </div>

      {/* Admin Users */}
      <h2 className="text-sm font-medium text-gray-500 mb-2">管理者（{admins.length}名）</h2>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 mb-6">
        {admins.map((u) => (
          <div key={u.uid} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-medium text-gray-800">{u.displayName}</div>
              <div className="text-xs text-gray-500">{u.email}</div>
            </div>
            <button
              onClick={() => handleToggleRole(u)}
              disabled={u.uid === user?.uid}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors bg-purple-100 text-purple-700 ${
                u.uid === user?.uid ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              管理者
            </button>
          </div>
        ))}
      </div>

      {/* Facilitator Users */}
      <h2 className="text-sm font-medium text-gray-500 mb-2">ファシリテーター（{facilitators.length}名）</h2>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {facilitators.map((u) => (
          <div key={u.uid} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-medium text-gray-800">{u.displayName}</div>
              <div className="text-xs text-gray-500">{u.email}</div>
            </div>
            <button
              onClick={() => handleToggleRole(u)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-purple-50 hover:text-purple-600 cursor-pointer"
            >
              ファシリテーター → 管理者に変更
            </button>
          </div>
        ))}
        {facilitators.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-400">ファシリテーターがいません</div>
        )}
      </div>
    </div>
  );
}
