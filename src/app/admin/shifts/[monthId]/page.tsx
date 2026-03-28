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
} from "@/lib/firebase/firestore";
import { MonthSchedule, Availability, ShiftAssignment } from "@/lib/types";
import { getSlotKey, parseMonthId, formatDateShort } from "@/lib/utils/dateCalc";
import { CLASS_TYPE_COLORS } from "@/lib/utils/constants";

export default function AdminShiftsPage({ params }: { params: Promise<{ monthId: string }> }) {
  const { monthId } = use(params);
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
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
      const [sched, avails, existingShift] = await Promise.all([
        getSchedule(monthId),
        getMonthAvailabilities(monthId),
        getShift(monthId),
      ]);
      setSchedule(sched);
      setAvailabilities(avails);
      if (existingShift) {
        setAssignments(existingShift.assignments);
        setAssignmentNames(existingShift.assignmentNames);
      }
      setDataLoading(false);
    })();
  }, [user, isAdmin, monthId]);

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

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!schedule) return <div className="p-4">スケジュールが見つかりません</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => router.push("/admin")} className="text-sm text-blue-600 mb-4 inline-block">
        ← ダッシュボード
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-6">
        {year}年{month}月 シフト割り当て
      </h1>

      <div className="space-y-4">
        {schedule.days.map((day) => (
          <div key={day.date}>
            <h2 className="font-medium text-gray-700 mb-2">
              {formatDateShort(day.date)} {day.dayLabel}
            </h2>
            <div className="space-y-3">
              {day.slots
                .filter((slot) => slot.needsFacilitator)
                .map((slot) => {
                  const slotKey = getSlotKey(day.date, slot.time);
                  const available = availabilities.filter((a) => a.slots[slotKey]);
                  const assigned = assignments[slotKey] || [];
                  const colors = slot.classType ? CLASS_TYPE_COLORS[slot.classType] : null;

                  return (
                    <div key={slotKey} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="font-medium text-gray-700">{slot.time}</span>
                        {colors && slot.classType && (
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: colors.bg, color: colors.text }}
                          >
                            {slot.classType}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 ml-auto">
                          {assigned.length}名割当 / {available.length}名応募
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {available.length === 0 ? (
                          <span className="text-xs text-red-500">応募者なし</span>
                        ) : (
                          available.map((avail) => {
                            const isAssigned = assigned.includes(avail.facilitatorId);
                            return (
                              <button
                                key={avail.facilitatorId}
                                onClick={() =>
                                  toggleAssignment(slotKey, avail.facilitatorId, avail.facilitatorName)
                                }
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                                  isAssigned
                                    ? "bg-blue-500 border-blue-500 text-white"
                                    : "bg-white border-gray-300 text-gray-600 hover:border-blue-300"
                                }`}
                              >
                                {avail.facilitatorName}
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
        ))}
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
