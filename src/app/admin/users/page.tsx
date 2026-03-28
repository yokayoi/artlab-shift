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

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => router.push("/admin")} className="text-sm text-blue-600 mb-4 inline-block">
        ← ダッシュボード
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-6">ユーザー管理</h1>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {users.map((u) => (
          <div key={u.uid} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-medium text-gray-800">{u.displayName}</div>
              <div className="text-xs text-gray-500">{u.email}</div>
            </div>
            <button
              onClick={() => handleToggleRole(u)}
              disabled={u.uid === user?.uid}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                u.role === "admin"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600"
              } ${u.uid === user?.uid ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {u.role === "admin" ? "管理者" : "ファシリテーター"}
            </button>
          </div>
        ))}
        {users.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-400">ユーザーがいません</div>
        )}
      </div>
    </div>
  );
}
