"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getSchedule, getMonthAvailabilities } from "@/lib/firebase/firestore";
import { MonthSchedule, Availability } from "@/lib/types";
import { getSlotKey, parseMonthId, formatDateShort } from "@/lib/utils/dateCalc";

export default function AdminResponsesPage({ params }: { params: Promise<{ monthId: string }> }) {
  const { monthId } = use(params);
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      const [sched, avails] = await Promise.all([
        getSchedule(monthId),
        getMonthAvailabilities(monthId),
      ]);
      setSchedule(sched);
      setAvailabilities(avails);
      setDataLoading(false);
    })();
  }, [user, isAdmin, monthId]);

  const { year, month } = parseMonthId(monthId);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!schedule) return <div className="p-4">スケジュールが見つかりません</div>;

  // Build slot keys
  const slotKeys: { key: string; label: string }[] = [];
  schedule.days.forEach((day) => {
    day.slots.forEach((slot) => {
      if (slot.needsFacilitator) {
        slotKeys.push({
          key: getSlotKey(day.date, slot.time),
          label: `${formatDateShort(day.date)} ${slot.time}`,
        });
      }
    });
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button onClick={() => router.push("/admin")} className="text-sm text-blue-600 mb-4 inline-block">
        ← ダッシュボード
      </button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">
          {year}年{month}月 回答一覧
        </h1>
        <span className="text-sm text-gray-500">{availabilities.length}名回答済み</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-3 py-2 font-medium text-gray-600 sticky left-0 bg-white min-w-[120px]">
                日時
              </th>
              <th className="px-2 py-2 font-medium text-blue-700 text-center whitespace-nowrap bg-blue-50 min-w-[48px]">
                計
              </th>
              {availabilities.map((avail) => (
                <th key={avail.id} className="px-2 py-2 font-medium text-gray-500 text-center whitespace-nowrap text-xs min-w-[60px]">
                  {avail.facilitatorName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slotKeys.map((sk) => {
              const count = availabilities.filter((a) => a.slots[sk.key]).length;
              return (
                <tr key={sk.key} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-700 sticky left-0 bg-white whitespace-nowrap text-xs font-medium">
                    {sk.label}
                  </td>
                  <td className={`px-2 py-2 text-center font-bold bg-blue-50 ${
                    count === 0 ? "text-red-600" : count <= 2 ? "text-orange-600" : "text-blue-700"
                  }`}>
                    {count}
                  </td>
                  {availabilities.map((avail) => (
                    <td key={avail.id} className="px-2 py-2 text-center">
                      {avail.slots[sk.key] ? (
                        <span className="text-blue-600 font-bold">○</span>
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

      <div className="mt-6">
        <Link
          href={`/admin/shifts/${monthId}`}
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
        >
          シフト作成へ進む
        </Link>
      </div>
    </div>
  );
}
