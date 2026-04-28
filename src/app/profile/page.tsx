"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { updateUserProfile, updateUserBankAccount, saveFacilitatorIntro } from "@/lib/firebase/firestore";
import { uploadProfileImage } from "@/lib/firebase/storage";
import { getTier, getNextTier, isTraining, TRAINING_MAX, TRAINING_HOURLY_RATE, getEffectiveRate } from "@/lib/utils/constants";
import { BankAccount } from "@/lib/types";

export default function ProfilePage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nickname, setNickname] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bankName, setBankName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [accountType, setAccountType] = useState<"普通" | "当座">("普通");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [bankSaving, setBankSaving] = useState(false);
  const [bankSaved, setBankSaved] = useState(false);
  const [lineUnlinking, setLineUnlinking] = useState(false);
  const [lineMessage, setLineMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 掲示板用 紹介テキスト
  const [introEditing, setIntroEditing] = useState(false);
  const [introName, setIntroName] = useState("");
  const [introStrengths, setIntroStrengths] = useState("");
  const [introExperience, setIntroExperience] = useState("");
  const [introDream, setIntroDream] = useState("");
  const [introMessage, setIntroMessage] = useState("");
  const [introSavingDraft, setIntroSavingDraft] = useState(false);
  const [introConfirming, setIntroConfirming] = useState(false);
  const [introNotice, setIntroNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lineResult = params.get("line");
    if (lineResult === "success") {
      setLineMessage({ type: "success", text: "LINE連携が完了しました" });
      refreshProfile();
      window.history.replaceState({}, "", "/profile");
    } else if (lineResult === "error") {
      const detail = params.get("detail") || "";
      setLineMessage({ type: "error", text: `LINE連携に失敗しました。(${detail})` });
      window.history.replaceState({}, "", "/profile");
    }
  }, [refreshProfile]);

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname || "");
      setPhotoURL(profile.photoURL || "");
      if (profile.bankAccount) {
        setBankName(profile.bankAccount.bankName);
        setBranchName(profile.bankAccount.branchName);
        setAccountType(profile.bankAccount.accountType);
        setAccountNumber(profile.bankAccount.accountNumber);
        setAccountHolder(profile.bankAccount.accountHolder);
      }
      const intro = profile.facilitatorIntro;
      setIntroName(intro?.name ?? profile.nickname ?? profile.displayName ?? "");
      setIntroStrengths(intro?.strengths ?? "");
      setIntroExperience(intro?.experience ?? "");
      setIntroDream(intro?.dream ?? "");
      setIntroMessage(intro?.message ?? "");
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

  const handleSaveBank = async () => {
    if (!user) return;
    setBankSaving(true);
    await updateUserBankAccount(user.uid, { bankName, branchName, accountType, accountNumber, accountHolder });
    setBankSaving(false);
    setBankSaved(true);
    setTimeout(() => setBankSaved(false), 2000);
  };

  const handleUnlinkLine = async () => {
    if (!user || !confirm("LINE連携を解除しますか？通知が届かなくなります。")) return;
    setLineUnlinking(true);
    try {
      const { getAuth } = await import("firebase/auth");
      const idToken = await getAuth().currentUser?.getIdToken();
      await fetch("/api/auth/line/unlink", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });
      setLineMessage({ type: "success", text: "LINE連携を解除しました" });
      await refreshProfile();
    } catch {
      setLineMessage({ type: "error", text: "解除に失敗しました" });
    }
    setLineUnlinking(false);
  };

  const introInput = () => ({
    name: introName.trim(),
    strengths: introStrengths.trim(),
    experience: introExperience.trim(),
    dream: introDream.trim(),
    message: introMessage.trim(),
  });

  const validateIntro = () => {
    const v = introInput();
    if (!v.name) return "お名前を入力してください";
    if (!v.strengths) return "得意・好きなことを入力してください";
    if (!v.experience) return "こんな経験を入力してください";
    if (!v.dream) return "ゆめを入力してください";
    if (!v.message) return "みんなにメッセージを入力してください";
    return null;
  };

  const handleSaveIntroDraft = async () => {
    if (!user) return;
    const err = validateIntro();
    if (err) {
      setIntroNotice({ type: "error", text: err });
      return;
    }
    setIntroSavingDraft(true);
    try {
      await saveFacilitatorIntro(user.uid, introInput(), "draft");
      await refreshProfile();
      setIntroEditing(false);
      setIntroNotice({ type: "success", text: "下書きを保存しました" });
    } catch {
      setIntroNotice({ type: "error", text: "保存に失敗しました" });
    }
    setIntroSavingDraft(false);
    setTimeout(() => setIntroNotice(null), 3000);
  };

  const handleConfirmIntro = async () => {
    if (!user) return;
    const err = validateIntro();
    if (err) {
      setIntroNotice({ type: "error", text: err });
      return;
    }
    if (!confirm("内容を確定して管理者に通知しますか？")) return;
    setIntroConfirming(true);
    try {
      await saveFacilitatorIntro(user.uid, introInput(), "confirmed");
      await refreshProfile();
      setIntroEditing(false);

      const { getAuth } = await import("firebase/auth");
      const idToken = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/facilitator-intro/notify", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        setIntroNotice({ type: "success", text: "確定して管理者に通知しました" });
      } else {
        setIntroNotice({ type: "success", text: "確定しました（管理者通知の送信に失敗）" });
      }
    } catch {
      setIntroNotice({ type: "error", text: "確定に失敗しました" });
    }
    setIntroConfirming(false);
    setTimeout(() => setIntroNotice(null), 4000);
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

  const steps: { key: string; label: string; done: boolean }[] = [
    { key: "nickname", label: "ニックネーム", done: !!profile.nickname?.trim() },
    { key: "photo", label: "プロフィール写真", done: !!profile.photoURL },
    { key: "intro", label: "紹介テキスト確定", done: profile.facilitatorIntro?.status === "confirmed" },
    { key: "line", label: "LINE連携", done: !!profile.lineUserId },
    { key: "bank", label: "口座情報", done: !!profile.bankAccount?.bankName && !!profile.bankAccount?.accountNumber },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const totalCount = steps.length;
  const remaining = totalCount - doneCount;
  const progressPercent = (doneCount / totalCount) * 100;
  const allDone = doneCount === totalCount;

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <button onClick={() => router.back()} className="text-sm text-brand-600 mb-4 inline-block">
        ← 戻る
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-4">プロフィール編集</h1>

      {/* 登録ステップ */}
      <div className={`mb-6 rounded-xl border p-4 ${allDone ? "bg-green-50 border-green-200" : "bg-brand-50 border-brand-200"}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-gray-800">
            {allDone ? "🎉 すべての登録が完了しました！" : `あと ${remaining} 項目で登録完了`}
          </div>
          <div className="text-xs text-gray-600">{doneCount}/{totalCount}</div>
        </div>
        <div className="w-full h-1.5 bg-white/70 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all ${allDone ? "bg-green-500" : "bg-brand-500"}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <ul className="space-y-1">
          {steps.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                  s.done ? "bg-green-500 text-white" : "bg-white border border-gray-300 text-gray-400"
                }`}
              >
                {s.done ? "✓" : ""}
              </span>
              <span className={s.done ? "text-gray-500 line-through" : "text-gray-800"}>{s.label}</span>
            </li>
          ))}
        </ul>
      </div>

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

      {/* ファシリテーター紹介用テキスト */}
      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-medium text-gray-800">ファシリテーター紹介用テキスト</h2>
          {profile.facilitatorIntro?.status === "confirmed" && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 border border-green-300">
              確定済み
            </span>
          )}
          {profile.facilitatorIntro?.status === "draft" && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-700 border border-yellow-300">
              下書き
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-4">掲示板で今日のファシリを案内する用の紹介テキストです。</p>

        {!introEditing && profile.facilitatorIntro ? (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500">お名前</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{profile.facilitatorIntro.name}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">得意、好きなこと</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{profile.facilitatorIntro.strengths}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">こんな経験あります！</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{profile.facilitatorIntro.experience}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">ゆめ</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{profile.facilitatorIntro.dream}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">みんなにメッセージ！</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{profile.facilitatorIntro.message}</div>
            </div>
            <button
              onClick={() => setIntroEditing(true)}
              className="w-full mt-2 py-2 rounded-lg text-sm font-medium text-brand-700 bg-white border border-brand-300 hover:bg-brand-50 transition-colors"
            >
              編集する
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {!profile.facilitatorIntro && !introEditing && (
              <button
                onClick={() => setIntroEditing(true)}
                className="w-full py-3 rounded-xl font-medium text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 transition-colors"
              >
                紹介テキストを入力する
              </button>
            )}
            {introEditing && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">お名前 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={introName}
                    onChange={(e) => setIntroName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">得意、好きなこと <span className="text-red-500">*</span></label>
                  <p className="text-[11px] text-gray-400 mb-1">例：工作、文章を書くこと、ピアノ、ヨガ</p>
                  <textarea
                    value={introStrengths}
                    onChange={(e) => setIntroStrengths(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">こんな経験あります！ <span className="text-red-500">*</span></label>
                  <p className="text-[11px] text-gray-400 mb-1">例：デザイナー、映像ディレクター、臨床美術士</p>
                  <textarea
                    value={introExperience}
                    onChange={(e) => setIntroExperience(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ゆめ <span className="text-red-500">*</span></label>
                  <p className="text-[11px] text-gray-400 mb-1">例：いつかアートデザインラボのひろーい場所を作って（お庭、カフェ付き）みんなで遊びたい。</p>
                  <textarea
                    value={introDream}
                    onChange={(e) => setIntroDream(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">みんなにメッセージ！ <span className="text-red-500">*</span></label>
                  <p className="text-[11px] text-gray-400 mb-1">例：苦手なことがあっても大丈夫。「好き」をとことん突き詰めましょう。</p>
                  <textarea
                    value={introMessage}
                    onChange={(e) => setIntroMessage(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSaveIntroDraft}
                    disabled={introSavingDraft || introConfirming}
                    className="flex-1 py-3 rounded-xl text-sm font-medium text-brand-700 bg-white border border-brand-300 hover:bg-brand-50 disabled:bg-gray-100 transition-colors"
                  >
                    {introSavingDraft ? "保存中..." : "下書き保存"}
                  </button>
                  <button
                    onClick={handleConfirmIntro}
                    disabled={introSavingDraft || introConfirming}
                    className="flex-1 py-3 rounded-xl text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 disabled:bg-gray-300 transition-colors"
                  >
                    {introConfirming ? "送信中..." : "確定して管理者に通知"}
                  </button>
                </div>
                {profile.facilitatorIntro && (
                  <button
                    onClick={() => setIntroEditing(false)}
                    className="w-full text-xs text-gray-500 underline mt-1"
                  >
                    キャンセル
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {introNotice && (
          <p className={`mt-3 text-xs ${introNotice.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {introNotice.text}
          </p>
        )}
      </div>

      {/* LINE連携 */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-medium text-gray-800 mb-3">LINE連携</h2>
        <p className="text-xs text-gray-500 mb-4">
          LINEアカウントを連携すると、シフト確定通知やリマインダーをLINEで受け取れます。
        </p>
        {profile.lineUserId ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-gray-700">連携済み: {profile.lineDisplayName}</span>
            </div>
            <button
              onClick={handleUnlinkLine}
              disabled={lineUnlinking}
              className="w-full py-2 rounded-lg text-sm font-medium text-red-600 bg-white border border-red-300 hover:bg-red-50 disabled:bg-gray-100 transition-colors"
            >
              {lineUnlinking ? "解除中..." : "LINE連携を解除"}
            </button>
          </div>
        ) : (
          <a
            href={`/api/auth/line?uid=${user?.uid}`}
            className="block w-full py-3 rounded-xl font-medium text-white bg-[#06C755] hover:bg-[#05b34c] text-center transition-colors"
          >
            LINEアカウントを連携する
          </a>
        )}
        {lineMessage && (
          <p className={`mt-2 text-xs ${lineMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {lineMessage.text}
          </p>
        )}
      </div>

      {/* Tier / Points */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
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
        <div className="mt-3 relative">
          <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all"
              style={{ width: `${Math.min((classCount / 300) * 100, 100)}%` }}
            />
          </div>
          <div className="relative h-4 mt-1 text-[10px] text-gray-400">
            <span className="absolute left-0">0</span>
            <span className="absolute" style={{ left: "10%" }}>30</span>
            <span className="absolute" style={{ left: "26.7%" }}>80</span>
            <span className="absolute" style={{ left: "50%" }}>150</span>
            <span className="absolute right-0">300</span>
          </div>
        </div>
      </div>

      {/* 報酬情報 */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-medium text-gray-800 mb-3">報酬情報</h2>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">時給</span>
          <span className="text-sm font-medium text-gray-800">
            {isTraining(classCount)
              ? `¥${TRAINING_HOURLY_RATE.toLocaleString()}（研修時給）`
              : profile.hourlyRate
                ? `¥${profile.hourlyRate.toLocaleString()}`
                : "未設定"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">交通費</span>
          <span className="text-sm font-medium text-gray-800">
            {profile.transportCost
              ? `¥${profile.transportCost.toLocaleString()}/月`
              : "なし"}
          </span>
        </div>
      </div>

      {/* 口座情報 */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-medium text-gray-800 mb-3">口座情報</h2>
        <p className="text-xs text-gray-500 mb-4">給与振込先の口座情報を登録してください</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">銀行名</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="例: 三菱UFJ銀行"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">支店名</label>
            <input
              type="text"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="例: 渋谷支店"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">口座種別</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm text-gray-700">
                <input
                  type="radio"
                  name="accountType"
                  checked={accountType === "普通"}
                  onChange={() => setAccountType("普通")}
                  className="accent-brand-600"
                />
                普通
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700">
                <input
                  type="radio"
                  name="accountType"
                  checked={accountType === "当座"}
                  onChange={() => setAccountType("当座")}
                  className="accent-brand-600"
                />
                当座
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">口座番号</label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="例: 1234567"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">口座名義人（カタカナ）</label>
            <input
              type="text"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder="例: ヤマダ タロウ"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
        </div>
        <button
          onClick={handleSaveBank}
          disabled={bankSaving}
          className="w-full mt-4 py-3 rounded-xl font-medium text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 disabled:bg-gray-300 transition-colors"
        >
          {bankSaving ? "保存中..." : bankSaved ? "保存しました" : "口座情報を保存"}
        </button>
      </div>

    </div>
  );
}
