"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getUser,
  getSchedule,
  getShift,
  getAttendance,
  getPayrollConfirmation,
  getPayrollCarryOver,
} from "@/lib/firebase/firestore";
import {
  MonthSchedule,
  ShiftAssignment,
  UserProfile,
  Attendance,
  PayrollConfirmation,
  PayrollCarryOver,
} from "@/lib/types";
import {
  parseMonthId,
  getSlotKey,
  formatDateShort,
  getSlotDate,
  timestampToTimeString,
} from "@/lib/utils/dateCalc";
import {
  CLASS_DURATION_MINUTES,
  TRAINING_MAX,
  getEffectiveRateForMonth,
  getBreakDeduction,
  DEMO_MONTH_ID,
  getSatokoPayrollThanks,
} from "@/lib/utils/constants";

export default function PayrollFacilitatorPreviewPage({
  params,
}: {
  params: Promise<{ monthId: string; uid: string }>;
}) {
  const { monthId, uid } = use(params);
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null);
  const [shift, setShift] = useState<ShiftAssignment | null>(null);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [payrollConf, setPayrollConf] = useState<PayrollConfirmation | null>(null);
  const [carryOver, setCarryOver] = useState<PayrollCarryOver | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [user, isAdmin, loading, router]);

  const loadData = useCallback(async () => {
    if (!user || !isAdmin) return;
    const [prof, sched, shiftData] = await Promise.all([
      getUser(uid),
      getSchedule(monthId),
      getShift(monthId),
    ]);
    setProfile(prof);
    setSchedule(sched);
    setShift(shiftData);
    try {
      const [att, conf, carry] = await Promise.all([
        getAttendance(monthId, uid),
        getPayrollConfirmation(monthId, uid),
        getPayrollCarryOver(monthId, uid),
      ]);
      setAttendance(att);
      setPayrollConf(conf);
      setCarryOver(carry);
    } catch {
      // ignore
    }
    setDataLoading(false);
  }, [user, isAdmin, monthId, uid]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { year, month } = parseMonthId(monthId);
  const isDemo = monthId === DEMO_MONTH_ID;

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button
          onClick={() => router.push(`/admin/payroll/${monthId}`)}
          className="text-sm text-brand-600 mb-4 inline-block"
        >
          ← 支払い計算に戻る
        </button>
        <div className="text-center py-12 text-gray-400">
          ファシリテーターが見つかりません
        </div>
      </div>
    );
  }

  // Compute the payroll card exactly like the facilitator side
  const mySlots =
    shift && schedule
      ? Object.entries(shift.assignments)
          .filter(([, uids]) => uids.includes(uid))
          .map(([key]) => key)
      : [];
  const classCount = profile.classCount || 0;
  const effectiveRate = getEffectiveRateForMonth(monthId, classCount, profile.hourlyRate || 0);
  const trainingRate = classCount >= 1 && classCount <= TRAINING_MAX;
  const transportCost = profile.transportCost || 0;

  const slotsByDay: Record<string, string[]> = {};
  mySlots.forEach((key) => {
    const dayKey = getSlotDate(key);
    if (!slotsByDay[dayKey]) slotsByDay[dayKey] = [];
    slotsByDay[dayKey].push(key);
  });

  let actualMinutes = 0;
  let hasAttendance = false;
  let totalBreakDeduction = 0;
  for (const [dayKey, daySlots] of Object.entries(slotsByDay)) {
    const breakMin = getBreakDeduction(daySlots);
    totalBreakDeduction += breakMin;
    const record = attendance?.records?.[dayKey];
    if (record?.checkIn && record?.checkOut) {
      actualMinutes +=
        Math.round(
          (record.checkOut.toDate().getTime() - record.checkIn.toDate().getTime()) / 60000
        ) - breakMin;
      hasAttendance = true;
    } else {
      actualMinutes += daySlots.length * CLASS_DURATION_MINUTES - breakMin;
    }
  }

  const scheduledMinutes = mySlots.length * CLASS_DURATION_MINUTES - totalBreakDeduction;
  const displayMinutes = hasAttendance ? actualMinutes : scheduledMinutes;
  const classPay = Math.round(effectiveRate * (displayMinutes / 60));
  const totalPay = classPay + (mySlots.length > 0 ? transportCost : 0);
  const slotLabels: Record<string, string> = {};
  if (schedule) {
    schedule.days.forEach((day) => {
      day.slots.forEach((slot) => {
        slotLabels[getSlotKey(day.date, slot.time)] = `${formatDateShort(day.date)} ${slot.time}`;
      });
    });
  }

  const displayName = profile.nickname || profile.displayName || uid;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={() => router.push(`/admin/payroll/${monthId}`)}
        className="text-sm text-brand-600 mb-4 inline-block"
      >
        ← 支払い計算に戻る
      </button>

      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-gray-800">
            {isDemo ? "デモ" : `${year}年${month}月`} ファシリ画面プレビュー
          </h1>
          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
            管理者プレビュー
          </span>
        </div>
        <div className="text-sm text-gray-500 mt-1">
          {displayName} さんに表示されている給与画面
        </div>
      </div>

      {/* 参考: 管理者のみ見える carryOver 情報 */}
      {carryOver && carryOver.amount > 0 && (
        <div className="mb-3 bg-purple-50 border border-purple-200 rounded-xl px-4 py-2 text-xs text-purple-800">
          管理メモ: この月には先月の保留分 ¥{carryOver.amount.toLocaleString()} が登録されています
          {carryOver.note ? `（${carryOver.note}）` : ""}。現状ファシリ画面には表示されません。
        </div>
      )}
      {payrollConf?.isDeferred && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-800">
          管理メモ: 今月分 ¥{(payrollConf.carryOverOut || 0).toLocaleString()} は翌月に繰り越して確定済みです。
        </div>
      )}

      {/* ===== 以下、ファシリ画面の「今月の給与」カードと同じ表示 ===== */}
      <div
        className={`bg-white rounded-xl border p-4 ${
          payrollConf ? "border-green-300" : "border-gray-200"
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-brand-700">{month}月の給与</h2>
            {payrollConf && (
              <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                確定済み
              </span>
            )}
          </div>
          <span
            className={`text-sm font-medium px-2 py-0.5 rounded ${
              effectiveRate > 0 ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-500"
            }`}
          >
            {effectiveRate > 0
              ? `時給 ¥${(payrollConf?.hourlyRate || effectiveRate).toLocaleString()}${
                  trainingRate ? "（研修）" : ""
                }`
              : "時給未設定"}
          </span>
        </div>
        {payrollConf ? (
          <>
            <div className="text-xs text-green-600 mb-3">
              {payrollConf.confirmedAt.toDate().toLocaleDateString("ja-JP")} 確定
            </div>
            <div className="space-y-1 mb-3">
              {payrollConf.days.map((d) => (
                <div key={d.dayKey} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-600 w-20">{formatDateShort(d.dayKey)}</span>
                    {d.checkIn && d.checkOut ? (
                      <span className="text-gray-500">
                        IN {timestampToTimeString(d.checkIn)} — OUT {timestampToTimeString(d.checkOut)}
                      </span>
                    ) : (
                      <span className="text-gray-400">未打刻</span>
                    )}
                  </div>
                  <span className="text-gray-500">
                    {d.minutes}分 × {d.slotCount}コマ
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-500">
                {payrollConf.slotCount}コマ（{payrollConf.totalMinutes}分
                {payrollConf.breakMinutes > 0 ? ` 休憩−${payrollConf.breakMinutes}分` : ""}）
              </div>
              <div className="text-sm text-gray-700">
                ¥{payrollConf.classPay.toLocaleString()}
              </div>
            </div>
            {payrollConf.transportCost > 0 && (
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-500">交通費</div>
                <div className="text-sm text-gray-700">
                  ¥{payrollConf.transportCost.toLocaleString()}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="text-sm font-medium text-gray-700">合計</div>
              <div className="text-2xl font-bold text-brand-700">
                ¥{payrollConf.totalPay.toLocaleString()}
              </div>
            </div>
          </>
        ) : mySlots.length === 0 ? (
          <div className="text-sm text-gray-400">シフト未割当</div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-500">
                {mySlots.length}コマ（{displayMinutes}分
                {hasAttendance ? " 実績" : ""}
                {totalBreakDeduction > 0 ? ` 休憩−${totalBreakDeduction}分` : ""}）
              </div>
              <div className="text-sm text-gray-700">¥{classPay.toLocaleString()}</div>
            </div>
            {transportCost > 0 && (
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-500">交通費</div>
                <div className="text-sm text-gray-700">¥{transportCost.toLocaleString()}</div>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="text-sm font-medium text-gray-700">合計（見込み）</div>
              <div
                className={`text-2xl font-bold ${
                  effectiveRate > 0 ? "text-brand-700" : "text-gray-400"
                }`}
              >
                {effectiveRate > 0 ? `¥${totalPay.toLocaleString()}` : "—"}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {mySlots.sort().map((key) => (
                <span
                  key={key}
                  className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-0.5 text-gray-600"
                >
                  {slotLabels[key] || key}
                </span>
              ))}
            </div>
          </>
        )}

        {/* AI-SATO-β からの「ありがとう」一言（管理者プレビューでも実画面と揃えて表示） */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="bg-pink-50 rounded-xl border border-pink-200 p-3 flex items-start gap-3">
            <img
              src="/sato.png"
              alt="AI-SATO-β"
              className="rounded-full object-cover shrink-0"
              style={{ width: 38, height: 38 }}
            />
            <div>
              <div className="text-[10px] font-medium text-pink-600 mb-0.5">
                AI-SATO-β からの感謝
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {getSatokoPayrollThanks(displayName, `${monthId}-${uid}`)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
