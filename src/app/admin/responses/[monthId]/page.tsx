"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getSchedule, getMonthAvailabilities, getAllUsers, saveAvailability, getFacilitators } from "@/lib/firebase/firestore";
import { MonthSchedule, Availability, UserProfile } from "@/lib/types";
import { getSlotKey, parseMonthId, formatDateShort } from "@/lib/utils/dateCalc";
import { DEMO_MONTH_ID } from "@/lib/utils/constants";

export default function AdminResponsesPage({ params }: { params: Promise<{ monthId: string }> }) {
  const { monthId } = use(params);
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserProfile>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [modified, setModified] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      const [sched, avails, users, facs] = await Promise.all([
        getSchedule(monthId),
        getMonthAvailabilities(monthId),
        getAllUsers(),
        getFacilitators(),
      ]);
      setSchedule(sched);
      const map: Record<string, UserProfile> = {};
      users.forEach((u) => { map[u.uid] = u; });
      setUserMap(map);

      // 未回答のファシリテーター（+管理者）も空の回答として追加
      const respondedUids = new Set(avails.map((a) => a.facilitatorId));
      const allFacs = [...avails];
      const allStaff = [...facs, ...users.filter((u) => u.role === "admin")];
      for (const fac of allStaff) {
        if (!respondedUids.has(fac.uid)) {
          const emptySlots: Record<string, boolean> = {};
          if (sched) {
            sched.days.forEach((day) =>
              day.slots.forEach((slot) => {
                if (slot.needsFacilitator && slot.classType) {
                  emptySlots[getSlotKey(day.date, slot.time)] = false;
                }
              })
            );
          }
          allFacs.push({
            id: `${monthId}_${fac.uid}`,
            monthId,
            facilitatorId: fac.uid,
            facilitatorName: fac.displayName,
            slots: emptySlots,
          } as Availability);
        }
      }
      setAvailabilities(allFacs);
      setDataLoading(false);
    })();
  }, [user, isAdmin, monthId]);

  const toggleSlot = (availIndex: number, slotKey: string) => {
    setAvailabilities((prev) => {
      const updated = [...prev];
      const avail = { ...updated[availIndex] };
      avail.slots = { ...avail.slots, [slotKey]: !avail.slots[slotKey] };
      updated[availIndex] = avail;
      return updated;
    });
    setModified((prev) => new Set(prev).add(availabilities[availIndex].facilitatorId));
  };

  const handleSave = async () => {
    setSaving(true);
    for (const avail of availabilities) {
      if (modified.has(avail.facilitatorId)) {
        await saveAvailability(monthId, avail.facilitatorId, avail.facilitatorName, avail.slots);
      }
    }
    setModified(new Set());
    setSaving(false);
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

  // Build slot keys (only slots that need facilitator AND have classType set)
  const slotKeys: { key: string; date: string; dateLabel: string; time: string }[] = [];
  schedule.days.forEach((day) => {
    day.slots.forEach((slot) => {
      if (slot.needsFacilitator && slot.classType) {
        slotKeys.push({
          key: getSlotKey(day.date, slot.time),
          date: day.date,
          dateLabel: formatDateShort(day.date),
          time: slot.time,
        });
      }
    });
  });

  // Calculate rowSpan for date grouping
  const dateRowSpans: Record<string, number> = {};
  slotKeys.forEach((sk) => {
    dateRowSpans[sk.date] = (dateRowSpans[sk.date] || 0) + 1;
  });
  const dateFirstRow = new Set<string>();

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button onClick={() => router.push("/admin")} className="text-sm text-brand-600 mb-4 inline-block">
        ← ダッシュボード
      </button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">
          {isDemo ? "デモ" : `${year}年${month}月`} 回答一覧
        </h1>
        <span className="text-sm text-gray-500">{availabilities.length}名回答済み</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-3 py-2 font-medium text-gray-600 sticky left-0 bg-white min-w-[80px]">
                日付
              </th>
              <th className="text-left px-2 py-2 font-medium text-gray-600 min-w-[50px]">
                時間
              </th>
              <th className="px-2 py-2 font-medium text-brand-700 text-center whitespace-nowrap bg-brand-50 min-w-[48px]">
                計
              </th>
              {availabilities.map((avail) => (
                <th key={avail.id} className="px-2 py-2 font-medium text-gray-500 text-center whitespace-nowrap text-xs min-w-[60px]">
                  {userMap[avail.facilitatorId]?.nickname || avail.facilitatorName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slotKeys.map((sk) => {
              const count = availabilities.filter((a) => a.slots[sk.key]).length;
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
                  <td className="px-2 py-2 text-gray-500 whitespace-nowrap text-xs">
                    {sk.time}
                  </td>
                  <td className={`px-2 py-2 text-center font-bold bg-brand-50 ${
                    count === 0 ? "text-red-600" : count <= 2 ? "text-orange-600" : "text-brand-700"
                  }`}>
                    {count}
                  </td>
                  {availabilities.map((avail, ai) => (
                    <td
                      key={avail.id}
                      className="px-2 py-2 text-center cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleSlot(ai, sk.key)}
                    >
                      {avail.slots[sk.key] ? (
                        <span className="text-brand-600 text-lg leading-none">●</span>
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
      </div>

      {modified.size > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:bg-gray-300 transition-colors"
          >
            {saving ? "保存中..." : `変更を保存（${modified.size}名）`}
          </button>
          <span className="text-xs text-gray-500">クリックで投票を変更できます</span>
        </div>
      )}

      <div className="mt-6">
        <Link
          href={`/admin/shifts/${monthId}`}
          className="inline-block px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition-colors"
        >
          シフト作成へ進む
        </Link>
      </div>
    </div>
  );
}
