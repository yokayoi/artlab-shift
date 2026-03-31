"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle } from "@/lib/firebase/auth";
import { useAuth } from "@/contexts/AuthContext";

function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Line\/|FBAN|FBAV|Instagram|Twitter|MicroMessenger/i.test(ua);
}

export default function LoginPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    setInApp(isInAppBrowser());
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.push(isAdmin ? "/admin" : "/schedule");
    }
  }, [user, isAdmin, loading, router]);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleOpenInBrowser = () => {
    const url = window.location.href.split("?")[0];
    // iOS Safari
    window.location.href = url;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-pink-100 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">アートデザインラボ</h1>
          <p className="text-gray-500 text-sm">シフト管理</p>
        </div>

        {inApp ? (
          <div className="text-left">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <p className="text-sm font-bold text-amber-800 mb-2">
                このブラウザではGoogleログインができません
              </p>
              <p className="text-sm text-amber-700 leading-relaxed">
                SafariまたはChromeで開いてください。
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 space-y-3">
              <p className="font-medium text-gray-800">開き方：</p>
              <div className="flex items-start gap-2">
                <span className="bg-brand-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                <p>右下の <span className="font-bold">⋮</span>（メニュー）または <span className="font-bold">共有ボタン</span> をタップ</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="bg-brand-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                <p>「<span className="font-bold">ブラウザで開く</span>」または「<span className="font-bold">Safariで開く</span>」を選択</p>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-700 font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Googleでログイン
          </button>
        )}
      </div>
    </div>
  );
}
