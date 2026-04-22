"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSchedule, getShift, getAllUsers, getMonthAttendances, adminEditAttendance, confirmPayroll, getMonthPayrollConfirmations, cancelPayrollConfirmation, getMonthPayrollCarryOvers, setPayrollCarryOver, deletePayrollCarryOver, getMonthPayrollReports, resolvePayrollReport, reopenPayrollReport } from "@/lib/firebase/firestore";
import { MonthSchedule, ShiftAssignment, UserProfile, Attendance, PayrollConfirmation, PayrollCarryOver, PayrollReport } from "@/lib/types";
import { parseMonthId, getSlotKey, formatDateShort, getSlotDate, timestampToTimeString, getNextMonthId } from "@/lib/utils/dateCalc";
import { CLASS_DURATION_MINUTES, getEffectiveRateForMonth, DEMO_MONTH_ID, getBreakDeduction, PAYMENT_MIN_THRESHOLD } from "@/lib/utils/constants";
import { Timestamp } from "firebase/firestore";

interface DayInfo {
  dayKey: string;
  label: string;
  slotKeys: string[];
  checkIn: Timestamp | null;
  checkOut: Timestamp | null;
  minutes: number;
}

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
  breakMinutes: number;
  bankInfo: string;
  slots: { label: string; key: string; attendanceMin: number | null }[];
  days: DayInfo[];
  carryOverIn: number;
  subtotal: number;
  finalTotal: number;
  isDeferred: boolean;
}

