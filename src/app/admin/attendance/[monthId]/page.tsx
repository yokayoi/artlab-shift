"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSchedule, getShift, getAllUsers, getMonthAttendances, adminEditAttendance } from "@/lib/firebase/firestore";
import { MonthSchedule, ShiftAssignment, UserProfile, Attendance } from "@/lib/types";
import { parseMonthId, getSlotKey, formatDateShort, timestampToDatetimeLocal, datetimeLocalToTimestamp, getSlotDate } from "@/lib/utils/dateCalc";
import { Timestamp } from "firebase/firestore";
import { DEMO_MONTH_ID } from "@/lib/utils/constants";

interface DayAttendance {
  dayKey: string;
  label: string;
  slotLabels: string[];
  checkIn: string;
  checkOut: string;
  editedBy?: string;
}

interface FacilitatorAttendance {
  uid: string;
  name: string;
  days: DayAttendance[];
}

export default function AdminAttendancePage({ params }: { params: Promise<{ monthId: string }> }) {
  const { monthId } = use(params);
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null);
  const [shift, setShift] = useState<ShiftAssignment | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [facilitators, setFacilitators] = useState<FacilitatorAttendance[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [savingDay, setSavingDay] = useState<string | null>(null);
  const [savedDay, setSavedDay] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      const [sched, shiftData, allUsers] = await Promise.all([
        getSchedule(monthId),
        getShift(monthId),
        getAllUsers(),
      ]);
      let attendances: Attendance[] = [];
      try {
        attendances = await getMonthAttendances(monthId);
      } catch {
        // attendance collection may not have rules deployed yet
      }
      setSchedule(sched);
      setShift(shiftData);
      setUsers(allUsers);

      if (sched && shiftData) {
        // Build slot info
        const slotInfo: Record<string, { dateLabel: string; dayLabel: string; time: string; classType: string }> = {};
        sched.days.forEach((day) => {
          day.slots.forEach((slot) => {
            const key = getSlotKey(day.date, slot.time);
            slotInfo[key] = {
              dateLabel: formatDateShort(day.date),
              dayLabel: day.dayLabel,
              time: slot.time,
              classType: slot.classType || "",
            };
          });
        });

        const attendanceMap = new Map<string, Attendance>();
        attendances.forEach((a) => attendanceMap.set(a.facilitatorId, a));

        const assignedUids = new Set<string>();
        for (const uids of Object.values(shiftData.assignments)) {
          uids.forEach((uid) => assignedUids.add(uid));
        }

        const facList: FacilitatorAttendance[] = [];
        for (const uid of assignedUids) {
          const userProfile = allUsers.find((u) => u.uid === uid);
          const att = attendanceMap.get(uid);

          // Group assigned slots by day
          const daySlots: Record<string, string[]> = {};
          Object.entries(shiftData.assignments)
            .filter(([, uids]) => uids.includes(uid))
            .forEach(([key]) => {
              const dayKey = getSlotDate(key);
              if (!daySlots[dayKey]) daySlots[dayKey] = [];
              daySlots[dayKey].push(key);
            });

          const days: DayAttendance[] = Object.entries(daySlots)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dayKey, slots]) => {
              const record = att?.records?.[dayKey];
              const firstSlot = slotInfo[slots[0]];
              return {
                dayKey,
                label: firstSlot ? `${firstSlot.dateLabel} ${firstSlot.dayLabel}` : dayKey,
                slotLabels: slots.sort().map((k) => {
                  const info = slotInfo[k];
                  return info ? `${info.time} ${info.classType}` : k;
                }),
                checkIn: record?.checkIn ? timestampToDatetimeLocal(record.checkIn) : "",
                checkOut: record?.checkOut ? timestampToDatetimeLocal(record.checkOut) : "",
                editedBy: record?.editedBy,
              };
            });

          facList.push({
            uid,
            name: userProfile?.nickname || userProfile?.displayName || uid,
            days,
          });
        }
        facList.sort((a, b) => a.name.localeCompare(b.name));
        setFacilitators(facList);
      }
      setDataLoading(false);
    })();
  }, [user, isAdmin, monthId]);

  const handleDayChange = (facUid: string, dayKey: string, field: "checkIn" | "checkOut", value: string) => {
    setFacilitators((prev) =>
      prev.map((f) =>
        f.uid === facUid
          ? { ...f, days: f.days.map((d) => (d.dayKey === dayKey ? { ...d, [field]: value } : d)) }
          : f
      )
    );
  };

  const handleSaveDay = async (facUid: string, dayKey: string) => {
    if (!user) return;
    const fac = facilitators.find((f) => f.uid === facUid);
    const day = fac?.days.find((d) => d.dayKey === dayKey);
    if (!day) return;

    const saveKey = `${facUid}_${dayKey}`;
    setSavingDay(saveKey);
    const checkInTs = day.checkIn ? datetimeLocalToTimestamp(day.checkIn) : null;
    const checkOutTs = day.checkOut ? datetimeLocalToTimestamp(day.checkOut) : null;
    await adminEditAttendance(monthId, facUid, dayKey, checkInTs, checkOutTs, user.uid);
    setSavingDay(null);
    setSavedDay(saveKey);
    setTimeout(() => setSavedDay(null), 2000);
  };

  const { year, month } = parseMonthId(monthId);
  const isDemo = monthId === DEMO_MONTH_ID;

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
        ← ダッシュボード
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-6">
        {isDemo ? "デモ" : `${year}年${month}月`} 出退勤管理
      </h1>

      {facilitators.length === 0 ? (
        <div className="text-center py-12 text-gray-400">シフトが割り当てられたファシリテーターがいません</div>
      ) : (
        <div className="space-y-4">
          {facilitators.map((fac) => (
            <div key={fac.uid} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <span className="font-medium text-gray-700">{fac.name}</span>
              </div>
              <div className="p-4 space-y-3">
                {fac.days.map((day) => {
                  const saveKey = `${fac.uid}_${day.dayKey}`;
                  return (
                    <div key={day.dayKey} className="border border-gray-100 rounded-lg p-3">
                      <div className="text-sm font-medium text-gray-700 mb-1">{day.label}</div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {day.slotLabels.map((sl, i) => (
                          <span key={i} className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-0.5 text-gray-600">
                            {sl}
                          </span>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">チェックイン</label>
                          <input
                            type="datetime-local"
                            value={day.checkIn}
                            onChange={(e) => handleDayChange(fac.uid, day.dayKey, "checkIn", e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">チェックアウト</label>
                          <input
                            type="datetime-local"
                            value={day.checkOut}
                            onChange={(e) => handleDayChange(fac.uid, day.dayKey, "checkOut", e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="text-xs text-gray-400">
                          {day.checkIn && day.checkOut
                            ? (() => {
                                const min = Math.round((new Date(day.checkOut).getTime() - new Date(day.checkIn).getTime()) / 60000);
                                const h = Math.floor(min / 60);
                                const m = min % 60;
                                return h > 0 ? `${h}時間${m}分` : `${m}分`;
                              })()
                            : ""}
                        </div>
                        <button
                          onClick={() => handleSaveDay(fac.uid, day.dayKey)}
                          disabled={savingDay === saveKey}
                          className="px-3 py-1 text-xs rounded-lg font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300"
                        >
                          {savingDay === saveKey ? "保存中..." : savedDay === saveKey ? "保存済" : "保存"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
