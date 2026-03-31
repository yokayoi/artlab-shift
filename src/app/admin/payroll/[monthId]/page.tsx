"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSchedule, getShift, getAllUsers } from "@/lib/firebase/firestore";
import { MonthSchedule, ShiftAssignment, UserProfile } from "@/lib/types";
import { parseMonthId, getSlotKey, formatDateShort } from "@/lib/utils/dateCalc";
import { CLASS_DURATION_MINUTES } from "@/lib/utils/constants";

interface FacilitatorPayroll {
  uid: string;
  name: string;
  hourlyRate: number;
  slotCount: number;
  totalMinutes: number;
  totalPay: number;
  slots: { label: string; key: string }[];
}

export default function PayrollPage({ params }: { params: Promise<{ monthId: string }> }) {
  const { monthId } = use(params);
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null);
  const [shift, setShift] = useState<ShiftAssignment | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      const [sched, shiftData, allUsers] = await Promise.all([
        getSchedule(monthId),
        getShift(monthId),
        getAllUsers(),
      ]);
      setSchedule(sched);
      setShift(shiftData);
      setUsers(allUsers);
      setDataLoading(false);
    })();
  }, [user, isAdmin, monthId]);

  const { year, month } = parseMonthId(monthId);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (!schedule || !shift) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={() => router.push("/admin")} className="text-sm text-brand-600 mb-4 inline-block">
          ← ダッシュボード
        </button>
        <div className="text-center py-12 text-gray-400">シフトデータがありません</div>
      </div>
    );
  }

  // Build slot labels
  const slotLabels: Record<string, string> = {};
  schedule.days.forEach((day) => {
    day.slots.forEach((slot) => {
      const key = getSlotKey(day.date, slot.time);
      slotLabels[key] = `${formatDateShort(day.date)} ${slot.time}`;
    });
  });

  // Calculate payroll per facilitator
  const payrollMap = new Map<string, FacilitatorPayroll>();

  for (const [slotKey, uids] of Object.entries(shift.assignments)) {
    for (const uid of uids) {
      if (!payrollMap.has(uid)) {
        const userProfile = users.find((u) => u.uid === uid);
        payrollMap.set(uid, {
          uid,
          name: userProfile?.nickname || userProfile?.displayName || uid,
          hourlyRate: userProfile?.hourlyRate || 0,
          slotCount: 0,
          totalMinutes: 0,
          totalPay: 0,
          slots: [],
        });
      }
      const entry = payrollMap.get(uid)!;
      entry.slotCount += 1;
      entry.totalMinutes += CLASS_DURATION_MINUTES;
      entry.slots.push({ label: slotLabels[slotKey] || slotKey, key: slotKey });
    }
  }

  // Calculate pay
  const payrolls: FacilitatorPayroll[] = [];
  for (const entry of payrollMap.values()) {
    entry.totalPay = Math.round(entry.hourlyRate * (entry.totalMinutes / 60));
    entry.slots.sort((a, b) => a.key.localeCompare(b.key));
    payrolls.push(entry);
  }
  payrolls.sort((a, b) => a.name.localeCompare(b.name));

  const grandTotal = payrolls.reduce((sum, p) => sum + p.totalPay, 0);
  const totalSlots = payrolls.reduce((sum, p) => sum + p.slotCount, 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => router.push("/admin")} className="text-sm text-brand-600 mb-4 inline-block">
        ← ダッシュボード
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-6">
        {year}年{month}月 支払い計算
      </h1>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-800">{payrolls.length}</div>
          <div className="text-xs text-gray-500">ファシリテーター</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-800">{totalSlots}</div>
          <div className="text-xs text-gray-500">総スロット数</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-brand-700">¥{grandTotal.toLocaleString()}</div>
          <div className="text-xs text-gray-500">合計支払額</div>
        </div>
      </div>

      {/* Per facilitator */}
      <div className="space-y-3">
        {payrolls.map((p) => (
          <div key={p.uid} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-800">{p.name}</div>
                <div className="text-xs text-gray-500">
                  {p.hourlyRate > 0 ? `¥${p.hourlyRate.toLocaleString()}/h` : "時給未設定"} × {p.slotCount}コマ（{p.totalMinutes}分）
                </div>
              </div>
              <div className={`text-lg font-bold ${p.hourlyRate > 0 ? "text-brand-700" : "text-red-500"}`}>
                {p.hourlyRate > 0 ? `¥${p.totalPay.toLocaleString()}` : "要設定"}
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-2 border-t border-gray-100">
              <div className="flex flex-wrap gap-1">
                {p.slots.map((s) => (
                  <span key={s.key} className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-600">
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {payrolls.some((p) => p.hourlyRate === 0) && (
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-sm text-yellow-800">
            時給未設定のファシリテーターがいます。
            <button
              onClick={() => router.push("/admin/users")}
              className="text-brand-600 hover:underline ml-1"
            >
              ユーザー管理で時給を設定
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
