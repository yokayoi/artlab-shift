"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSchedule, getShift, getAllUsers, getMonthAttendances } from "@/lib/firebase/firestore";
import { MonthSchedule, ShiftAssignment, UserProfile, Attendance } from "@/lib/types";
import { parseMonthId, getSlotKey, formatDateShort } from "@/lib/utils/dateCalc";
import { CLASS_DURATION_MINUTES, getEffectiveRate, DEMO_MONTH_ID } from "@/lib/utils/constants";

interface FacilitatorPayroll {
  uid: string;
  name: string;
  hourlyRate: number;
  isTrainingRate: boolean;
  transportCost: number;
  slotCount: number;
  totalMinutes: number;
  classPay: number;
  totalPay: number;
  actualMinutes: number;
  actualClassPay: number;
  actualTotalPay: number;
  hasAttendance: boolean;
  bankInfo: string;
  slots: { label: string; key: string; attendanceMin: number | null }[];
}

export default function PayrollPage({ params }: { params: Promise<{ monthId: string }> }) {
  const { monthId } = use(params);
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null);
  const [shift, setShift] = useState<ShiftAssignment | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
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
      try {
        const attData = await getMonthAttendances(monthId);
        setAttendances(attData);
      } catch {
        // attendance collection may not have rules deployed yet
      }
      setSchedule(sched);
      setShift(shiftData);
      setUsers(allUsers);
      setDataLoading(false);
    })();
  }, [user, isAdmin, monthId]);

  const { year, month } = parseMonthId(monthId);
  const isDemo = monthId === DEMO_MONTH_ID;

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

  // Build attendance map
  const attendanceMap = new Map<string, Attendance>();
  attendances.forEach((a) => attendanceMap.set(a.facilitatorId, a));

  // Calculate payroll per facilitator
  const payrollMap = new Map<string, FacilitatorPayroll>();

  for (const [slotKey, uids] of Object.entries(shift.assignments)) {
    for (const uid of uids) {
      if (!payrollMap.has(uid)) {
        const userProfile = users.find((u) => u.uid === uid);
        const classCount = userProfile?.classCount || 0;
        const effectiveRate = getEffectiveRate(classCount, userProfile?.hourlyRate || 0);
        const bank = userProfile?.bankAccount;
        payrollMap.set(uid, {
          uid,
          name: userProfile?.nickname || userProfile?.displayName || uid,
          hourlyRate: effectiveRate,
          isTrainingRate: classCount >= 1 && classCount <= 3,
          transportCost: userProfile?.transportCost || 0,
          slotCount: 0,
          totalMinutes: 0,
          classPay: 0,
          totalPay: 0,
          actualMinutes: 0,
          actualClassPay: 0,
          actualTotalPay: 0,
          hasAttendance: false,
          bankInfo: bank ? `${bank.bankName} ${bank.branchName} (${bank.accountType}) ${bank.accountNumber} ${bank.accountHolder}` : "",
          slots: [],
        });
      }
      const entry = payrollMap.get(uid)!;
      entry.slotCount += 1;
      entry.totalMinutes += CLASS_DURATION_MINUTES;

      const att = attendanceMap.get(uid);
      const record = att?.records?.[slotKey];
      let attendanceMin: number | null = null;
      if (record?.checkIn && record?.checkOut) {
        attendanceMin = Math.round((record.checkOut.toDate().getTime() - record.checkIn.toDate().getTime()) / 60000);
        entry.hasAttendance = true;
        entry.actualMinutes += attendanceMin;
      } else {
        entry.actualMinutes += CLASS_DURATION_MINUTES;
      }

      entry.slots.push({ label: slotLabels[slotKey] || slotKey, key: slotKey, attendanceMin });
    }
  }

  // Calculate pay
  const payrolls: FacilitatorPayroll[] = [];
  for (const entry of payrollMap.values()) {
    entry.classPay = Math.round(entry.hourlyRate * (entry.totalMinutes / 60));
    entry.totalPay = entry.classPay + entry.transportCost;
    entry.actualClassPay = Math.round(entry.hourlyRate * (entry.actualMinutes / 60));
    entry.actualTotalPay = entry.actualClassPay + entry.transportCost;
    entry.slots.sort((a, b) => a.key.localeCompare(b.key));
    payrolls.push(entry);
  }
  payrolls.sort((a, b) => a.name.localeCompare(b.name));

  const hasAnyAttendance = payrolls.some((p) => p.hasAttendance);
  const grandTotal = payrolls.reduce((sum, p) => sum + (hasAnyAttendance ? p.actualTotalPay : p.totalPay), 0);
  const totalSlots = payrolls.reduce((sum, p) => sum + p.slotCount, 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => router.push("/admin")} className="text-sm text-brand-600 mb-4 inline-block">
        ← ダッシュボード
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-6">
        {isDemo ? "デモ" : `${year}年${month}月`} 支払い計算
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
        {payrolls.map((p) => {
          const displayPay = p.hasAttendance ? p.actualTotalPay : p.totalPay;
          const displayClassPay = p.hasAttendance ? p.actualClassPay : p.classPay;
          const displayMinutes = p.hasAttendance ? p.actualMinutes : p.totalMinutes;
          return (
            <div key={p.uid} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">{p.name}</span>
                    {p.isTrainingRate && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">研修</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {p.hourlyRate > 0 ? `¥${p.hourlyRate.toLocaleString()}/h` : "時給未設定"}
                    {p.isTrainingRate && "（研修時給）"}
                    {" × "}{p.slotCount}コマ（{displayMinutes}分{p.hasAttendance ? " 実績" : ""}）= ¥{displayClassPay.toLocaleString()}
                  </div>
                  {p.hasAttendance && p.actualMinutes !== p.totalMinutes && (
                    <div className="text-xs text-blue-500">
                      予定{p.totalMinutes}分 → 実績{p.actualMinutes}分
                    </div>
                  )}
                  {p.transportCost > 0 && (
                    <div className="text-xs text-gray-500">
                      交通費 ¥{p.transportCost.toLocaleString()}/月
                    </div>
                  )}
                  {p.bankInfo ? (
                    <div className="text-xs text-gray-400 mt-0.5">振込先: {p.bankInfo}</div>
                  ) : (
                    <div className="text-xs text-red-400 mt-0.5">口座未登録</div>
                  )}
                </div>
                <div className={`text-lg font-bold ${p.hourlyRate > 0 ? "text-brand-700" : "text-red-500"}`}>
                  {p.hourlyRate > 0 ? `¥${displayPay.toLocaleString()}` : "要設定"}
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-2 border-t border-gray-100">
                <div className="flex flex-wrap gap-1">
                  {p.slots.map((s) => (
                    <span key={s.key} className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-600">
                      {s.label}{s.attendanceMin !== null ? ` (${s.attendanceMin}分)` : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(payrolls.some((p) => p.hourlyRate === 0) || payrolls.some((p) => !p.bankInfo)) && (
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4 space-y-1">
          {payrolls.some((p) => p.hourlyRate === 0) && (
            <p className="text-sm text-yellow-800">
              時給未設定のファシリテーターがいます。
              <button onClick={() => router.push("/admin/users")} className="text-brand-600 hover:underline ml-1">
                ユーザー管理で設定
              </button>
            </p>
          )}
          {payrolls.some((p) => !p.bankInfo) && (
            <p className="text-sm text-yellow-800">
              口座未登録のファシリテーターがいます。
              <button onClick={() => router.push("/admin/users")} className="text-brand-600 hover:underline ml-1">
                ユーザー管理で設定
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
