import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, verifyAdminRequest } from "@/lib/firebase/admin";
import {
  createCalendarEvent,
  deleteMultipleCalendarEvents,
} from "@/lib/google/calendar";
import { CLASS_DURATION_MINUTES } from "@/lib/utils/constants";

export async function POST(req: NextRequest) {
  if (!(await verifyAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { monthId } = await req.json();
  if (!monthId) {
    return NextResponse.json({ error: "Missing monthId" }, { status: 400 });
  }

  const db = getAdminDb();

  // 1. スケジュール取得（クラス種別情報）
  const scheduleDoc = await db.collection("schedules").doc(monthId).get();
  if (!scheduleDoc.exists) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }
  const schedule = scheduleDoc.data()!;
  const days = schedule.days as Array<{
    date: string;
    dayLabel: string;
    slots: Array<{
      time: string;
      classType: string | null;
      needsFacilitator: boolean;
    }>;
  }>;

  // slotKey → クラス情報マップ
  const slotInfoMap: Record<string, { classType: string; dayLabel: string }> =
    {};
  for (const day of days) {
    for (const slot of day.slots) {
      if (slot.classType && slot.needsFacilitator) {
        const slotKey = `${day.date}_${slot.time}`;
        slotInfoMap[slotKey] = {
          classType: slot.classType,
          dayLabel: day.dayLabel,
        };
      }
    }
  }

  // 2. シフト割り当て取得
  const shiftDoc = await db.collection("shifts").doc(monthId).get();
  if (!shiftDoc.exists) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }
  const shift = shiftDoc.data()!;
  const assignments = shift.assignments as Record<string, string[]>;

  // 3. 既存カレンダーイベント削除（再公開対応）
  const existingEventsDoc = await db
    .collection("calendarEvents")
    .doc(monthId)
    .get();
  if (existingEventsDoc.exists) {
    const existingData = existingEventsDoc.data()!;
    const oldEventIds = (existingData.eventIds || []) as string[];
    if (oldEventIds.length > 0) {
      await deleteMultipleCalendarEvents(oldEventIds);
    }
  }

  // 4. 担当者のメールアドレス取得
  const allUids = new Set<string>();
  Object.values(assignments).forEach((uids) =>
    uids.forEach((uid) => allUids.add(uid))
  );
  const emailMap: Record<string, string> = {};
  for (const uid of allUids) {
    const userDoc = await db.collection("users").doc(uid).get();
    const email = userDoc.data()?.email;
    if (email) emailMap[uid] = email;
  }

  // 5. スロットごとにカレンダーイベント作成
  const createdEventIds: string[] = [];
  let created = 0;
  let failed = 0;
  const slotNotes = (schedule.slotNotes || {}) as Record<string, string>;

  for (const [slotKey, uids] of Object.entries(assignments)) {
    const slotInfo = slotInfoMap[slotKey];
    if (!slotInfo) continue;
    if (uids.length === 0) continue;

    const [dateStr, timeStr] = slotKey.split("_");

    const startDateTime = `${dateStr}T${timeStr}:00+09:00`;
    const [startH, startM] = timeStr.split(":").map(Number);
    const endTotalMinutes = startH * 60 + startM + CLASS_DURATION_MINUTES;
    const endH = String(Math.floor(endTotalMinutes / 60)).padStart(2, "0");
    const endM = String(endTotalMinutes % 60).padStart(2, "0");
    const endDateTime = `${dateStr}T${endH}:${endM}:00+09:00`;

    const attendeeEmails = uids
      .map((uid) => emailMap[uid])
      .filter(Boolean);

    if (attendeeEmails.length === 0) continue;

    const note = slotNotes[slotKey] ? `\n備考: ${slotNotes[slotKey]}` : "";
    const summary = `アートデザインラボ ${slotInfo.classType}`;
    const description = `${slotInfo.dayLabel} ${timeStr}〜${endH}:${endM}\nクラス: ${slotInfo.classType}${note}`;

    const result = await createCalendarEvent({
      summary,
      description,
      startDateTime,
      endDateTime,
      attendeeEmails,
      location: "アートデザインラボ",
    });

    if (result.eventId) {
      createdEventIds.push(result.eventId);
      created++;
    } else {
      failed++;
      console.error(
        `Calendar event failed for slot ${slotKey}:`,
        result.error
      );
    }
  }

  // 6. イベントIDをFirestoreに保存（再公開時の削除用）
  await db.collection("calendarEvents").doc(monthId).set({
    monthId,
    eventIds: createdEventIds,
    createdAt: new Date(),
  });

  return NextResponse.json({
    message: `${created}件のカレンダーイベントを作成しました`,
    created,
    failed,
  });
}

export async function DELETE(req: NextRequest) {
  if (!(await verifyAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { monthId } = await req.json();
  if (!monthId) {
    return NextResponse.json({ error: "Missing monthId" }, { status: 400 });
  }

  const db = getAdminDb();
  const eventsDoc = await db.collection("calendarEvents").doc(monthId).get();
  if (!eventsDoc.exists) {
    return NextResponse.json({
      message: "No calendar events found",
      deleted: 0,
      failed: 0,
    });
  }

  const data = eventsDoc.data()!;
  const eventIds = (data.eventIds || []) as string[];
  const result = await deleteMultipleCalendarEvents(eventIds);

  await db.collection("calendarEvents").doc(monthId).delete();

  return NextResponse.json({
    message: `${result.deleted}件のカレンダーイベントを削除しました`,
    ...result,
  });
}
