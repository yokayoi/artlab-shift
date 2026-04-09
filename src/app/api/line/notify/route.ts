import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, verifyAdminRequest } from "@/lib/firebase/admin";
import { sendLinePushMessage } from "@/lib/line/messaging";

export async function POST(req: NextRequest) {
  if (!(await verifyAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { monthId, type, message: customMessage, targetUids } = await req.json();

  if (!monthId) {
    return NextResponse.json({ error: "Missing monthId" }, { status: 400 });
  }

  const db = getAdminDb();

  if (type === "publish") {
    // Get shift assignments for this month
    const shiftDoc = await db.collection("shifts").doc(monthId).get();
    if (!shiftDoc.exists) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }
    const shift = shiftDoc.data()!;
    const assignedUids = new Set<string>();
    const assignments = shift.assignments as Record<string, string[]>;
    Object.values(assignments).forEach((uids) => {
      uids.forEach((uid) => assignedUids.add(uid));
    });

    // Get LINE user IDs for assigned facilitators
    const lineUserIds: string[] = [];
    for (const uid of assignedUids) {
      const userDoc = await db.collection("users").doc(uid).get();
      const lineUserId = userDoc.data()?.lineUserId;
      if (lineUserId) lineUserIds.push(lineUserId);
    }

    if (lineUserIds.length === 0) {
      return NextResponse.json({ message: "LINE連携済みのユーザーがいません", sent: 0, failed: 0 });
    }

    const [, monthStr] = monthId.split("-");
    const month = parseInt(monthStr, 10);
    const text = customMessage ||
      `お疲れ様です。\n${month}月のシフトが確定しました。\nアプリでシフト表をご確認ください。\n変更がある場合は早めにご連絡をお願いします。\nよろしくお願いいたします。`;

    const result = await sendLinePushMessage(lineUserIds, text);
    return NextResponse.json({
      message: `${result.sentTo.length}名に送信しました`,
      sent: result.sentTo.length,
      failed: result.failed.length,
    });
  }

  if (type === "custom" && customMessage) {
    const lineUserIds: string[] = [];

    if (targetUids && Array.isArray(targetUids) && targetUids.length > 0) {
      // Send to specific users
      for (const uid of targetUids) {
        const userDoc = await db.collection("users").doc(uid).get();
        const lineUserId = userDoc.data()?.lineUserId;
        if (lineUserId) lineUserIds.push(lineUserId);
      }
    } else {
      // Send to all LINE-linked users
      const usersSnap = await db.collection("users").where("lineUserId", "!=", null).get();
      usersSnap.docs.forEach((d) => lineUserIds.push(d.data().lineUserId as string));
    }

    if (lineUserIds.length === 0) {
      return NextResponse.json({ message: "LINE連携済みのユーザーがいません", sent: 0, failed: 0 });
    }

    const result = await sendLinePushMessage(lineUserIds, customMessage);
    return NextResponse.json({
      message: `${result.sentTo.length}名に送信しました`,
      sent: result.sentTo.length,
      failed: result.failed.length,
    });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
