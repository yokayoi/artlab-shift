"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAllAnnouncements,
  createAnnouncement,
  toggleAnnouncement,
  deleteAnnouncement,
} from "@/lib/firebase/firestore";
import { Announcement } from "@/lib/types";

export default function AdminAnnouncementsPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      const all = await getAllAnnouncements();
      setAnnouncements(all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setDataLoading(false);
    })();
  }, [user, isAdmin]);

  const handleCreate = async () => {
    if (!user || !title.trim()) return;
    setSaving(true);
    await createAnnouncement(title.trim(), body.trim(), user.uid);
    const all = await getAllAnnouncements();
    setAnnouncements(all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    setTitle("");
    setBody("");
    setCreating(false);
    setSaving(false);
  };

  const handleToggle = async (ann: Announcement) => {
    await toggleAnnouncement(ann.id, !ann.active);
    setAnnouncements((prev) =>
      prev.map((a) => (a.id === ann.id ? { ...a, active: !a.active } : a))
    );
  };

  const handleDelete = async (ann: Announcement) => {
    if (!confirm(`「${ann.title}」を削除しますか？`)) return;
    await deleteAnnouncement(ann.id);
    setAnnouncements((prev) => prev.filter((a) => a.id !== ann.id));
  };

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => router.push("/admin")} className="text-sm text-brand-600 mb-4 inline-block">
        &larr; ダッシュボード
      </button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">お知らせ管理</h1>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
          >
            新規作成
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
            autoFocus
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="本文（任意）"
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setCreating(false); setTitle(""); setBody(""); }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !title.trim()}
              className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:bg-gray-300"
            >
              {saving ? "保存中..." : "作成"}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {announcements.length === 0 && (
          <div className="text-center py-12 text-gray-400">お知らせはありません</div>
        )}
        {announcements.map((ann) => (
          <div
            key={ann.id}
            className={`bg-white rounded-xl border p-4 ${ann.active ? "border-brand-200" : "border-gray-200 opacity-60"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${ann.active ? "bg-green-500" : "bg-gray-300"}`} />
                  <h3 className="font-medium text-gray-800 text-sm">{ann.title}</h3>
                </div>
                {ann.body && <p className="text-sm text-gray-600 ml-4 whitespace-pre-wrap">{ann.body}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleToggle(ann)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    ann.active
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {ann.active ? "表示中" : "非表示"}
                </button>
                <button
                  onClick={() => handleDelete(ann)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
