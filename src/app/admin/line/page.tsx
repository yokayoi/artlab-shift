"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers } from "@/lib/firebase/firestore";

export default function AdminLinePage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [lineLinkedCount, setLineLinkedCount] = useState(0);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push("/");
    }
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      const users = await getAllUsers();
      setLineLinkedCount(users.filter((u) => u.lineUserId).length);
    })();
  }, [user, isAdmin]);

  const handleSend = async () => {
    if (!message.trim()) return;
    if (!confirm("この内容でLINE通知を送信しますか？")) return;
    setSending(true);
    setResult(null);
    try {
      const { getAuth } = await import("firebase/auth");
      const idToken = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/line/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ monthId: "custom", type: "custom", message }),
      });
      const data = await res.json();
      setResult({ sent: data.sent || 0, failed: data.failed || 0 });
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
        LINE連携済み: {lineLinkedCount}名
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-medium text-gray-800 mb-3">一斉通知</h2>
        <p className="text-xs text-gray-500 mb-3">LINE連携済みの全ファシリテーターに通知を送信します。</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="メッセージを入力..."
          rows={5}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="w-full mt-3 py-3 rounded-xl font-medium text-white bg-[#06C755] hover:bg-[#05b34c] disabled:bg-gray-300 transition-colors"
        >
          {sending ? "送信中..." : "LINE通知を送信"}
        </button>
        {result && (
          <p className={`mt-3 text-sm ${result.failed <= 0 ? "text-green-600" : "text-amber-600"}`}>
            {result.sent > 0
              ? `${result.sent}名に送信しました`
              : result.failed === -1
                ? "送信に失敗しました"
                : "LINE連携済みのユーザーがいません"}
            {result.failed > 0 && `（${result.failed}名失敗）`}
          </p>
        )}
      </div>
    </div>
  );
}
