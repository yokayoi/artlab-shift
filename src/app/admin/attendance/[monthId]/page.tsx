"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSchedule, getShift, getAllUsers, getMonthAttendances, adminEditAttendance } from "@/lib/firebase/firestore";
import { MonthSchedule, ShiftAssignment, UserProfile, Attendance } from "@/lib/types";
import { parseMonthId, getSlotKey, formatDateShort, timestampToDatetimeLocal, datetimeLocalToTimestamp } from "@/lib/utils/dateCalc";
import { Timestamp } from "firebase/firestore";

interface SlotAttendance {
  slotKey: string;
  label: string;
  checkIn: string;
  checkOut: string;
  editedBy?: string;
}

interface FacilitatorAttendance {
  uid: string;
  name: string;
  slots: SlotAttendance[];
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
  const [savingSlot, setSavingSlot] = useState<string | null>(null);
  const [savedSlot, setSavedSlot] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      const [sched, shiftData, allUsers, attendances] = await Promise.all([
        getSchedule(monthId),
        getShift(monthId),
        getAllUsers(),
        getMonthAttendances(monthId),
      ]);
      setSchedule(sched);
      setShift(shiftData);
      setUsers(allUsers);

      if (sched && shiftData) {
        const slotLabels: Record<string, string> = {};
        sched.days.forEach((day) => {
          day.slots.forEach((slot) => {
            const key = getSlotKey(day.date, slot.time);
            slotLabels[key] = `${formatDateShort(day.date)} ${slot.time} ${slot.classType || ""}`;
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
          const assignedSlots = Object.entries(shiftData.assignments)
            .filter(([, uids]) => uids.includes(uid))
            .map(([key]) => key)
            .sort();

          facList.push({
            uid,
            name: userProfile?.nickname || userProfile?.displayName || uid,
            slots: assignedSlots.map((key) => {
              const record = att?.records?.[key];
              return {
                slotKey: key,
                label: slotLabels[key] || key,
                checkIn: record?.checkIn ? timestampToDatetimeLocal(record.checkIn) : "",
                checkOut: record?.checkOut ? timestampToDatetimeLocal(record.checkOut) : "",
                editedBy: record?.editedBy,
              };
            }),
          });
        }
        facList.sort((a, b) => a.name.localeCompare(b.name));
        setFacilitators(facList);
      }
      setDataLoading(false);
    })();
  }, [user, isAdmin, monthId]);

  const handleSlotChange = (facUid: string, slotKey: string, field: "checkIn" | "checkOut", value: string) => {
    setFacilitators((prev) =>
      prev.map((f) =>
        f.uid === facUid
          ? { ...f, slots: f.slots.map((s) => (s.slotKey === slotKey ? { ...s, [field]: value } : s)) }
          : f
      )
    );
  };

  const handleSaveSlot = async (facUid: string, slotKey: string) => {
    if (!user) return;
    const fac = facilitators.find((f) => f.uid === facUid);
    const slot = fac?.slots.find((s) => s.slotKey === slotKey);
    if (!slot) return;

    const saveKey = `${facUid}_${slotKey}`;
    setSavingSlot(saveKey);
    const checkInTs = slot.checkIn ? datetimeLocalToTimestamp(slot.checkIn) : null;
    const checkOutTs = slot.checkOut ? datetimeLocalToTimestamp(slot.checkOut) : null;
    await adminEditAttendance(monthId, facUid, slotKey, checkInTs, checkOutTs, user.uid);
    setSavingSlot(null);
    setSavedSlot(saveKey);
    setTimeout(() => setSavedSlot(null), 2000);
  };

  const { year, month } = parseMonthId(monthId);

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
        {year}年{month}月 出退勤管理
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
                {fac.slots.map((slot) => {
                  const saveKey = `${fac.uid}_${slot.slotKey}`;
                  return (
                    <div key={slot.slotKey} className="border border-gray-100 rounded-lg p-3">
                      <div className="text-sm font-medium text-gray-700 mb-2">{slot.label}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">チェックイン</label>
                          <input
                            type="datetime-local"
                            value={slot.checkIn}
                            onChange={(e) => handleSlotChange(fac.uid, slot.slotKey, "checkIn", e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">チェックアウト</label>
                          <input
                            type="datetime-local"
                            value={slot.checkOut}
                            onChange={(e) => handleSlotChange(fac.uid, slot.slotKey, "checkOut", e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="text-xs text-gray-400">
                          {slot.checkIn && slot.checkOut
                            ? `${Math.round((new Date(slot.checkOut).getTime() - new Date(slot.checkIn).getTime()) / 60000)}分`
                            : ""}
                        </div>
                        <button
                          onClick={() => handleSaveSlot(fac.uid, slot.slotKey)}
                          disabled={savingSlot === saveKey}
                          className="px-3 py-1 text-xs rounded-lg font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300"
                        >
                          {savingSlot === saveKey ? "保存中..." : savedSlot === saveKey ? "保存済" : "保存"}
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
