"use client";

import { useEffect, useState, useRef, use } from "react";
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
import { CLASS_TYPE_COLORS, CLASS_DURATION_MINUTES, DEMO_MONTH_ID, getRequiredFacilitators, getEffectiveRate } from "@/lib/utils/constants";
import html2canvas from "html2canvas";

const SLOT_EFFECTIVE_MINUTES = CLASS_DURATION_MINUTES + 30; // 70分 + 前後15分

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
  const [simulationApplied, setSimulationApplied] = useState(false);
  const [completed, setCompleted] = useState<"saved" | "published" | null>(null);
  const [copied, setCopied] = useState(false);
  const [shiftImageUrl, setShiftImageUrl] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const shiftTableRef = useRef<HTMLDivElement>(null);

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

  const getDisplayName = (uid: string) => {
    return userMap[uid]?.nickname || userMap[uid]?.displayName || uid;
  };

  const toggleAssignment = (slotKey: string, uid: string) => {
    const name = getDisplayName(uid);
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
        newNames[slotKey] = available.map((a) => getDisplayName(a.facilitatorId));
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

    for (const date of Object.keys(slotsByDate)) {
      const daySlots = slotsByDate[date];
      const sortedSlots = [...daySlots].sort((a, b) => {
        const diff = a.availableUids.length - b.availableUids.length;
        if (diff !== 0) return diff;
        return Math.random() - 0.5;
      });

      for (const slot of sortedSlots) {
        if (slot.required <= 0 || slot.availableUids.length === 0) {
          newAssignments[slot.key] = [];
          newNames[slot.key] = [];
          continue;
        }

        const slotIdx = daySlots.findIndex((s) => s.key === slot.key);
        const adjacentAssigned = new Set<string>();
        if (slotIdx > 0 && newAssignments[daySlots[slotIdx - 1].key]) {
          newAssignments[daySlots[slotIdx - 1].key].forEach((uid) => adjacentAssigned.add(uid));
        }
        if (slotIdx < daySlots.length - 1 && newAssignments[daySlots[slotIdx + 1].key]) {
          newAssignments[daySlots[slotIdx + 1].key].forEach((uid) => adjacentAssigned.add(uid));
        }

        const sorted = [...slot.availableUids].sort((a, b) => {
          const adjA = adjacentAssigned.has(a) ? -3 : 0;
          const adjB = adjacentAssigned.has(b) ? -3 : 0;
          const total = (adjA - adjB) + ((assignCount[a] || 0) - (assignCount[b] || 0));
          if (total !== 0) return total;
          return Math.random() - 0.5;
        });

        const picked = sorted.slice(0, slot.required);
        newAssignments[slot.key] = picked;
        newNames[slot.key] = picked.map((uid) => getDisplayName(uid));
        picked.forEach((uid) => { assignCount[uid] = (assignCount[uid] || 0) + 1; });
      }
    }

    setSimulation(newAssignments);
    setSimulationNames(newNames);
  };

  const applySimulation = () => {
    if (!simulation || !simulationNames) return;
    setAssignments(simulation);
    setAssignmentNames(simulationNames);
    setSimulation(null);
    setSimulationNames(null);
    setSimulationApplied(true);
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
    setCompleted("published");
  };

  const generateImage = async () => {
    if (!shiftTableRef.current) return;
    setGeneratingImage(true);
    try {
      const canvas = await html2canvas(shiftTableRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      setShiftImageUrl(canvas.toDataURL("image/png"));
    } catch (e) {
      console.error("画像生成に失敗:", e);
    }
    setGeneratingImage(false);
  };

  useEffect(() => {
    if (completed === "published") {
      const timer = setTimeout(() => generateImage(), 200);
      return () => clearTimeout(timer);
    }
  }, [completed]);

  const downloadImage = () => {
    if (!shiftImageUrl) return;
    const link = document.createElement("a");
    link.download = `シフト表_${month}月.png`;
    link.href = shiftImageUrl;
    link.click();
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

  // Build slot keys & rowSpan
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
  const dateSlotCounts: Record<string, number> = {};
  slotKeys.forEach((sk) => { dateSlotCounts[sk.date] = (dateSlotCounts[sk.date] || 0) + 1; });
  const dateRowSpans: Record<string, number> = {};
  Object.entries(dateSlotCounts).forEach(([date, count]) => { dateRowSpans[date] = count * 2; });
  const dateFirstRow = new Set<string>();

  const facilitatorIds = availabilities.map((a) => a.facilitatorId);

  // 給与計算
  const calcSlotPay = (uid: string) => {
    const profile = userMap[uid];
    const rate = getEffectiveRate(profile?.classCount || 0, profile?.hourlyRate || 0);
    return Math.round(rate * (SLOT_EFFECTIVE_MINUTES / 60));
  };

  // 現在の割当に基づく給与サマリー
  const payrollSummary = (() => {
    const counts: Record<string, number> = {};
    facilitatorIds.forEach((uid) => { counts[uid] = 0; });
    Object.values(assignments).forEach((uids) => {
      uids.forEach((uid) => { counts[uid] = (counts[uid] || 0) + 1; });
    });
    return counts;
  })();
  const totalAssigned = Object.values(payrollSummary).reduce((sum, c) => sum + c, 0);
  const totalPay = facilitatorIds.reduce((sum, uid) => sum + (payrollSummary[uid] || 0) * calcSlotPay(uid), 0);

  // シミュレーション割当サマリー
  const simSummary = simulation ? (() => {
    const counts: Record<string, number> = {};
    facilitatorIds.forEach((uid) => { counts[uid] = 0; });
    Object.values(simulation).forEach((uids) => {
      uids.forEach((uid) => { counts[uid] = (counts[uid] || 0) + 1; });
    });
    return counts;
  })() : null;

  // 不足スロット情報
  const shortageSlots = slotKeys.filter((sk) => {
    const assigned = assignments[sk.key] || [];
    const required = getRequiredFacilitators(sk.childCount);
    return required > 0 && assigned.length < required;
  }).map((sk) => {
    const assigned = assignments[sk.key] || [];
    const required = getRequiredFacilitators(sk.childCount);
    return { ...sk, shortage: required - assigned.length };
  });

  // 案内文を動的に生成
  const buildAnnouncementText = () => {
    let text = `お疲れ様です。\n${month}月のシフトが確定しました。\n添付のシフト表をご確認ください。\n変更がある場合は早めにご連絡をお願いします。\nよろしくお願いいたします。`;
    if (shortageSlots.length > 0) {
      text += "\n\n【人数不足のコマ】\n";
      text += shortageSlots.map((s) =>
        `${s.dateLabel} ${s.time} ${s.classType}（あと${s.shortage}名）`
      ).join("\n");
      text += "\n入れる方いらっしゃいましたらぜひ！ご連絡ください。";
    }
    return text;
  };

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
                  {getDisplayName(uid)}
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
              return [
                <tr key={sk.key} className="border-b border-gray-50">
                  {isFirst && (
                    <td
                      rowSpan={dateRowSpans[sk.date]}
                      className="px-3 py-2 text-gray-700 sticky left-0 bg-white whitespace-nowrap text-xs font-medium align-middle border-r border-gray-100"
                    >
                      {sk.dateLabel}
                    </td>
                  )}
                  <td className="px-2 py-2 text-gray-500 whitespace-nowrap text-xs">{sk.time}</td>
                  <td className="px-1 py-2 text-center text-xs text-green-700 font-semibold">
                    {sk.childCount || <span className="text-gray-300 font-normal">—</span>}
                    {required > 0 && (
                      <div className="text-[10px] text-green-600 font-semibold">要{required}名</div>
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
                        onClick={() => hasAvailability && toggleAssignment(sk.key, uid)}
                      >
                        {hasAvailability ? (
                          isAssigned ? (
                            <span className="text-brand-600 text-lg leading-none">●</span>
                          ) : (
                            <span className="text-gray-200 text-lg leading-none">●</span>
                          )
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>,
                <tr key={`${sk.key}-note`} className="border-b border-gray-100">
                  <td colSpan={4 + facilitatorIds.length} className="px-2 py-1">
                    {schedule.slotNotes?.[sk.key] ? (
                      <span className="text-xs text-orange-500 font-medium">{schedule.slotNotes[sk.key]}</span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>

      {/* 手動調整メッセージ */}
      {simulationApplied && !simulation && (
        <div className="mt-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-700">シミュレーション結果を適用しました。上の表でファシリテーターをクリックして手動で調整できます。</p>
        </div>
      )}

      {/* 給与見積サマリー */}
      {totalAssigned > 0 && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">給与見積（{SLOT_EFFECTIVE_MINUTES}分/コマ）</h3>
          <div className="flex flex-wrap gap-3 mb-3">
            {facilitatorIds.map((uid) => {
              const count = payrollSummary[uid] || 0;
              if (count === 0) return null;
              const slotPay = calcSlotPay(uid);
              const rate = getEffectiveRate(userMap[uid]?.classCount || 0, userMap[uid]?.hourlyRate || 0);
              return (
                <div key={uid} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 text-sm">
                  <span className="font-medium text-gray-700">{getDisplayName(uid)}</span>
                  <span className="ml-1 text-[10px] text-gray-400">¥{rate.toLocaleString()}/h</span>
                  <span className="ml-2 text-gray-500">{count}コマ</span>
                  <span className="ml-2 font-bold text-brand-700">¥{(count * slotPay).toLocaleString()}</span>
                </div>
              );
            })}
          </div>
          <div className="text-right text-sm font-bold text-gray-700">
            合計: <span className="text-lg text-brand-700">¥{totalPay.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* シミュレーション結果 */}
      {simulation && simSummary && (() => {
        const simDateFirstRow = new Set<string>();
        const simTotalPay = facilitatorIds.reduce((sum, uid) => sum + (simSummary[uid] || 0) * calcSlotPay(uid), 0);
        return (
          <div className="mt-8 border-2 border-orange-300 rounded-xl bg-orange-50 p-4">
            <h2 className="text-lg font-bold text-orange-700 mb-4">シミュレーション結果</h2>

            <div className="flex flex-wrap gap-3 mb-3">
              {facilitatorIds.map((uid) => {
                const count = simSummary[uid] || 0;
                const slotPay = calcSlotPay(uid);
                return (
                  <div key={uid} className="bg-white rounded-lg px-3 py-2 border border-orange-200 text-sm">
                    <span className="font-medium text-gray-700">{getDisplayName(uid)}</span>
                    <span className="ml-2 font-bold text-orange-600">{count}回</span>
                    <span className="ml-1 text-gray-500">¥{(count * slotPay).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
            <div className="mb-4 text-right text-sm font-bold text-gray-600">
              合計: ¥{simTotalPay.toLocaleString()}
            </div>

            <div className="bg-white rounded-xl border border-orange-200 overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="border-b border-orange-200">
                    <th className="text-left px-3 py-2 font-medium text-gray-600 w-[90px]">日付</th>
                    <th className="text-left px-2 py-2 font-medium text-gray-600 w-[60px]">時間</th>
                    <th className="px-2 py-2 font-medium text-gray-500 text-center whitespace-nowrap w-[64px] text-xs">子ども</th>
                    <th className="px-2 py-2 font-medium text-orange-700 text-center whitespace-nowrap bg-orange-50 w-[56px]">割当</th>
                    <th className="px-2 py-2 font-medium text-gray-500 text-center whitespace-nowrap w-[52px] text-xs">過不足</th>
                    {facilitatorIds.map((uid) => (
                      <th key={uid} className="px-3 py-2 font-medium text-gray-500 text-center whitespace-nowrap text-xs">
                        {getDisplayName(uid)}
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
                            rowSpan={dateSlotCounts[sk.date]}
                            className="px-3 py-2 text-gray-700 whitespace-nowrap text-xs font-medium align-middle border-r border-gray-100"
                          >
                            {sk.dateLabel}
                          </td>
                        )}
                        <td className="px-2 py-2 text-gray-500 whitespace-nowrap text-xs">{sk.time}</td>
                        <td className="px-1 py-2 text-center text-xs text-green-700 font-semibold">
                          {sk.childCount || <span className="text-gray-300 font-normal">—</span>}
                          {required > 0 && (
                            <div className="text-[10px] text-green-600 font-semibold">要{required}名</div>
                          )}
                        </td>
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
                            <td
                              key={uid}
                              className={`px-2 py-2 text-center transition-colors ${
                                hasAvailability ? "cursor-pointer hover:bg-orange-100" : ""
                              }`}
                              onClick={() => {
                                if (!hasAvailability) return;
                                setSimulation((prev) => {
                                  if (!prev) return prev;
                                  const current = prev[sk.key] || [];
                                  return {
                                    ...prev,
                                    [sk.key]: isSimAssigned
                                      ? current.filter((id) => id !== uid)
                                      : [...current, uid],
                                  };
                                });
                                setSimulationNames((prev) => {
                                  if (!prev) return prev;
                                  const name = getDisplayName(uid);
                                  const current = prev[sk.key] || [];
                                  return {
                                    ...prev,
                                    [sk.key]: isSimAssigned
                                      ? current.filter((n) => n !== name)
                                      : [...current, name],
                                  };
                                });
                              }}
                            >
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

            <div className="mt-4 flex gap-3">
              <button
                onClick={applySimulation}
                className="px-6 py-3 rounded-xl font-medium text-white bg-orange-500 hover:bg-orange-600 transition-colors"
              >
                シミュレーションを適用
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

      {/* 画像生成用の非表示シフト表 */}
      <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <div ref={shiftTableRef} style={{ width: 420, padding: "20px 16px", backgroundColor: "#fff", fontFamily: "sans-serif" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: "bold", color: "#1f2937" }}>{month}月 シフト表</div>
          </div>
          {schedule.days.map((day) => {
            const activeSlots = day.slots.filter((s) => s.needsFacilitator && s.classType);
            if (activeSlots.length === 0) return null;
            return (
              <div key={day.date} style={{ marginBottom: 20 }}>
                <div style={{ backgroundColor: "#f3f4f6", padding: "6px 12px", borderRadius: 6, marginBottom: 4, fontSize: 15, fontWeight: "bold", color: "#374151" }}>
                  {formatDateShort(day.date)}　{day.dayLabel}
                </div>
                {activeSlots.map((slot) => {
                  const key = getSlotKey(day.date, slot.time);
                  const assigned = (assignments[key] || []).map((uid) => getDisplayName(uid) + "さん");
                  const colors = CLASS_TYPE_COLORS[slot.classType!];
                  return (
                    <div key={key} style={{ padding: "6px 12px", borderBottom: "1px solid #e5e7eb" }}>
                      <div style={{ display: "flex", alignItems: "center", fontSize: 14 }}>
                        <span style={{ width: 44, fontWeight: "bold", color: "#6b7280", flexShrink: 0 }}>{slot.time}</span>
                        <span style={{ backgroundColor: colors.bg, color: colors.text, padding: "1px 6px", borderRadius: 3, fontSize: 11, marginRight: 6, flexShrink: 0, verticalAlign: "middle" }}>
                          {slot.classType}
                        </span>
                        <span style={{ color: "#059669", fontSize: 11, flexShrink: 0 }}>子{slot.childCount}名</span>
                      </div>
                      <div style={{ marginTop: 2, paddingLeft: 44, fontSize: 14, color: "#1f2937", fontWeight: 500 }}>
                        {assigned.length > 0 ? assigned.join("、") : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* 公開結果 */}
      {completed === "published" && (
        <div className="mt-6 space-y-4">
          <div className="px-4 py-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm text-green-800 font-medium">シフトを公開しました</p>
          </div>

          {/* シフト表画像 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-bold text-gray-700">シフト表（画像）</h3>
              <div className="flex gap-2">
                <button
                  onClick={generateImage}
                  disabled={generatingImage}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  再生成
                </button>
                {shiftImageUrl && (
                  <button
                    onClick={downloadImage}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700"
                  >
                    画像を保存
                  </button>
                )}
              </div>
            </div>
            <div className="p-4">
              {generatingImage ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
                  <span className="ml-2 text-sm text-gray-500">画像を生成中...</span>
                </div>
              ) : shiftImageUrl ? (
                <img
                  src={shiftImageUrl}
                  alt="シフト表"
                  className="w-full max-w-[500px] mx-auto rounded-lg border border-gray-200"
                />
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">画像を生成できませんでした</p>
              )}
              <p className="text-xs text-gray-400 mt-2 text-center">画像を長押しで保存、またはボタンからダウンロードできます</p>
            </div>
          </div>

          {/* シフト表（HTML） */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-bold text-gray-700">シフト表</h3>
            </div>
            <div className="overflow-x-auto">
              {(() => {
                const htmlAssignedUids = Array.from(new Set(Object.values(assignments).flat()));
                if (htmlAssignedUids.length === 0) return <div className="p-4 text-center text-gray-400 text-sm">割当なし</div>;
                const htmlDateFirst = new Set<string>();
                const htmlDateCounts: Record<string, number> = {};
                slotKeys.forEach((sk) => { htmlDateCounts[sk.date] = (htmlDateCounts[sk.date] || 0) + 1; });
                return (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left px-3 py-2 text-gray-600 font-medium text-xs">日付</th>
                        <th className="text-left px-2 py-2 text-gray-600 font-medium text-xs">時間</th>
                        <th className="text-left px-2 py-2 text-gray-600 font-medium text-xs">クラス</th>
                        <th className="text-center px-2 py-2 text-gray-600 font-medium text-xs">子ども</th>
                        {htmlAssignedUids.map((uid) => (
                          <th key={uid} className="text-center px-2 py-2 text-gray-700 font-medium text-xs">
                            {getDisplayName(uid)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {slotKeys.map((sk) => {
                        const assigned = assignments[sk.key] || [];
                        const isFirst = !htmlDateFirst.has(sk.date);
                        if (isFirst) htmlDateFirst.add(sk.date);
                        return (
                          <tr key={sk.key} className="border-b border-gray-100">
                            {isFirst && (
                              <td rowSpan={htmlDateCounts[sk.date]} className="px-3 py-2 font-medium text-gray-700 align-middle border-r border-gray-100 whitespace-nowrap text-xs">
                                {sk.dateLabel}
                              </td>
                            )}
                            <td className="px-2 py-2 text-gray-500 text-xs">{sk.time}</td>
                            <td className="px-2 py-2">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[11px]" style={{ backgroundColor: CLASS_TYPE_COLORS[sk.classType].bg, color: CLASS_TYPE_COLORS[sk.classType].text }}>
                                {sk.classType}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-center text-xs text-green-700">
                              {sk.childCount ? `${sk.childCount}名` : "—"}
                            </td>
                            {htmlAssignedUids.map((uid) => (
                              <td key={uid} className="px-2 py-2 text-center">
                                {assigned.includes(uid) ? (
                                  <span className="text-brand-600 font-bold">○</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>

          {/* 案内文 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-bold text-gray-700">LINE案内文</h3>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(buildAnnouncementText());
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  copied
                    ? "bg-green-500 text-white"
                    : "bg-brand-600 text-white hover:bg-brand-700"
                }`}
              >
                {copied ? "コピーしました" : "コピー"}
              </button>
            </div>
            <pre className="px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
              {buildAnnouncementText()}
            </pre>
          </div>

          <button
            onClick={() => router.push("/admin")}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ダッシュボードへ戻る
          </button>
        </div>
      )}
    </div>
  );
}
