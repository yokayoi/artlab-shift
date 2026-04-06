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
  const [simulation, setSimulation] = useState<Record<string, string[]> | null>(null);
  const [simulationNames, setSimulationNames] = useState<Record<string, string[]> | null>(null);

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

  // AI割り当てアルゴリズム: 満遍なく＆連続スロット優先
  const runAutoAssign = () => {
    if (!schedule) return;

    const newAssignments: Record<string, string[]> = {};
    const newNames: Record<string, string[]> = {};
    const assignCount: Record<string, number> = {};
    availabilities.forEach((a) => { assignCount[a.facilitatorId] = 0; });

    // 日別にスロット情報を収集（時間順を維持）
    type SlotInfo = { key: string; date: string; time: string; required: number; availableUids: string[] };
    const slotsByDate: Record<string, SlotInfo[]> = {};
    schedule.days.forEach((day) => {
      const daySlots: SlotInfo[] = [];
      day.slots.forEach((slot) => {
        if (!slot.needsFacilitator || !slot.classType) return;
        const slotKey = getSlotKey(day.date, slot.time);
        const required = getRequiredFacilitators(slot.childCount);
        const availableUids = availabilities
          .filter((a) => a.slots[slotKey])
          .map((a) => a.facilitatorId);
        daySlots.push({ key: slotKey, date: day.date, time: slot.time, required, availableUids });
      });
      if (daySlots.length > 0) slotsByDate[day.date] = daySlots;
    });

    // 日ごとに処理: 連続スロットを優先して割り当て
    for (const date of Object.keys(slotsByDate)) {
      const daySlots = slotsByDate[date];

      // まず埋めにくいスロット（応募者が少ない順）から処理
      const sortedSlots = [...daySlots].sort((a, b) => {
        const diff = a.availableUids.length - b.availableUids.length;
        if (diff !== 0) return diff;
        return Math.random() - 0.5;
      });

      // 同日で既に割り当てられたUID → 連続ボーナス
      const dayAssigned: Record<string, Set<string>> = {};

      for (const slot of sortedSlots) {
        if (slot.required <= 0 || slot.availableUids.length === 0) {
          newAssignments[slot.key] = [];
          newNames[slot.key] = [];
          continue;
        }

        // 隣接スロットに既に割り当てられているUIDを取得
        const slotIdx = daySlots.findIndex((s) => s.key === slot.key);
        const adjacentAssigned = new Set<string>();
        if (slotIdx > 0 && newAssignments[daySlots[slotIdx - 1].key]) {
          newAssignments[daySlots[slotIdx - 1].key].forEach((uid) => adjacentAssigned.add(uid));
        }
        if (slotIdx < daySlots.length - 1 && newAssignments[daySlots[slotIdx + 1].key]) {
          newAssignments[daySlots[slotIdx + 1].key].forEach((uid) => adjacentAssigned.add(uid));
        }

        // スコア: 割当回数が少ない＆隣接スロットに割当済みなら優先
        const sorted = [...slot.availableUids].sort((a, b) => {
          const adjA = adjacentAssigned.has(a) ? -3 : 0;
          const adjB = adjacentAssigned.has(b) ? -3 : 0;
          const countDiff = (assignCount[a] || 0) - (assignCount[b] || 0);
          const score = (adjA + countDiff) - (adjB + countDiff);
          // adjA - adjB + countA - countB
          const total = (adjA - adjB) + ((assignCount[a] || 0) - (assignCount[b] || 0));
          if (total !== 0) return total;
          return Math.random() - 0.5;
        });

        const picked = sorted.slice(0, slot.required);
        newAssignments[slot.key] = picked;
        newNames[slot.key] = picked.map((uid) => {
          const avail = availabilities.find((a) => a.facilitatorId === uid);
          return getName(uid, avail?.facilitatorName || "");
        });
        picked.forEach((uid) => { assignCount[uid] = (assignCount[uid] || 0) + 1; });
      }
    }

    setSimulation(newAssignments);
    setSimulationNames(newNames);
  };

  const applySimulation = async () => {
    if (!simulation || !simulationNames || !user) return;
    setSaving(true);
    setAssignments(simulation);
    setAssignmentNames(simulationNames);
    await saveShift(monthId, simulation, simulationNames, user.uid);
    await updateScheduleStatus(monthId, "shift_created");
    setSimulation(null);
    setSimulationNames(null);
    setSaving(false);
    router.push("/admin");
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

  // シミュレーション用: 各ファシリテーターの割当回数サマリー
  const simSummary = simulation ? (() => {
    const counts: Record<string, number> = {};
    facilitatorIds.forEach((uid) => { counts[uid] = 0; });
    Object.values(simulation).forEach((uids) => {
      uids.forEach((uid) => { counts[uid] = (counts[uid] || 0) + 1; });
    });
    return counts;
  })() : null;

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
            onClick={runAutoAssign}
            className="px-3 py-1.5 text-xs font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600"
          >
            AI設定
          </button>
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
              <th className="px-2 py-2 font-medium text-gray-500 text-center whitespace-nowrap w-[64px] text-xs">子ども</th>
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
                  <td className="px-1 py-2 text-center text-xs text-gray-700 font-semibold">
                    {sk.childCount || <span className="text-gray-300 font-normal">—</span>}
                    {required > 0 && (
                      <div className="text-[10px] text-gray-600 font-semibold">要{required}名</div>
                    )}
                  </td>
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
                            <span className="text-brand-600 text-lg leading-none">●</span>
                          ) : (
                            <span className="text-gray-700 text-lg leading-none">●</span>
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

      {/* シミュレーション結果 */}
      {simulation && simSummary && (() => {
        const simDateFirstRow = new Set<string>();
        return (
          <div className="mt-8 border-2 border-orange-300 rounded-xl bg-orange-50 p-4">
            <h2 className="text-lg font-bold text-orange-700 mb-4">シミュレーション結果</h2>

            {/* 割当回数サマリー */}
            <div className="flex flex-wrap gap-3 mb-4">
              {facilitatorIds.map((uid) => (
                <div key={uid} className="bg-white rounded-lg px-3 py-2 border border-orange-200 text-sm">
                  <span className="font-medium text-gray-700">
                    {userMap[uid]?.nickname || userMap[uid]?.displayName || uid}
                  </span>
                  <span className="ml-2 font-bold text-orange-600">{simSummary[uid] || 0}回</span>
                </div>
              ))}
            </div>

            {/* シミュレーションテーブル */}
            <div className="bg-white rounded-xl border border-orange-200 overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="border-b border-orange-200">
                    <th className="text-left px-3 py-2 font-medium text-gray-600 w-[90px]">日付</th>
                    <th className="text-left px-2 py-2 font-medium text-gray-600 w-[60px]">時間</th>
                    <th className="px-2 py-2 font-medium text-orange-700 text-center whitespace-nowrap bg-orange-50 w-[56px]">割当</th>
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
                    const simAssigned = simulation[sk.key] || [];
                    const required = getRequiredFacilitators(sk.childCount);
                    const isFirst = !simDateFirstRow.has(sk.date);
                    if (isFirst) simDateFirstRow.add(sk.date);
                    return (
                      <tr key={sk.key} className="border-b border-gray-100">
                        {isFirst && (
                          <td
                            rowSpan={dateRowSpans[sk.date]}
                            className="px-3 py-2 text-gray-700 whitespace-nowrap text-xs font-medium align-middle border-r border-gray-100"
                          >
                            {sk.dateLabel}
                          </td>
                        )}
                        <td className="px-2 py-2 text-gray-500 whitespace-nowrap text-xs">{sk.time}</td>
                        <td className={`px-2 py-2 text-center font-bold bg-orange-50 ${
                          required > 0 && simAssigned.length < required ? "text-red-600" : simAssigned.length === 0 ? "text-gray-400" : "text-orange-700"
                        }`}>
                          {simAssigned.length}
                        </td>
                        <td className="px-2 py-2 text-center text-xs font-semibold whitespace-nowrap">
                          {required > 0 ? (
                            simAssigned.length < required ? (
                              <span className="text-red-600">-{required - simAssigned.length}</span>
                            ) : simAssigned.length > required ? (
                              <span className="text-green-600">+{simAssigned.length - required}</span>
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
                          const isSimAssigned = simAssigned.includes(uid);
                          return (
                            <td key={uid} className="px-2 py-2 text-center">
                              {hasAvailability ? (
                                isSimAssigned ? (
                                  <span className="text-orange-500 text-lg leading-none">●</span>
                                ) : (
                                  <span className="text-gray-300 text-lg leading-none">●</span>
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

            {/* アクションボタン */}
            <div className="mt-4 flex gap-3">
              <button
                onClick={applySimulation}
                disabled={saving}
                className="px-6 py-3 rounded-xl font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 transition-colors"
              >
                {saving ? "保存中..." : "確定（下書き保存）"}
              </button>
              <button
                onClick={runAutoAssign}
                className="px-6 py-3 rounded-xl font-medium text-orange-600 bg-white border border-orange-300 hover:bg-orange-50 transition-colors"
              >
                再シミュレーション
              </button>
              <button
                onClick={() => { setSimulation(null); setSimulationNames(null); }}
                className="px-6 py-3 rounded-xl font-medium text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        );
      })()}

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
