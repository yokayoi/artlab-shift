import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { sendLineIndividualMessage } from "@/lib/line/messaging";

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Calculate tomorrow's date in JST
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  const tomorrow = new Date(jstNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const monthId = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}`;

  const db = getAdminDb();

  // Check if schedule exists and is published
  const scheduleDoc = await db.collection("schedules").doc(monthId).get();
  if (!scheduleDoc.exists || scheduleDoc.data()?.status !== "published") {
    return NextResponse.json({ message: "No published schedule for this month" });
  }

  // Check if tomorrow is a class day
  const schedule = scheduleDoc.data()!;
  const days = schedule.days as Array<{
    date: string;
    slots: Array<{ time: string; needsFacilitator: boolean; classType: string | null }>;
  }>;
  const tomorrowDay = days.find((d) => d.date === tomorrowStr);
  if (!tomorrowDay) {
    return NextResponse.json({ message: "Tomorrow is not a class day" });
  }

  // Get shift assignments
  const shiftDoc = await db.collection("shifts").doc(monthId).get();
  if (!shiftDoc.exists) {
    return NextResponse.json({ message: "No shifts found" });
  }
  const shift = shiftDoc.data()!;
  const assignments = shift.assignments as Record<string, string[]>;

  // Collect assigned facilitators for tomorrow with their earliest slot time
  const facilitatorSlots: Record<string, string> = {};
  tomorrowDay.slots.forEach((slot) => {
    if (!slot.needsFacilitator || !slot.classType) return;
    const slotKey = `${tomorrowStr}_${slot.time}`;
    const assignedUids = assignments[slotKey] || [];
    assignedUids.forEach((uid) => {
      if (!facilitatorSlots[uid] || slot.time < facilitatorSlots[uid]) {
        facilitatorSlots[uid] = slot.time;
      }
    });
  });

  // Send individual reminders
  let sentCount = 0;
  for (const [uid, firstTime] of Object.entries(facilitatorSlots)) {
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData?.lineUserId) continue;

    const name = userData.nickname || userData.displayName || "ファシリテーター";
    const message = `明日は${name}さん${firstTime}からアートデザインラボです！よろしくお願いします。`;

    const success = await sendLineIndividualMessage(userData.lineUserId, message);
    if (success) sentCount++;
  }

  return NextResponse.json({ message: `Sent ${sentCount} reminders`, sent: sentCount });
}
