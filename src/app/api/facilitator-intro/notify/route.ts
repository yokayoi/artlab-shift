import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { getApps } from "firebase-admin/app";
import { sendLinePushMessage } from "@/lib/line/messaging";

export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();

  let uid: string;
  try {
    const app = getApps()[0];
    const decoded = await getAuth(app).verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const userDoc = await db.collection("users").doc(uid).get();
  const user = userDoc.data();
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const intro = user.facilitatorIntro;
  if (!intro || intro.status !== "confirmed") {
    return NextResponse.json({ error: "Intro not confirmed" }, { status: 400 });
  }

  const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
  const adminLineUserIds: string[] = [];
  adminsSnap.docs.forEach((d) => {
    const lineUserId = d.data().lineUserId as string | undefined;
    if (lineUserId) adminLineUserIds.push(lineUserId);
  });

  const senderName = intro.name || user.nickname || user.displayName || "ファシリテーター";
  const text =
    `【紹介テキスト確定】\n` +
    `${senderName}さんが掲示板用の紹介テキストを確定しました。\n\n` +
    `■ 得意・好きなこと\n${intro.strengths}\n\n` +
    `■ こんな経験あります！\n${intro.experience}\n\n` +
    `■ ゆめ\n${intro.dream}\n\n` +
    `■ みんなにメッセージ！\n${intro.message}`;

  if (adminLineUserIds.length === 0) {
    return NextResponse.json({ message: "管理者にLINE連携済みユーザーがいません", sent: 0 });
  }

  const result = await sendLinePushMessage(adminLineUserIds, text);
  return NextResponse.json({
    message: `${result.sentTo.length}名の管理者に通知しました`,
    sent: result.sentTo.length,
    failed: result.failed.length,
  });
}
