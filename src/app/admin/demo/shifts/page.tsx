"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSlotKey, formatDateShort } from "@/lib/utils/dateCalc";
import { getRequiredFacilitators, CLASS_TYPE_COLORS } from "@/lib/utils/constants";
import { DaySchedule } from "@/lib/types";
import html2canvas from "html2canvas";

// ===== モックデータ =====

const MOCK_FACILITATORS = [
  { uid: "demo-1", nickname: "さくら", displayName: "さくら" },
  { uid: "demo-2", nickname: "はるか", displayName: "はるか" },
  { uid: "demo-3", nickname: "ゆうき", displayName: "ゆうき" },
  { uid: "demo-4", nickname: "あかり", displayName: "あかり" },
  { uid: "demo-5", nickname: "そら", displayName: "そら" },
];

const MOCK_DAYS: DaySchedule[] = [
  {
    date: "2026-04-11",
    dayLabel: "第2土曜",
    slots: [
      { time: "10:30", classType: "カリキュラム", needsFacilitator: true, childCount: 6 },
      { time: "12:00", classType: "オーダーメイド", needsFacilitator: true, childCount: 4 },
      { time: "14:30", classType: "カリキュラム", needsFacilitator: true, childCount: 8 },
      { time: "16:00", classType: "オーダーメイド", needsFacilitator: true, childCount: 3 },
    ],
  },
  {
    date: "2026-04-12",
    dayLabel: "第2日曜",
    slots: [
      { time: "10:30", classType: "カリキュラム", needsFacilitator: true, childCount: 5 },
      { time: "12:00", classType: "オーダーメイド", needsFacilitator: true, childCount: 7 },
      { time: "14:30", classType: "カリキュラム", needsFacilitator: true, childCount: 4 },
      { time: "16:00", classType: null, needsFacilitator: false },
    ],
  },
  {
    date: "2026-04-18",
    dayLabel: "第3土曜",
    slots: [
      { time: "10:30", classType: "オーダーメイド", needsFacilitator: true, childCount: 5 },
      { time: "12:00", classType: "カリキュラム", needsFacilitator: true, childCount: 6 },
      { time: "14:30", classType: "オーダーメイド", needsFacilitator: true, childCount: 9 },
      { time: "16:00", classType: "カリキュラム", needsFacilitator: true, childCount: 4 },
    ],
  },
  {
    date: "2026-04-19",
    dayLabel: "第3日曜",
    slots: [
      { time: "10:30", classType: "カリキュラム", needsFacilitator: true, childCount: 7 },
      { time: "12:00", classType: "オーダーメイド", needsFacilitator: true, childCount: 3 },
      { time: "14:30", classType: "カリキュラム", needsFacilitator: true, childCount: 5 },
      { time: "16:00", classType: "オーダーメイド", needsFacilitator: true, childCount: 6 },
    ],
  },
];

