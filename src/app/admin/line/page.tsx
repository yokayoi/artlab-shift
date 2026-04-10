"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers } from "@/lib/firebase/firestore";
import { UserProfile } from "@/lib/types";

export default function AdminLinePage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; debug?: unknown } | null>(null);
  const [lineUsers, setLineUsers] = useState<UserProfile[]>([]);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [sendMode, setSendMode] = useState<"all" | "selected">("all");

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push("/");
    }
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      const users = await getAllUsers();
      setLineUsers(users.filter((u) => u.lineUserId));
    })();
  }, [user, isAdmin]);

  const toggleUser = (uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedUids(new Set(lineUsers.map((u) => u.uid)));
  };

  const deselectAll = () => {
    setSelectedUids(new Set());
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    const targetCount = sendMode === "all" ? lineUsers.length : selectedUids.size;
    if (targetCount === 0) return;
    if (!confirm(`${targetCount}名にLINE通知を送信しますか？`)) return;
    setSending(true);
    setResult(null);
    try {
      const { getAuth } = await import("firebase/auth");
      const idToken = await getAuth().currentUser?.getIdToken();
      const body: Record<string, unknown> = { monthId: "custom", type: "custom", message };
      if (sendMode === "selected") {
        body.targetUids = Array.from(selectedUids);
      }
      const res = await fetch("/api/line/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResult({ sent: data.sent || 0, failed: data.failed || 0, debug: data.debug });
      if (data.sent > 0) setMessage("");
    } catch {
      setResult({ sent: 0, failed: -1 });
    }
    setSending(false);
  };

  if (loading || !user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <button onClick={() => router.push("/admin")} className="text-sm text-brand-600 mb-4 inline-block">
        ← 管理画面に戻る
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-6">LINE通知</h1>

      <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        LINE連携済み: {lineUsers.length}名
      </div>

      {/* 送信先選択 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-medium text-gray-800 mb-3">送信先</h2>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setSendMode("all")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              sendMode === "all" ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            全員
          </button>
          <button
            onClick={() => setSendMode("selected")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              sendMode === "selected" ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            選択して送信
          </button>
        </div>

        {sendMode === "selected" && (
          <div>
            <div className="flex gap-2 mb-2">
              <button onClick={selectAll} className="text-xs text-brand-600 hover:underline">全選択</button>
              <button onClick={deselectAll} className="text-xs text-gray-500 hover:underline">全解除</button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {lineUsers.map((u) => (
                <label key={u.uid} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedUids.has(u.uid)}
                    onChange={() => toggleUser(u.uid)}
                    className="accent-brand-600"
                  />
                  <span className="text-sm text-gray-700">{u.nickname || u.displayName}</span>
                  <span className="text-xs text-gray-400">{u.lineDisplayName}</span>
                </label>
              ))}
              {lineUsers.length === 0 && (
                <p className="text-xs text-gray-400 py-2">LINE連携済みのユーザーがいません</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* メッセージ入力 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-medium text-gray-800 mb-3">メッセージ</h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="メッセージを入力..."
          rows={5}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
        <button
          onClick={handleSend}
          disabled={sending || !message.trim() || (sendMode === "selected" && selectedUids.size === 0)}
          className="w-full mt-3 py-3 rounded-xl font-medium text-white bg-[#06C755] hover:bg-[#05b34c] disabled:bg-gray-300 transition-colors"
        >
          {sending
            ? "送信中..."
            : sendMode === "all"
              ? `全員(${lineUsers.length}名)に送信`
              : `${selectedUids.size}名に送信`}
        </button>
        {result && (
          <>
            <p className={`mt-3 text-sm ${result.failed <= 0 ? "text-green-600" : "text-amber-600"}`}>
              {result.sent > 0
                ? `${result.sent}名に送信しました`
                : result.failed === -1
                  ? "送信に失敗しました"
                  : "LINE連携済みのユーザーがいません"}
              {result.failed > 0 && `（${result.failed}名失敗）`}
            </p>
            {result.debug && (
              <pre className="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded overflow-x-auto">
                {JSON.stringify(result.debug, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}
