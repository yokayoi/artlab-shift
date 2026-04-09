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
import { jsPDF } from "jspdf";

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
  const [lineSending, setLineSending] = useState(false);
  const [lineSent, setLineSent] = useState<{ sent: number; failed: number } | null>(null);
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

    // LINE通知を自動送信
    try {
      const { getAuth } = await import("firebase/auth");
      const idToken = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/line/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ monthId, type: "publish" }),
      });
      const data = await res.json();
      setLineSent({ sent: data.sent || 0, failed: data.failed || 0 });
    } catch {
      console.error("LINE notification failed");
    }
  };

  const handleResendLine = async () => {
    if (!user) return;
    setLineSending(true);
    try {
      const { getAuth } = await import("firebase/auth");
      const idToken = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/line/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ monthId, type: "publish" }),
      });
      const data = await res.json();
      setLineSent({ sent: data.sent || 0, failed: data.failed || 0 });
    } catch {
      console.error("LINE resend failed");
    }
    setLineSending(false);
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

  const downloadPdf = async () => {
    if (!shiftTableRef.current) return;
    const canvas = await html2canvas(shiftTableRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const imgW = canvas.width;
    const imgH = canvas.height;
    const pdfW = imgW * 0.264583; // px to mm at 96dpi (≈0.2646)
    const pdfH = imgH * 0.264583;
    const pdf = new jsPDF({ orientation: pdfW > pdfH ? "landscape" : "portrait", unit: "mm", format: [pdfW, pdfH] });
    pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
    pdf.save(`シフト表_${month}月.pdf`);
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
        <div ref={shiftTableRef} style={{ width: 120 + Math.max(...schedule.days.map((day) => {
          const uids = new Set<string>();
          day.slots.filter((s) => s.needsFacilitator && s.classType).forEach((slot) => {
            (assignments[getSlotKey(day.date, slot.time)] || []).forEach((uid) => uids.add(uid));
          });
          return uids.size;
        }), 1) * 120, padding: "20px 16px", backgroundColor: "#fff", fontFamily: "sans-serif" }}>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 18, fontWeight: "bold", color: "#1f2937" }}>{month}月 シフト表</div>
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 16 }}>
            {["カリキュラム", "オーダーメイド"].map((type) => {
              const c = CLASS_TYPE_COLORS[type];
              return (
                <span key={type} style={{ backgroundColor: c.bg, color: c.text, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500 }}>
                  {type}
                </span>
              );
            })}
          </div>
          {schedule.days.map((day) => {
            const activeSlots = day.slots.filter((s) => s.needsFacilitator && s.classType);
            if (activeSlots.length === 0) return null;
            const dayFacUids: string[] = [];
            activeSlots.forEach((slot) => {
              (assignments[getSlotKey(day.date, slot.time)] || []).forEach((uid) => {
                if (!dayFacUids.includes(uid)) dayFacUids.push(uid);
              });
            });
            const facCells: Record<string, { show: boolean; rowSpan: number; assigned: boolean }[]> = {};
            dayFacUids.forEach((uid) => {
              const cells: { show: boolean; rowSpan: number; assigned: boolean }[] = [];
              let i = 0;
              while (i < activeSlots.length) {
                const k = getSlotKey(day.date, activeSlots[i].time);
                if ((assignments[k] || []).includes(uid)) {
                  let span = 1;
                  while (i + span < activeSlots.length) {
                    const nk = getSlotKey(day.date, activeSlots[i + span].time);
                    if ((assignments[nk] || []).includes(uid)) span++;
                    else break;
                  }
                  cells.push({ show: true, rowSpan: span, assigned: true });
                  for (let j = 1; j < span; j++) cells.push({ show: false, rowSpan: 0, assigned: true });
                  i += span;
                } else {
                  cells.push({ show: true, rowSpan: 1, assigned: false });
                  i++;
                }
              }
              facCells[uid] = cells;
            });
            return (
              <div key={day.date} style={{ marginBottom: 16 }}>
                <div style={{ backgroundColor: "#f3f4f6", padding: "6px 12px", borderRadius: 6, marginBottom: 4, fontSize: 14, fontWeight: "bold", color: "#374151" }}>
                  {formatDateShort(day.date)}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {activeSlots.map((slot, slotIdx) => {
                      const key = getSlotKey(day.date, slot.time);
                      const colors = CLASS_TYPE_COLORS[slot.classType!];
                      const assignedCount = (assignments[key] || []).length;
                      const required = getRequiredFacilitators(slot.childCount);
                      const isShort = required > 0 && assignedCount < required;
                      return (
                        <tr key={key}>
                          <td style={{ border: "1px solid #e5e7eb", padding: "6px 10px", verticalAlign: "top", width: 110 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", backgroundColor: colors.bg, border: `2px solid ${colors.border}`, flexShrink: 0 }} />
                              <span style={{ fontWeight: "bold", color: "#4b5563", fontSize: 13 }}>{slot.time}</span>
                            </div>
                            {slot.childCount && (
                              <div style={{ fontSize: 13, fontWeight: "bold", color: "#059669", marginTop: 2, paddingLeft: 15 }}>子{slot.childCount}名</div>
                            )}
                            {isShort && (
                              <div style={{ fontSize: 11, fontWeight: "bold", color: "#dc2626", marginTop: 2, paddingLeft: 15 }}>⚠ あと{required - assignedCount}名</div>
                            )}
                          </td>
                          {dayFacUids.map((uid) => {
                            const cell = facCells[uid][slotIdx];
                            if (!cell.show) return null;
                            return (
                              <td
                                key={uid}
                                rowSpan={cell.rowSpan}
                                style={{
                                  border: "1px solid #e5e7eb",
                                  padding: "6px 10px",
                                  textAlign: "center",
                                  fontSize: 13,
                                  fontWeight: 500,
                                  verticalAlign: "middle",
                                  whiteSpace: "nowrap",
                                  backgroundColor: cell.assigned ? "#eff6ff" : undefined,
                                  color: cell.assigned ? "#374151" : undefined,
                                }}
                              >
                                {cell.assigned ? <>{getDisplayName(uid)}<br /><span style={{ fontSize: 11 }}>さん</span></> : ""}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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

          {/* LINE通知ステータス */}
          {lineSent && (
            <div className={`px-4 py-3 rounded-xl text-sm ${
              lineSent.failed === 0 ? "bg-blue-50 border border-blue-200 text-blue-800" : "bg-amber-50 border border-amber-200 text-amber-800"
            }`}>
              LINE通知: {lineSent.sent}名に送信{lineSent.failed > 0 ? `（${lineSent.failed}名失敗）` : "しました"}
            </div>
          )}

          <button
            onClick={handleResendLine}
            disabled={lineSending}
            className="px-4 py-2 text-sm font-medium text-white bg-[#06C755] rounded-lg hover:bg-[#05b34c] disabled:bg-gray-300 transition-colors"
          >
            {lineSending ? "送信中..." : "LINE通知を再送信"}
          </button>

          {/* シフト表画像保存 */}
          <div className="flex gap-2">
            {generatingImage ? (
              <span className="text-xs text-gray-500">画像を生成中...</span>
            ) : shiftImageUrl ? (
              <>
                <button
                  onClick={downloadImage}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700"
                >
                  画像を保存
                </button>
                <button
                  onClick={downloadPdf}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  PDFを保存
                </button>
              </>
            ) : null}
          </div>

          {/* シフト表（HTML） */}
          <div className="max-w-[640px] mx-auto bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-bold text-gray-700">シフト表</h3>
            </div>
            <div className="px-4 pt-3 pb-1 flex gap-4 text-xs text-gray-500">
              {["カリキュラム", "オーダーメイド"].map((type) => {
                const c = CLASS_TYPE_COLORS[type];
                return (
                  <span key={type} className="flex items-center gap-1">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: c.bg, color: c.text }}>{type}</span>
                  </span>
                );
              })}
            </div>
            <div className="p-4 pt-2 space-y-4">
              {schedule.days.map((day) => {
                const activeSlots = day.slots.filter((s) => s.needsFacilitator && s.classType);
                if (activeSlots.length === 0) return null;
                const dayFacUids: string[] = [];
                activeSlots.forEach((slot) => {
                  (assignments[getSlotKey(day.date, slot.time)] || []).forEach((uid) => {
                    if (!dayFacUids.includes(uid)) dayFacUids.push(uid);
                  });
                });
                const facCells: Record<string, { show: boolean; rowSpan: number; assigned: boolean }[]> = {};
                dayFacUids.forEach((uid) => {
                  const cells: { show: boolean; rowSpan: number; assigned: boolean }[] = [];
                  let i = 0;
                  while (i < activeSlots.length) {
                    const k = getSlotKey(day.date, activeSlots[i].time);
                    if ((assignments[k] || []).includes(uid)) {
                      let span = 1;
                      while (i + span < activeSlots.length) {
                        const nk = getSlotKey(day.date, activeSlots[i + span].time);
                        if ((assignments[nk] || []).includes(uid)) span++;
                        else break;
                      }
                      cells.push({ show: true, rowSpan: span, assigned: true });
                      for (let j = 1; j < span; j++) cells.push({ show: false, rowSpan: 0, assigned: true });
                      i += span;
                    } else {
                      cells.push({ show: true, rowSpan: 1, assigned: false });
                      i++;
                    }
                  }
                  facCells[uid] = cells;
                });
                return (
                  <div key={day.date}>
                    <div className="bg-gray-100 px-3 py-1.5 rounded-md mb-1">
                      <span className="text-sm font-bold text-gray-700">{formatDateShort(day.date)}　{day.dayLabel}</span>
                    </div>
                    <table className="w-full border-collapse">
                      <tbody>
                        {activeSlots.map((slot, slotIdx) => {
                          const key = getSlotKey(day.date, slot.time);
                          const colors = CLASS_TYPE_COLORS[slot.classType!];
                          const assignedCount = (assignments[key] || []).length;
                          const required = getRequiredFacilitators(slot.childCount);
                          const isShort = required > 0 && assignedCount < required;
                          return (
                            <tr key={key}>
                              <td className="border border-gray-200 px-2 py-2 align-top w-20 text-left">
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors.bg, border: `2px solid ${colors.border}` }} />
                                  <span className="font-bold text-gray-600 text-sm max-sm:text-xs">{slot.time}</span>
                                </div>
                                {slot.childCount && (
                                  <div className="text-sm max-sm:text-xs font-bold text-green-600 mt-0.5">子{slot.childCount}名</div>
                                )}
                                {isShort && (
                                  <div className="text-[11px] max-sm:text-[10px] text-red-600 font-bold mt-0.5">⚠ あと{required - assignedCount}名</div>
                                )}
                              </td>
                              {dayFacUids.map((uid) => {
                                const cell = facCells[uid][slotIdx];
                                if (!cell.show) return null;
                                return (
                                  <td
                                    key={uid}
                                    rowSpan={cell.rowSpan}
                                    className={`border border-gray-200 px-2 py-2 text-center text-sm max-sm:text-xs font-medium align-middle ${
                                      cell.assigned ? "bg-brand-50 text-gray-700" : ""
                                    }`}
                                  >
                                    {cell.assigned ? <>{getDisplayName(uid)}<br /><span className="text-xs max-sm:text-[10px]">さん</span></> : ""}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
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
