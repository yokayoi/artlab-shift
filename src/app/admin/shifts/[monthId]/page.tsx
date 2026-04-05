"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getSchedule,
  getMonthAvailabilities,
  getShift,
  saveShift,
  updateScheduleStatus,
  getAllUsers,
} from "@/lib/firebase/firestore";
import { MonthSchedule, Availability, UserProfile } from "@/lib/types";
import { getSlotKey, parseMonthId, formatDateShort } from "@/lib/utils/dateCalc";
import { CLASS_TYPE_COLORS, DEMO_MONTH_ID } from "@/lib/utils/constants";

export default function AdminShiftsPage({ params }: { params: Promise<{ monthId: string }> }) {
  const { monthId } = use(params);
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserProfile>>({});
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [assignmentNames, setAssignmentNames] = useState<Record<string, string[]>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      const [sched, avails, existingShift, users] = await Promise.all([
        getSchedule(monthId),
        getMonthAvailabilities(monthId),
        getShift(monthId),
        getAllUsers(),
      ]);
      setSchedule(sched);
      setAvailabilities(avails);
      const map: Record<string, UserProfile> = {};
      users.forEach((u) => { map[u.uid] = u; });
      setUserMap(map);
      if (existingShift) {
        setAssignments(existingShift.assignments);
        setAssignmentNames(existingShift.assignmentNames);
      }
      setDataLoading(false);
    })();
  }, [user, isAdmin, monthId]);

  const getName = (uid: string, fallback: string) => {
    return userMap[uid]?.nickname || fallback;
  };

  const toggleAssignment = (slotKey: string, uid: string, name: string) => {
    setAssignments((prev) => {
      const current = prev[slotKey] || [];
      if (current.includes(uid)) {
        return { ...prev, [slotKey]: current.filter((id) => id !== uid) };
      }
      return { ...prev, [slotKey]: [...current, uid] };
    });
    setAssignmentNames((prev) => {
      const current = prev[slotKey] || [];
      if (current.includes(name)) {
        return { ...prev, [slotKey]: current.filter((n) => n !== name) };
      }
      return { ...prev, [slotKey]: [...current, name] };
    });
  };

  const handleAssignAll = () => {
    if (!schedule) return;
    const newAssignments: Record<string, string[]> = { ...assignments };
    const newNames: Record<string, string[]> = { ...assignmentNames };
    schedule.days.forEach((day) => {
      day.slots.forEach((slot) => {
        if (!slot.needsFacilitator || !slot.classType) return;
        const slotKey = getSlotKey(day.date, slot.time);
        const available = availabilities.filter((a) => a.slots[slotKey]);
        newAssignments[slotKey] = available.map((a) => a.facilitatorId);
        newNames[slotKey] = available.map((a) => getName(a.facilitatorId, a.facilitatorName));
      });
    });
    setAssignments(newAssignments);
    setAssignmentNames(newNames);
  };

  const handleClearAll = () => {
    setAssignments({});
    setAssignmentNames({});
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    await saveShift(monthId, assignments, assignmentNames, user.uid);
    await updateScheduleStatus(monthId, "shift_created");
    setSaving(false);
    router.push("/admin");
  };

  const handlePublish = async () => {
    if (!user) return;
    setSaving(true);
    await saveShift(monthId, assignments, assignmentNames, user.uid);
    await updateScheduleStatus(monthId, "published");
    setSaving(false);
    router.push("/admin");
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

  if (!schedule) return <div className="p-4">スケジュールが見つかりません</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => router.push("/admin")} className="text-sm text-brand-600 mb-4 inline-block">
        ← ダッシュボード
      </button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">
          {isDemo ? "デモ" : `${year}年${month}月`} シフト割り当て
        </h1>
        <div className="flex gap-2">
          <button
            onClick={handleAssignAll}
            className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700"
          >
            全て割り当て
          </button>
          <button
            onClick={handleClearAll}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            全て解除
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {schedule.days.map((day) => {
          const activeSlots = day.slots.filter((s) => s.needsFacilitator && s.classType);
          if (activeSlots.length === 0) return null;

          return (
            <div key={day.date} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <span className="font-medium text-gray-700">{formatDateShort(day.date)}</span>
                <span className="text-sm text-gray-500 ml-2">{day.dayLabel}</span>
              </div>
              <div className={`grid gap-0 divide-x divide-gray-100`} style={{ gridTemplateColumns: `repeat(${activeSlots.length}, minmax(0, 1fr))` }}>
                {activeSlots.map((slot) => {
                  const slotKey = getSlotKey(day.date, slot.time);
                  const available = availabilities.filter((a) => a.slots[slotKey]);
                  const assigned = assignments[slotKey] || [];
                  const colors = CLASS_TYPE_COLORS[slot.classType!];

                  return (
                    <div key={slotKey} className="p-3 text-center">
                      <div className="text-xs text-gray-500 mb-1">{slot.time}</div>
                      <div
                        className="text-[10px] px-1 py-0.5 rounded mb-2 inline-block"
                        style={{ backgroundColor: colors.bg, color: colors.text }}
                      >
                        {slot.classType}
                      </div>

                      {/* Assignee count */}
                      <div className={`text-xs mb-2 ${
                        assigned.length === 0 ? "text-red-500" : "text-green-600"
                      }`}>
                        {assigned.length}名割当
                      </div>

                      {/* Facilitator toggles */}
                      <div className="space-y-1">
                        {available.length === 0 ? (
                          <div className="text-[10px] text-gray-300">応募なし</div>
                        ) : (
                          available.map((avail) => {
                            const isAssigned = assigned.includes(avail.facilitatorId);
                            return (
                              <button
                                key={avail.facilitatorId}
                                onClick={() =>
                                  toggleAssignment(slotKey, avail.facilitatorId, avail.facilitatorName)
                                }
                                className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                  isAssigned
                                    ? "bg-brand-500 border-brand-500 text-white"
                                    : "bg-white border-gray-200 text-gray-500 hover:border-brand-300"
                                }`}
                              >
                                {getName(avail.facilitatorId, avail.facilitatorName)}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 space-y-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-xl font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:bg-gray-100 transition-colors"
        >
          {saving ? "保存中..." : "シフトを保存（下書き）"}
        </button>
        <button
          onClick={handlePublish}
          disabled={saving}
          className="w-full py-3 rounded-xl font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 transition-colors"
        >
          {saving ? "保存中..." : "シフトを公開する"}
        </button>
      </div>
    </div>
  );
}