// 固定のモック空き状況（再現性のため乱数ではなくハードコード）
const MOCK_AVAILABILITY: Record<string, Record<string, boolean>> = {
  "demo-1": {
    "2026-04-11_10:30": true, "2026-04-11_12:00": true, "2026-04-11_14:30": true, "2026-04-11_16:00": true,
    "2026-04-12_10:30": false, "2026-04-12_12:00": false, "2026-04-12_14:30": true,
    "2026-04-18_10:30": true, "2026-04-18_12:00": true, "2026-04-18_14:30": true, "2026-04-18_16:00": false,
    "2026-04-19_10:30": false, "2026-04-19_12:00": true, "2026-04-19_14:30": true, "2026-04-19_16:00": true,
  },
  "demo-2": {
    "2026-04-11_10:30": false, "2026-04-11_12:00": true, "2026-04-11_14:30": false, "2026-04-11_16:00": false,
    "2026-04-12_10:30": true, "2026-04-12_12:00": true, "2026-04-12_14:30": true,
    "2026-04-18_10:30": false, "2026-04-18_12:00": false, "2026-04-18_14:30": true, "2026-04-18_16:00": true,
    "2026-04-19_10:30": true, "2026-04-19_12:00": true, "2026-04-19_14:30": true, "2026-04-19_16:00": false,
  },
  "demo-3": {
    "2026-04-11_10:30": true, "2026-04-11_12:00": true, "2026-04-11_14:30": false, "2026-04-11_16:00": false,
    "2026-04-12_10:30": true, "2026-04-12_12:00": true, "2026-04-12_14:30": false,
    "2026-04-18_10:30": true, "2026-04-18_12:00": true, "2026-04-18_14:30": false, "2026-04-18_16:00": false,
    "2026-04-19_10:30": true, "2026-04-19_12:00": false, "2026-04-19_14:30": false, "2026-04-19_16:00": false,
  },
  "demo-4": {
    "2026-04-11_10:30": true, "2026-04-11_12:00": false, "2026-04-11_14:30": true, "2026-04-11_16:00": true,
    "2026-04-12_10:30": true, "2026-04-12_12:00": false, "2026-04-12_14:30": true,
    "2026-04-18_10:30": false, "2026-04-18_12:00": true, "2026-04-18_14:30": true, "2026-04-18_16:00": true,
    "2026-04-19_10:30": true, "2026-04-19_12:00": true, "2026-04-19_14:30": false, "2026-04-19_16:00": true,
  },
  "demo-5": {
    "2026-04-11_10:30": false, "2026-04-11_12:00": false, "2026-04-11_14:30": true, "2026-04-11_16:00": true,
    "2026-04-12_10:30": false, "2026-04-12_12:00": true, "2026-04-12_14:30": true,
    "2026-04-18_10:30": false, "2026-04-18_12:00": true, "2026-04-18_14:30": true, "2026-04-18_16:00": true,
    "2026-04-19_10:30": false, "2026-04-19_12:00": false, "2026-04-19_14:30": true, "2026-04-19_16:00": true,
  },
};

const DEMO_HOURLY_RATE = 1500;
const SLOT_EFFECTIVE_MINUTES = 100; // 70分クラス + 前後15分ずつ
const SLOT_PAY = Math.round(DEMO_HOURLY_RATE * (SLOT_EFFECTIVE_MINUTES / 60)); // ¥2,500

const MOCK_SLOT_NOTES: Record<string, string> = {
  "2026-04-11_14:30": "体験会あり",
  "2026-04-18_10:30": "振替対応",
};

const ANNOUNCEMENT_TEXT = `お疲れ様です。
4月のシフトが確定しました。
添付のシフト表をご確認ください。
変更がある場合は早めにご連絡をお願いします。
よろしくお願いいたします。`;