export default function PayrollPage({ params }: { params: Promise<{ monthId: string }> }) {
  const { monthId } = use(params);
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null);
  const [shift, setShift] = useState<ShiftAssignment | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [confirmations, setConfirmations] = useState<PayrollConfirmation[]>([]);
  const [carryOvers, setCarryOvers] = useState<PayrollCarryOver[]>([]);
  const [carryOverInputs, setCarryOverInputs] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<PayrollReport[]>([]);
  const [resolvingReport, setResolvingReport] = useState<string | null>(null);
  const [responseInputs, setResponseInputs] = useState<Record<string, string>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [savingCarry, setSavingCarry] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, isAdmin, loading, router]);

  const loadData = useCallback(async () => {
    if (!user || !isAdmin) return;
    const [sched, shiftData, allUsers] = await Promise.all([
      getSchedule(monthId),
      getShift(monthId),
      getAllUsers(),
    ]);
    try {
      const [attData, confData, carryData, reportsData] = await Promise.all([
        getMonthAttendances(monthId),
        getMonthPayrollConfirmations(monthId),
        getMonthPayrollCarryOvers(monthId),
        getMonthPayrollReports(monthId),
      ]);
      setAttendances(attData);
      setConfirmations(confData);
      setCarryOvers(carryData);
      setReports(reportsData);
      const inputs: Record<string, string> = {};
      carryData.forEach((c) => {
        inputs[c.facilitatorId] = c.amount > 0 ? String(c.amount) : "";
      });
      setCarryOverInputs(inputs);
    } catch {
      // collections may not exist yet
    }
    setSchedule(sched);
    setShift(shiftData);
    setUsers(allUsers);
    setDataLoading(false);
  }, [user, isAdmin, monthId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEditTime = async (uid: string, dayKey: string, field: "checkIn" | "checkOut", value: string) => {
    if (!user || !value) return;
    const editKey = `${uid}_${dayKey}_${field}`;
    setSaving(editKey);
    try {
      const att = attendances.find((a) => a.facilitatorId === uid);
      const record = att?.records?.[dayKey];
      const existingCheckIn = record?.checkIn || null;
      const existingCheckOut = record?.checkOut || null;

      const [h, m] = value.split(":");
      const date = new Date(dayKey);
      date.setHours(parseInt(h), parseInt(m), 0, 0);
      const ts = Timestamp.fromDate(date);

      const newCheckIn = field === "checkIn" ? ts : existingCheckIn;
      const newCheckOut = field === "checkOut" ? ts : existingCheckOut;

      await adminEditAttendance(monthId, uid, dayKey, newCheckIn, newCheckOut, user.uid);

      try {
        const attData = await getMonthAttendances(monthId);
        setAttendances(attData);
      } catch { /* ignore */ }
    } catch {
      alert("時間の更新に失敗しました。");
    }
    setSaving(null);
  };

  const handleResolveReport = async (report: PayrollReport) => {
    if (!user) return;
    setResolvingReport(report.id);
    try {
      const response = (responseInputs[report.id] || "").trim();
      await resolvePayrollReport(report.id, user.uid, response || undefined);
      const data = await getMonthPayrollReports(monthId);
      setReports(data);
      setResponseInputs((prev) => {
        const n = { ...prev };
        delete n[report.id];
        return n;
      });
    } catch {
      alert("処理に失敗しました");
    }
    setResolvingReport(null);
  };

  const handleReopenReport = async (report: PayrollReport) => {
    setResolvingReport(report.id);
    try {
      await reopenPayrollReport(report.id);
      const data = await getMonthPayrollReports(monthId);
      setReports(data);
    } catch {
      alert("処理に失敗しました");
    }
    setResolvingReport(null);
  };

  const handleCarryOverChange = (uid: string, value: string) => {
    setCarryOverInputs((prev) => ({ ...prev, [uid]: value }));
  };

  const handleCarryOverBlur = async (uid: string) => {
    if (!user) return;
    const raw = carryOverInputs[uid] ?? "";
    const parsed = raw === "" ? 0 : Number(raw.replace(/[^\d-]/g, ""));
    const amount = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
    const existing = carryOvers.find((c) => c.facilitatorId === uid);
    if ((existing?.amount || 0) === amount) return;
    setSavingCarry(uid);
    try {
      if (amount === 0) {
        await deletePayrollCarryOver(monthId, uid);
      } else {
        await setPayrollCarryOver(monthId, uid, amount, user.uid);
      }
      const carryData = await getMonthPayrollCarryOvers(monthId);
      setCarryOvers(carryData);
    } catch {
      alert("先月の保留分の保存に失敗しました。");
    }
    setSavingCarry(null);
  };

  const handleConfirm = async (p: FacilitatorPayroll) => {
    if (!user) return;
    const message = p.isDeferred
      ? `${p.name}さんの今月の支払額（¥${p.subtotal.toLocaleString()}）は ¥${PAYMENT_MIN_THRESHOLD.toLocaleString()} 以下のため、翌月に繰り越されます。\n今月は支払わず、翌月の「先月の保留分」として ¥${p.subtotal.toLocaleString()} を自動登録します。確定しますか？`
      : `${p.name}さんの給与を確定しますか？\n合計: ¥${p.finalTotal.toLocaleString()}`;
    if (!confirm(message)) return;
    setConfirming(p.uid);
    try {
      const displayClassPay = p.hasAttendance ? p.actualClassPay : p.classPay;
      const displayMinutes = p.hasAttendance ? p.actualMinutes : p.totalMinutes;
      await confirmPayroll({
        monthId,
        facilitatorId: p.uid,
        confirmedAt: Timestamp.now(),
        confirmedBy: user.uid,
        totalPay: p.isDeferred ? 0 : p.finalTotal,
        classPay: displayClassPay,
        transportCost: p.transportCost,
        totalMinutes: displayMinutes,
        breakMinutes: p.breakMinutes,
        slotCount: p.slotCount,
        hourlyRate: p.hourlyRate,
        carryOverIn: p.carryOverIn,
        carryOverOut: p.isDeferred ? p.subtotal : 0,
        isDeferred: p.isDeferred,
        days: p.days.map((d) => ({
          dayKey: d.dayKey,
          checkIn: d.checkIn,
          checkOut: d.checkOut,
          minutes: d.minutes,
          slotCount: d.slotKeys.length,
        })),
      });
      if (p.isDeferred && p.subtotal > 0) {
        const nextMonthId = getNextMonthId(monthId);
        await setPayrollCarryOver(
          nextMonthId,
          p.uid,
          p.subtotal,
          user.uid,
          `${monthId} から繰り越し`
        );
      }
      const confData = await getMonthPayrollConfirmations(monthId);
      setConfirmations(confData);
    } catch {
      alert("確定に失敗しました。");
    }
    setConfirming(null);
  };

  const handleCancel = async (uid: string, name: string) => {
    const existing = confirmations.find((c) => c.facilitatorId === uid);
    const hasCarryOut = existing?.isDeferred && (existing?.carryOverOut || 0) > 0;
    const message = hasCarryOut
      ? `${name}さんの給与確定を取り消しますか？\n翌月に繰り越された ¥${(existing?.carryOverOut || 0).toLocaleString()} も取り消します。`
      : `${name}さんの給与確定を取り消しますか？`;
    if (!confirm(message)) return;
    setConfirming(uid);
    try {
      await cancelPayrollConfirmation(monthId, uid);
      if (hasCarryOut) {
        const nextMonthId = getNextMonthId(monthId);
        await deletePayrollCarryOver(nextMonthId, uid);
      }
      const confData = await getMonthPayrollConfirmations(monthId);
      setConfirmations(confData);
    } catch {
      alert("取り消しに失敗しました。");
    }
    setConfirming(null);
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

  // Build confirmation map
  const confirmationMap = new Map<string, PayrollConfirmation>();
  confirmations.forEach((c) => confirmationMap.set(c.facilitatorId, c));

  // Build reports map (facilitatorId → reports[])
  const reportsByUid = new Map<string, PayrollReport[]>();
  reports
    .slice()
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
    .forEach((r) => {
      const arr = reportsByUid.get(r.facilitatorId) || [];
      arr.push(r);
      reportsByUid.set(r.facilitatorId, arr);
    });
  const openReportsTotal = reports.filter((r) => r.status === "open").length;

  // Calculate payroll per facilitator
  const payrollMap = new Map<string, FacilitatorPayroll>();
  const facDaySlots: Record<string, Record<string, string[]>> = {};

  for (const [slotKey, uids] of Object.entries(shift.assignments)) {
    const dayKey = getSlotDate(slotKey);
    for (const uid of uids) {
      if (!payrollMap.has(uid)) {
        const userProfile = users.find((u) => u.uid === uid);
        const classCount = userProfile?.classCount || 0;
        const effectiveRate = getEffectiveRateForMonth(monthId, classCount, userProfile?.hourlyRate || 0);
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
          breakMinutes: 0,
          bankInfo: bank ? `${bank.bankName} ${bank.branchName} (${bank.accountType}) ${bank.accountNumber} ${bank.accountHolder}` : "",
          slots: [],
          days: [],
          carryOverIn: 0,
          subtotal: 0,
          finalTotal: 0,
          isDeferred: false,
        });
      }
      const entry = payrollMap.get(uid)!;
      entry.slotCount += 1;
      entry.totalMinutes += CLASS_DURATION_MINUTES;
      entry.slots.push({ label: slotLabels[slotKey] || slotKey, key: slotKey, attendanceMin: null });

      if (!facDaySlots[uid]) facDaySlots[uid] = {};
      if (!facDaySlots[uid][dayKey]) facDaySlots[uid][dayKey] = [];
      facDaySlots[uid][dayKey].push(slotKey);
    }
  }

  // Calculate actual minutes per facilitator
  for (const [uid, entry] of payrollMap.entries()) {
    entry.actualMinutes = 0;
    let breakDeductionTotal = 0;
    const days = facDaySlots[uid] || {};
    for (const [dayKey, daySlots] of Object.entries(days)) {
      const breakMin = getBreakDeduction(daySlots);
      breakDeductionTotal += breakMin;
      const att = attendanceMap.get(uid);
      const record = att?.records?.[dayKey];
      let dayMinutes = 0;
      if (record?.checkIn && record?.checkOut) {
        dayMinutes = Math.round((record.checkOut.toDate().getTime() - record.checkIn.toDate().getTime()) / 60000) - breakMin;
        entry.actualMinutes += dayMinutes;
        entry.hasAttendance = true;
        daySlots.forEach((sk) => {
          const s = entry.slots.find((x) => x.key === sk);
          if (s) s.attendanceMin = dayMinutes;
        });
      } else {
        dayMinutes = daySlots.length * CLASS_DURATION_MINUTES - breakMin;
        entry.actualMinutes += dayMinutes;
      }
      entry.days.push({
        dayKey,
        label: formatDateShort(dayKey),
        slotKeys: daySlots.sort(),
        checkIn: record?.checkIn || null,
        checkOut: record?.checkOut || null,
        minutes: dayMinutes,
      });
    }
    entry.days.sort((a, b) => a.dayKey.localeCompare(b.dayKey));
    entry.totalMinutes -= breakDeductionTotal;
    entry.breakMinutes = breakDeductionTotal;
  }

  // Carry-over map
  const carryOverMap = new Map<string, number>();
  carryOvers.forEach((c) => carryOverMap.set(c.facilitatorId, c.amount || 0));

  // シフトは無いが先月の保留分だけがあるファシリテーターも payroll に含める
  for (const c of carryOvers) {
    if (!payrollMap.has(c.facilitatorId) && (c.amount || 0) > 0) {
      const userProfile = users.find((u) => u.uid === c.facilitatorId);
      const classCount = userProfile?.classCount || 0;
      const effectiveRate = getEffectiveRateForMonth(monthId, classCount, userProfile?.hourlyRate || 0);
      const bank = userProfile?.bankAccount;
      payrollMap.set(c.facilitatorId, {
        uid: c.facilitatorId,
        name: userProfile?.nickname || userProfile?.displayName || c.facilitatorId,
        hourlyRate: effectiveRate,
        isTrainingRate: classCount >= 1 && classCount <= 3,
        transportCost: 0,
        slotCount: 0,
        totalMinutes: 0,
        classPay: 0,
        totalPay: 0,
        actualMinutes: 0,
        actualClassPay: 0,
        actualTotalPay: 0,
        hasAttendance: false,
        breakMinutes: 0,
        bankInfo: bank ? `${bank.bankName} ${bank.branchName} (${bank.accountType}) ${bank.accountNumber} ${bank.accountHolder}` : "",
        slots: [],
        days: [],
        carryOverIn: 0,
        subtotal: 0,
        finalTotal: 0,
        isDeferred: false,
      });
    }
  }

  // Calculate pay
  const hasAnyAttendance = Array.from(payrollMap.values()).some((p) => p.hasAttendance);
  const payrolls: FacilitatorPayroll[] = [];
  for (const entry of payrollMap.values()) {
    entry.classPay = Math.round(entry.hourlyRate * (entry.totalMinutes / 60));
    entry.totalPay = entry.classPay + entry.transportCost;
    entry.actualClassPay = Math.round(entry.hourlyRate * (entry.actualMinutes / 60));
    entry.actualTotalPay = entry.actualClassPay + entry.transportCost;
    entry.slots.sort((a, b) => a.key.localeCompare(b.key));
    entry.carryOverIn = carryOverMap.get(entry.uid) || 0;
    const thisMonthPay = hasAnyAttendance ? entry.actualTotalPay : entry.totalPay;
    entry.subtotal = thisMonthPay + entry.carryOverIn;
    entry.isDeferred = entry.subtotal > 0 && entry.subtotal <= PAYMENT_MIN_THRESHOLD;
    entry.finalTotal = entry.isDeferred ? 0 : entry.subtotal;
    payrolls.push(entry);
  }
  payrolls.sort((a, b) => a.name.localeCompare(b.name));

  const grandTotal = payrolls.reduce((sum, p) => sum + p.finalTotal, 0);
  const totalSlots = payrolls.reduce((sum, p) => sum + p.slotCount, 0);
  const deferredTotal = payrolls.reduce((sum, p) => sum + (p.isDeferred ? p.subtotal : 0), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => router.push("/admin")} className="text-sm text-brand-600 mb-4 inline-block">
        ← ダッシュボード
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-6">
        {isDemo ? "デモ" : `${year}年${month}月`} 支払い計算
      </h1>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-3">
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
      {deferredTotal > 0 && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-800">
          支払額が ¥{PAYMENT_MIN_THRESHOLD.toLocaleString()} 以下のファシリテーターは翌月に繰り越し（合計 ¥{deferredTotal.toLocaleString()}）
        </div>
      )}
      {openReportsTotal > 0 && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-xs text-red-800">
          ⚠ ファシリテーターから未対応の不備報告が {openReportsTotal} 件あります
        </div>
      )}
      {openReportsTotal === 0 && deferredTotal === 0 && <div className="mb-6" />}

      {/* Per facilitator */}
      <div className="space-y-3">
        {payrolls.map((p) => {
          const displayClassPay = p.hasAttendance ? p.actualClassPay : p.classPay;
          const displayMinutes = p.hasAttendance ? p.actualMinutes : p.totalMinutes;
          const thisMonthPay = hasAnyAttendance ? p.actualTotalPay : p.totalPay;
          const conf = confirmationMap.get(p.uid);
          const isConfirmed = !!conf;
          const isProcessing = confirming === p.uid;
          const carryInputValue = carryOverInputs[p.uid] ?? "";
          const isSavingCarry = savingCarry === p.uid;
          return (
            <div key={p.uid} className={`bg-white rounded-xl border overflow-hidden ${isConfirmed ? "border-green-300" : p.isDeferred ? "border-amber-300" : "border-gray-200"}`}>
              <div className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-800">{p.name}</span>
                    {p.isTrainingRate && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">研修</span>
                    )}
                    {p.isDeferred && !isConfirmed && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">次月繰り越し</span>
                    )}
                    {isConfirmed && (
                      <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">確定済み</span>
                    )}
                  </div>
                  {p.slotCount > 0 && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {p.hourlyRate > 0 ? `¥${p.hourlyRate.toLocaleString()}/h` : "時給未設定"}
                      {p.isTrainingRate && "（研修時給）"}
                      {" × "}{p.slotCount}コマ（{displayMinutes}分{p.hasAttendance ? " 実績" : ""}{p.breakMinutes > 0 ? ` 休憩−${p.breakMinutes}分` : ""}）= ¥{displayClassPay.toLocaleString()}
                    </div>
                  )}
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
                  {isConfirmed && conf && (
                    <div className="text-[10px] text-green-600 mt-0.5">
                      {conf.confirmedAt.toDate().toLocaleDateString("ja-JP")} 確定
                      {conf.isDeferred && `（¥${(conf.carryOverOut || 0).toLocaleString()} を翌月繰り越し）`}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  {p.hourlyRate === 0 && p.slotCount > 0 ? (
                    <div className="text-lg font-bold text-red-500">要設定</div>
                  ) : p.isDeferred ? (
                    <>
                      <div className="text-xs text-gray-400 line-through">¥{p.subtotal.toLocaleString()}</div>
                      <div className="text-lg font-bold text-amber-600">¥0</div>
                      <div className="text-[10px] text-amber-600">翌月繰越</div>
                    </>
                  ) : (
                    <div className="text-lg font-bold text-brand-700">¥{p.finalTotal.toLocaleString()}</div>
                  )}
                </div>
              </div>
              {/* 先月の保留分 + 小計 */}
              <div className="px-4 py-2 border-t border-gray-100 bg-amber-50/30">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-xs text-gray-600 flex items-center gap-2">
                    先月の保留分
                    <span className="text-gray-400">¥</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={carryInputValue}
                      onChange={(e) => handleCarryOverChange(p.uid, e.target.value)}
                      onBlur={() => handleCarryOverBlur(p.uid)}
                      disabled={isConfirmed}
                      placeholder="0"
                      className="border border-gray-300 rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-100"
                    />
                    {isSavingCarry && (
                      <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-brand-600" />
                    )}
                  </label>
                  <div className="text-xs text-gray-500">
                    今月分 ¥{thisMonthPay.toLocaleString()}
                    {p.carryOverIn > 0 && ` + 保留 ¥${p.carryOverIn.toLocaleString()}`}
                    {" = "}
                    <span className="font-medium text-gray-700">¥{p.subtotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              {/* 出退勤記録 */}
              {p.days.length > 0 && (
              <div className="bg-gray-50 px-4 py-2 border-t border-gray-100 space-y-2">
                {p.days.map((d) => {
                  const slotTimes = d.slotKeys.map((k) => k.split("_")[1]).join(", ");
                  const isSaving = saving?.startsWith(`${p.uid}_${d.dayKey}`);
                  return (
                    <div key={d.dayKey} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-gray-600 w-20 shrink-0">{d.label}</span>
                      <span className="text-[10px] text-gray-400 w-16 shrink-0">{slotTimes}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-400">IN</span>
                        <input
                          type="time"
                          value={d.checkIn ? timestampToTimeString(d.checkIn) : ""}
                          onChange={(e) => handleEditTime(p.uid, d.dayKey, "checkIn", e.target.value)}
                          className="border border-gray-300 rounded px-1.5 py-0.5 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-400">OUT</span>
                        <input
                          type="time"
                          value={d.checkOut ? timestampToTimeString(d.checkOut) : ""}
                          onChange={(e) => handleEditTime(p.uid, d.dayKey, "checkOut", e.target.value)}
                          className="border border-gray-300 rounded px-1.5 py-0.5 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      {isSaving && (
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-brand-600" />
                      )}
                      {d.checkIn && d.checkOut && (
                        <span className="text-[10px] text-gray-400">
                          {Math.round((d.checkOut.toDate().getTime() - d.checkIn.toDate().getTime()) / 60000)}分
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
              {/* ファシリからの報告 */}
              {(reportsByUid.get(p.uid) || []).length > 0 && (
                <div className="bg-amber-50/50 px-4 py-2 border-t border-amber-200 space-y-2">
                  <div className="text-xs font-medium text-amber-800">
                    ファシリからの報告（{(reportsByUid.get(p.uid) || []).filter((r) => r.status === "open").length}件 未対応 / {(reportsByUid.get(p.uid) || []).length}件）
                  </div>
                  {(reportsByUid.get(p.uid) || []).map((r) => {
                    const isOpen = r.status === "open";
                    const processing = resolvingReport === r.id;
                    return (
                      <div
                        key={r.id}
                        className={`text-xs rounded-lg border p-2 ${
                          isOpen ? "bg-white border-amber-300" : "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              isOpen
                                ? "bg-amber-100 text-amber-800"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {isOpen ? "未対応" : "対応済み"}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {r.createdAt.toDate().toLocaleString("ja-JP")}
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap break-words text-gray-700 mb-1">
                          {r.message}
                        </div>
                        {r.adminResponse && (
                          <div className="mt-1 pt-1 border-t border-gray-200 text-gray-600">
                            <div className="text-[10px] font-medium mb-0.5">あなたの返信</div>
                            <div className="whitespace-pre-wrap break-words">{r.adminResponse}</div>
                          </div>
                        )}
                        {isOpen ? (
                          <div className="mt-2 flex gap-2">
                            <input
                              type="text"
                              value={responseInputs[r.id] || ""}
                              onChange={(e) =>
                                setResponseInputs((prev) => ({
                                  ...prev,
                                  [r.id]: e.target.value,
                                }))
                              }
                              placeholder="返信（任意）"
                              className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                              disabled={processing}
                            />
                            <button
                              onClick={() => handleResolveReport(r)}
                              disabled={processing}
                              className="px-3 py-1 text-[11px] font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              {processing ? "..." : "対応済みにする"}
                            </button>
                          </div>
                        ) : (
                          <div className="mt-1 flex justify-end">
                            <button
                              onClick={() => handleReopenReport(r)}
                              disabled={processing}
                              className="text-[10px] text-gray-500 hover:text-gray-700 disabled:opacity-50"
                            >
                              {processing ? "..." : "未対応に戻す"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* 確定/取消ボタン */}
              <div className="px-4 py-2 border-t border-gray-100 flex justify-end gap-2">
                <button
                  onClick={() => router.push(`/admin/payroll/${monthId}/preview/${p.uid}`)}
                  className="px-3 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 rounded-lg hover:bg-brand-100"
                  title="このファシリテーターが見ている給与画面を確認"
                >
                  ファシリ画面を確認
                </button>
                {isConfirmed ? (
                  <button
                    onClick={() => handleCancel(p.uid, p.name)}
                    disabled={isProcessing}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  >
                    {isProcessing ? "処理中..." : "確定取消"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleConfirm(p)}
                    disabled={isProcessing || (p.slotCount > 0 && p.hourlyRate === 0) || p.subtotal === 0}
                    className={`px-4 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50 ${p.isDeferred ? "bg-amber-500 hover:bg-amber-600" : "bg-green-600 hover:bg-green-700"}`}
                  >
                    {isProcessing ? "処理中..." : p.isDeferred ? "繰り越して確定" : "確定"}
                  </button>
                )}
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
