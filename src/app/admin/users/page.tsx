"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers, updateUserRole, updateUserHourlyRate, deleteUserDoc, updateUserProfile, setUserClassCount } from "@/lib/firebase/firestore";
import { UserProfile } from "@/lib/types";
import { getTier, isTraining } from "@/lib/utils/constants";

export default function AdminUsersPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [editingNickname, setEditingNickname] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");
  const [editingClassCount, setEditingClassCount] = useState<string | null>(null);
  const [classCountInput, setClassCountInput] = useState("");

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
    const url = `${window.location.origin}/login?openExternalBrowser=1`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditRate = (u: UserProfile) => {
    setEditingRate(u.uid);
    setRateInput(u.hourlyRate?.toString() || "");
  };

  const handleSaveRate = async (uid: string) => {
    const rate = parseInt(rateInput);
    if (!isNaN(rate) && rate >= 0) {
      await updateUserHourlyRate(uid, rate);
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, hourlyRate: rate } : u))
      );
    }
    setEditingRate(null);
  };

  const handleEditNickname = (u: UserProfile) => {
    setEditingNickname(u.uid);
    setNicknameInput(u.nickname || "");
  };

  const handleSaveNickname = async (uid: string) => {
    await updateUserProfile(uid, { nickname: nicknameInput });
    setUsers((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, nickname: nicknameInput } : u))
    );
    setEditingNickname(null);
  };

  const handleEditClassCount = (u: UserProfile) => {
    setEditingClassCount(u.uid);
    setClassCountInput((u.classCount || 0).toString());
  };

  const handleSaveClassCount = async (uid: string) => {
    const count = parseInt(classCountInput);
    if (!isNaN(count) && count >= 0) {
      await setUserClassCount(uid, count);
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, classCount: count } : u))
      );
    }
    setEditingClassCount(null);
  };

  const handleDeleteUser = async (targetUser: UserProfile) => {
    if (targetUser.uid === user?.uid) return;
    if (!confirm(`${targetUser.displayName} を削除しますか？この操作は取り消せません。`)) return;
    await deleteUserDoc(targetUser.uid);
    setUsers((prev) => prev.filter((u) => u.uid !== targetUser.uid));
  };

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  const admins = users.filter((u) => u.role === "admin");
  const facilitators = users.filter((u) => u.role === "facilitator");

  const UserRow = ({ u, showRate }: { u: UserProfile; showRate?: boolean }) => {
    const tier = getTier(u.classCount || 0);
    return (
      <div key={u.uid} className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-100 flex items-center justify-center text-brand-700 font-medium text-sm shrink-0">
              {u.photoURL ? (
                <img src={u.photoURL} alt="" className="w-full h-full object-cover" />
              ) : (
                (u.nickname || u.displayName)?.[0] || "?"
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800">{u.nickname || u.displayName}</span>
                {tier && <span className="text-xs">{tier.emoji}</span>}
              </div>
              <div className="text-xs text-gray-500">{u.email}</div>
              {u.nickname && (
                <div className="text-xs text-gray-400">{u.displayName}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleToggleRole(u)}
              disabled={u.uid === user?.uid}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                u.role === "admin"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-gray-100 text-gray-600 hover:bg-purple-50 hover:text-purple-600"
              } ${u.uid === user?.uid ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {u.role === "admin" ? "管理者" : "→ 管理者"}
            </button>
            {u.uid !== user?.uid && (
              <button
                onClick={() => handleDeleteUser(u)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                削除
              </button>
            )}
          </div>
        </div>
        {/* Editable fields for facilitators */}
        {showRate && (
          <div className="mt-2 ml-11 flex flex-wrap items-center gap-3 text-sm">
            {/* Nickname edit */}
            {editingNickname === u.uid ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveNickname(u.uid)}
                  placeholder="ニックネーム"
                  className="w-24 text-sm border border-gray-300 rounded px-2 py-1"
                  autoFocus
                />
                <button onClick={() => handleSaveNickname(u.uid)} className="text-xs text-brand-600">保存</button>
                <button onClick={() => setEditingNickname(null)} className="text-xs text-gray-400">取消</button>
              </div>
            ) : (
              <button onClick={() => handleEditNickname(u)} className="text-xs text-gray-500 hover:text-brand-600">
                {u.nickname ? `名前: ${u.nickname}` : "名前設定"}
              </button>
            )}
            <span className="text-gray-300">|</span>
            {/* Rate edit */}
            {editingRate === u.uid ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveRate(u.uid)}
                  className="w-20 text-sm border border-gray-300 rounded px-2 py-1 text-right"
                  autoFocus
                />
                <span className="text-xs text-gray-500">円/h</span>
                <button onClick={() => handleSaveRate(u.uid)} className="text-xs text-brand-600">保存</button>
                <button onClick={() => setEditingRate(null)} className="text-xs text-gray-400">取消</button>
              </div>
            ) : (
              <button onClick={() => handleEditRate(u)} className="text-xs text-gray-500 hover:text-brand-600">
                {u.hourlyRate ? `¥${u.hourlyRate.toLocaleString()}/h` : "時給未設定"}
              </button>
            )}
            <span className="text-gray-300">|</span>
            {/* Class count edit */}
            {editingClassCount === u.uid ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={classCountInput}
                  onChange={(e) => setClassCountInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveClassCount(u.uid)}
                  className="w-16 text-sm border border-gray-300 rounded px-2 py-1 text-right"
                  autoFocus
                />
                <span className="text-xs text-gray-500">回</span>
                <button onClick={() => handleSaveClassCount(u.uid)} className="text-xs text-brand-600">保存</button>
                <button onClick={() => setEditingClassCount(null)} className="text-xs text-gray-400">取消</button>
              </div>
            ) : (
              <button onClick={() => handleEditClassCount(u)} className="text-xs text-gray-500 hover:text-brand-600">
                {u.classCount || 0}回{isTraining(u.classCount || 0) ? " 📚研修" : ""}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => router.push("/admin")} className="text-sm text-brand-600 mb-4 inline-block">
        ← ダッシュボード
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-6">ユーザー管理</h1>

      {/* Invite Link */}
      <div className="bg-brand-50 rounded-xl border border-brand-200 p-4 mb-6">
        <p className="text-sm text-brand-800 mb-2">
          下記リンクを共有して、ファシリテーターを招待できます。Googleログイン後に自動登録されます。
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={typeof window !== "undefined" ? `${window.location.origin}/login?openExternalBrowser=1` : ""}
            className="flex-1 text-sm bg-white border border-brand-200 rounded-lg px-3 py-2 text-gray-700"
          />
          <button
            onClick={handleCopyInviteLink}
            className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 transition-colors whitespace-nowrap"
          >
            {copied ? "コピー済み" : "コピー"}
          </button>
        </div>
      </div>

      {/* Admin Users */}
      <h2 className="text-sm font-medium text-gray-500 mb-2">管理者（{admins.length}名）</h2>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 mb-6">
        {admins.map((u) => (
          <UserRow key={u.uid} u={u} />
        ))}
      </div>

      {/* Facilitator Users */}
      <h2 className="text-sm font-medium text-gray-500 mb-2">ファシリテーター（{facilitators.length}名）</h2>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {facilitators.map((u) => (
          <UserRow key={u.uid} u={u} showRate />
        ))}
        {facilitators.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-400">ファシリテーターがいません</div>
        )}
      </div>
    </div>
  );
}
