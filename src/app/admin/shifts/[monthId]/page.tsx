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
import { CLASS_TYPE_COLORS, DEMO_MONTH_ID, getRequiredFacilitators } from "@/lib/utils/constants";

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
      const map: Record<string, UserProfile> = {};
      users.forEach((u) => { map[u.uid] = u; });
      setUserMap(map);
      // 管理者を除外
      const adminUids = new Set(users.filter((u) => u.role === "admin").map((u) => u.uid));
      setAvailabilities(avails.filter((a) => !adminUids.has(a.facilitatorId)));
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

  // Build slot keys & rowSpan (same as responses page)
  const slotKeys: { key: string; date: string; dateLabel: string; time: string; classType: string; childCount?: number }[] = [];
  schedule.days.forEach((day) => {
    day.slots.forEach((slot) => {
      if (slot.needsFacilitator && slot.classType) {
        slotKeys.push({
          key: getSlotKey(day.date, slot.time),
          date: day.date,
          dateLabel: formatDateShort(day.date),
          time: slot.time,
          classType: slot.classType,
          childCount: slot.childCount,
        });
      }
    });
  });
  const dateRowSpans: Record<string, number> = {};
  slotKeys.forEach((sk) => { dateRowSpans[sk.date] = (dateRowSpans[sk.date] || 0) + 1; });
  const dateFirstRow = new Set<string>();

  // Collect all facilitators who responded to at least one slot
  const facilitatorIds = availabilities.map((a) => a.facilitatorId);

  return (
    <div className="max-w-[1440px] mx-auto px-4 py-6">
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-3 py-2 font-medium text-gray-600 sticky left-0 bg-white w-[90px]">日付</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600 w-[60px]">時間</th>
              <th className="px-2 py-2 font-medium text-brand-700 text-center whitespace-nowrap bg-brand-50 w-[56px]">割当</th>
              <th className="px-2 py-2 font-medium text-gray-500 text-center whitespace-nowrap w-[52px] text-xs">過不足</th>
              {facilitatorIds.map((uid) => (
                <th key={uid} className="px-3 py-2 font-medium text-gray-500 text-center whitespace-nowrap text-xs">
                  {userMap[uid]?.nickname || userMap[uid]?.displayName || uid}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slotKeys.map((sk) => {
              const assigned = assignments[sk.key] || [];
              const required = getRequiredFacilitators(sk.childCount);
              const isFirst = !dateFirstRow.has(sk.date);
              if (isFirst) dateFirstRow.add(sk.date);
              return (
                <tr key={sk.key} className="border-b border-gray-100">
                  {isFirst && (
                    <td
                      rowSpan={dateRowSpans[sk.date]}
                      className="px-3 py-2 text-gray-700 sticky left-0 bg-white whitespace-nowrap text-xs font-medium align-middle border-r border-gray-100"
                    >
                      {sk.dateLabel}
                    </td>
                  )}
                  <td className="px-2 py-2 text-gray-500 whitespace-nowrap text-xs">{sk.time}</td>
                  <td className={`px-2 py-2 text-center font-bold bg-brand-50 ${
                    required > 0 && assigned.length < required ? "text-red-600" : assigned.length === 0 ? "text-gray-400" : "text-brand-700"
                  }`}>
                    {assigned.length}
                  </td>
                  <td className="px-2 py-2 text-center text-xs font-semibold whitespace-nowrap">
                    {required > 0 ? (
                      assigned.length < required ? (
                        <span className="text-red-600">-{required - assigned.length}</span>
                      ) : assigned.length > required ? (
                        <span className="text-green-600">+{assigned.length - required}</span>
                      ) : (
                        <span className="text-gray-400">±0</span>
                      )
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  {facilitatorIds.map((uid, fi) => {
                    const avail = availabilities[fi];
                    const hasAvailability = avail?.slots[sk.key];
                    const isAssigned = assigned.includes(uid);
                    return (
                      <td
                        key={uid}
                        className={`px-2 py-2 text-center transition-colors ${
                          hasAvailability ? "cursor-pointer hover:bg-gray-50" : ""
                        }`}
                        onClick={() => hasAvailability && toggleAssignment(sk.key, uid, getName(uid, avail?.facilitatorName || ""))}
                      >
                        {hasAvailability ? (
                          isAssigned ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-500 text-white text-xs font-bold">✓</span>
                          ) : (
                            <span className="text-gray-600 text-lg leading-none">○</span>
                          )
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 rounded-xl font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:bg-gray-100 transition-colors"
        >
          {saving ? "保存中..." : "シフトを保存（下書き）"}
        </button>
        <button
          onClick={handlePublish}
          disabled={saving}
          className="px-6 py-3 rounded-xl font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 transition-colors"
        >
          {saving ? "保存中..." : "シフトを公開する"}
        </button>
      </div>
    </div>
  );
}
