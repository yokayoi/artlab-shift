"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { updateUserProfile } from "@/lib/firebase/firestore";
import { uploadProfileImage } from "@/lib/firebase/storage";
import { getTier, getNextTier, isTraining, TRAINING_MAX } from "@/lib/utils/constants";

export default function ProfilePage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nickname, setNickname] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname || "");
      setPhotoURL(profile.photoURL || "");
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    await updateUserProfile(user.uid, { nickname, photoURL });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const url = await uploadProfileImage(user.uid, file);
    setPhotoURL(url);
    await updateUserProfile(user.uid, { photoURL: url });
    setUploading(false);
  };

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  const classCount = profile.classCount || 0;
  const tier = getTier(classCount);
  const nextTier = getNextTier(classCount);

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <button onClick={() => router.back()} className="text-sm text-brand-600 mb-4 inline-block">
        ← 戻る
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-6">プロフィール編集</h1>

      {/* Avatar */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-brand-100 flex items-center justify-center">
            {photoURL ? (
              <img src={photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-brand-700">
                {(profile.nickname || profile.displayName)?.[0] || "?"}
              </span>
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm hover:bg-brand-700 transition-colors"
          >
            {uploading ? "..." : "📷"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">タップして写真を変更</p>
      </div>

      {/* Nickname */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">ニックネーム</label>
        <p className="text-xs text-gray-500 mb-2">クラス開催時に使用するニックネームを入力してください</p>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="例: キムさん"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
      </div>

      {/* Display Name (read-only) */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Googleアカウント名</label>
        <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{profile.displayName}</div>
      </div>

      {/* Email (read-only) */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
        <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{profile.email}</div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-xl font-medium text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 disabled:bg-gray-300 transition-colors"
      >
        {saving ? "保存中..." : saved ? "保存しました" : "保存する"}
      </button>

      {/* Tier / Points */}
      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-medium text-gray-800 mb-3">参加実績</h2>
        <div className="flex items-center gap-3 mb-3">
          <div className="text-3xl font-bold text-brand-700">{classCount}</div>
          <div className="text-sm text-gray-500">クラス参加</div>
          {isTraining(classCount) && (
            <span className="px-3 py-1 rounded-full text-xs font-medium border bg-blue-100 text-blue-700 border-blue-300">
              📚 研修中（{classCount}/{TRAINING_MAX}）
            </span>
          )}
          {!isTraining(classCount) && tier && (
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${tier.color}`}>
              {tier.emoji} {tier.label}
            </span>
          )}
        </div>
        {isTraining(classCount) && (
          <div className="text-xs text-blue-600">
            研修期間あと <span className="font-bold">{TRAINING_MAX - classCount}回</span>で卒業！
          </div>
        )}
        {!isTraining(classCount) && nextTier && (
          <div className="text-xs text-gray-500">
            次のランク「{nextTier.label}」まであと <span className="font-bold text-brand-600">{nextTier.remaining}回</span>
          </div>
        )}
        {!nextTier && tier && (
          <div className="text-xs text-brand-600 font-medium">最高ランク達成！</div>
        )}
        {/* Progress bar */}
        <div className="mt-3 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all"
            style={{ width: `${Math.min((classCount / 300) * 100, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>0</span>
          <span>30</span>
          <span>80</span>
          <span>150</span>
          <span>300</span>
        </div>
      </div>
    </div>
  );
}