export default function DemoShiftsPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [assignmentNames, setAssignmentNames] = useState<Record<string, string[]>>({});
  const [simulation, setSimulation] = useState<Record<string, string[]> | null>(null);
  const [simulationNames, setSimulationNames] = useState<Record<string, string[]> | null>(null);
  const [completed, setCompleted] = useState<"saved" | "published" | null>(null);
  const [copied, setCopied] = useState(false);
  const [shiftImageUrl, setShiftImageUrl] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [simulationApplied, setSimulationApplied] = useState(false);
  const shiftTableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, isAdmin, loading, router]);

  const facilitatorIds = MOCK_FACILITATORS.map((f) => f.uid);

  const getName = (uid: string) => {
    return MOCK_FACILITATORS.find((f) => f.uid === uid)?.nickname || uid;
  };

  const getAvailability = (uid: string, slotKey: string): boolean => {
    return MOCK_AVAILABILITY[uid]?.[slotKey] ?? false;
  };

  const toggleAssignment = (slotKey: string, uid: string) => {
    const name = getName(uid);
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
    const newAssignments: Record<string, string[]> = { ...assignments };
    const newNames: Record<string, string[]> = { ...assignmentNames };
    MOCK_DAYS.forEach((day) => {
      day.slots.forEach((slot) => {
        if (!slot.needsFacilitator || !slot.classType) return;
        const slotKey = getSlotKey(day.date, slot.time);
        const available = facilitatorIds.filter((uid) => getAvailability(uid, slotKey));
        newAssignments[slotKey] = available;
        newNames[slotKey] = available.map(getName);
      });
    });
    setAssignments(newAssignments);
    setAssignmentNames(newNames);
  };

  const handleClearAll = () => {
    setAssignments({});
    setAssignmentNames({});
  };

  // AI自動割り当て（本番と同じアルゴリズム）
  const runAutoAssign = () => {
    const newAssignments: Record<string, string[]> = {};
    const newNames: Record<string, string[]> = {};
    const assignCount: Record<string, number> = {};
    facilitatorIds.forEach((uid) => { assignCount[uid] = 0; });

    type SlotInfo = { key: string; date: string; time: string; required: number; availableUids: string[] };
    const slotsByDate: Record<string, SlotInfo[]> = {};

    MOCK_DAYS.forEach((day) => {
      const daySlots: SlotInfo[] = [];
      day.slots.forEach((slot) => {
        if (!slot.needsFacilitator || !slot.classType) return;
        const slotKey = getSlotKey(day.date, slot.time);
        const required = getRequiredFacilitators(slot.childCount);
        const availableUids = facilitatorIds.filter((uid) => getAvailability(uid, slotKey));
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
        newNames[slot.key] = picked.map(getName);
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

  const handlePublish = () => {
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

  // 公開時にDOM更新後に画像生成
  useEffect(() => {
    if (completed === "published") {
      const timer = setTimeout(() => generateImage(), 200);
      return () => clearTimeout(timer);
    }
  }, [completed]);

  const downloadImage = () => {
    if (!shiftImageUrl) return;
    const link = document.createElement("a");
    link.download = "シフト表_4月.png";
    link.href = shiftImageUrl;
    link.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  // スロット情報を構築
  const slotKeys: { key: string; date: string; dateLabel: string; time: string; classType: string; childCount?: number }[] = [];
  MOCK_DAYS.forEach((day) => {
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

  // シミュレーション割当サマリー
  const simSummary = simulation ? (() => {
    const counts: Record<string, number> = {};
    facilitatorIds.forEach((uid) => { counts[uid] = 0; });
    Object.values(simulation).forEach((uids) => {
      uids.forEach((uid) => { counts[uid] = (counts[uid] || 0) + 1; });
    });
    return counts;
  })() : null;

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
  const totalPay = totalAssigned * SLOT_PAY;

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
    let text = ANNOUNCEMENT_TEXT;
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

      <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-sm text-amber-800">
          <span className="font-bold">デモモード:</span> サンプルデータで操作を体験できます。実際のデータには影響しません。
        </p>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">
          シフト作成デモ
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

      {/* ファシリテーター凡例 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {MOCK_FACILITATORS.map((f) => (
          <span key={f.uid} className="px-2 py-1 bg-gray-100 rounded-lg text-xs text-gray-600">
            {f.nickname}
          </span>
        ))}
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
              {MOCK_FACILITATORS.map((f) => (
                <th key={f.uid} className="px-3 py-2 font-medium text-gray-500 text-center whitespace-nowrap text-xs">
                  {f.nickname}
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
                  {facilitatorIds.map((uid) => {
                    const hasAvailability = getAvailability(uid, sk.key);
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
                    {MOCK_SLOT_NOTES[sk.key] ? (
                      <span className="text-xs text-orange-500 font-medium">{MOCK_SLOT_NOTES[sk.key]}</span>
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
          <h3 className="text-sm font-bold text-gray-700 mb-3">給与見積（¥{DEMO_HOURLY_RATE.toLocaleString()}/h × {SLOT_EFFECTIVE_MINUTES}分/コマ = ¥{SLOT_PAY.toLocaleString()}/コマ）</h3>
          <div className="flex flex-wrap gap-3 mb-3">
            {facilitatorIds.map((uid) => {
              const count = payrollSummary[uid] || 0;
              if (count === 0) return null;
              return (
                <div key={uid} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 text-sm">
                  <span className="font-medium text-gray-700">{getName(uid)}</span>
                  <span className="ml-2 text-gray-500">{count}コマ</span>
                  <span className="ml-2 font-bold text-brand-700">¥{(count * SLOT_PAY).toLocaleString()}</span>
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
        return (
          <div className="mt-8 border-2 border-orange-300 rounded-xl bg-orange-50 p-4">
            <h2 className="text-lg font-bold text-orange-700 mb-4">シミュレーション結果</h2>

            <div className="flex flex-wrap gap-3 mb-3">
              {facilitatorIds.map((uid) => {
                const count = simSummary[uid] || 0;
                return (
                  <div key={uid} className="bg-white rounded-lg px-3 py-2 border border-orange-200 text-sm">
                    <span className="font-medium text-gray-700">{getName(uid)}</span>
                    <span className="ml-2 font-bold text-orange-600">{count}回</span>
                    <span className="ml-1 text-gray-500">¥{(count * SLOT_PAY).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
            <div className="mb-4 text-right text-sm font-bold text-gray-600">
              合計: ¥{(Object.values(simSummary).reduce((s, c) => s + c, 0) * SLOT_PAY).toLocaleString()}
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
                    {MOCK_FACILITATORS.map((f) => (
                      <th key={f.uid} className="px-3 py-2 font-medium text-gray-500 text-center whitespace-nowrap text-xs">
                        {f.nickname}
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
                        {facilitatorIds.map((uid) => {
                          const hasAvailability = getAvailability(uid, sk.key);
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
                                  const name = getName(uid);
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
          onClick={() => setCompleted("saved")}
          className="px-6 py-3 rounded-xl font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          シフトを保存（下書き）
        </button>
        <button
          onClick={handlePublish}
          className="px-6 py-3 rounded-xl font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
        >
          シフトを公開する
        </button>
      </div>

      {/* 画像生成用の非表示シフト表 */}
      <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <div ref={shiftTableRef} style={{ width: 420, padding: "20px 16px", backgroundColor: "#fff", fontFamily: "sans-serif" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: "bold", color: "#1f2937" }}>4月 シフト表</div>
          </div>
          {MOCK_DAYS.map((day) => {
            const activeSlots = day.slots.filter((s) => s.needsFacilitator && s.classType);
            if (activeSlots.length === 0) return null;
            return (
              <div key={day.date} style={{ marginBottom: 20 }}>
                <div style={{ backgroundColor: "#f3f4f6", padding: "6px 12px", borderRadius: 6, marginBottom: 4, fontSize: 15, fontWeight: "bold", color: "#374151" }}>
                  {formatDateShort(day.date)}　{day.dayLabel}
                </div>
                {activeSlots.map((slot) => {
                  const key = getSlotKey(day.date, slot.time);
                  const assigned = (assignments[key] || []).map((uid) => getName(uid) + "さん");
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
      {completed && (
        <div className="mt-6 space-y-4">
          <div className="px-4 py-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm text-green-800 font-medium">
              {completed === "published"
                ? "シフトを公開しました（デモ）"
                : "シフトを下書き保存しました（デモ）"}
            </p>
            <p className="text-xs text-green-600 mt-1">実際のデータには影響していません。</p>
          </div>

          {completed === "published" && (
            <>
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
                                {getName(uid)}
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
            </>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => { setCompleted(null); setCopied(false); setShiftImageUrl(null); handleClearAll(); }}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              最初からやり直す
            </button>
            <button
              onClick={() => router.push("/admin")}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ダッシュボードへ戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
