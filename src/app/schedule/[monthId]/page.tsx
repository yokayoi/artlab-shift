"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSchedule, getAvailability, saveAvailability, getShift } from "@/lib/firebase/firestore";
import { MonthSchedule, Availability, ShiftAssignment } from "@/lib/types";
import { getSlotKey, parseMonthId, formatMonthId, formatDateShort } from "@/lib/utils/dateCalc";
import { CLASS_TYPE_COLORS, STATUS_LABELS } from "@/lib/utils/constants";

export default function FacilitatorSchedulePage({ params }: { params: Promise<{ monthId: string }> }) {
  const { monthId } = use(params);
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null);
  const [myAvailability, setMyAvailability] = useState<Record<string, boolean>>({});
  const [shift, setShift] = useState<ShiftAssignment | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [sched, avail, shiftData] = await Promise.all([
        getSchedule(monthId),
        getAvailability(monthId, user.uid),
        getShift(monthId),
      ]);
      setSchedule(sched);
      setShift(shiftData);
      if (avail) {
        setMyAvailability(avail.slots);
        setSubmitted(true);
      } else if (sched) {
        const initial: Record<string, boolean> = {};
        sched.days.forEach((day) =>
          day.slots.forEach((slot) => {
            if (slot.needsFacilitator) {
              initial[getSlotKey(day.date, slot.time)] = false;
            }
          })
        );
        setMyAvailability(initial);
      }
      setDataLoading(false);
    })();
  }, [user, monthId]);

  const toggleSlot = (key: string) => {
    if (schedule?.status !== "collecting") return;
    setMyAvailability((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async () => {
    if (!user || !profile) return;
    setSaving(true);
    await saveAvailability(monthId, user.uid, profile.displayName, myAvailability);
    setSubmitted(true);
    setSaving(false);
  };

  const { year, month } = parseMonthId(monthId);
  const prevMonth = month === 1 ? formatMonthId(year - 1, 12) : formatMonthId(year, month - 1);
  const nextMonth = month === 12 ? formatMonthId(year + 1, 1) : formatMonthId(year, month + 1);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const isPublished = schedule?.status === "published" || schedule?.status === "shift_created";

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push(`/schedule/${prevMonth}`)}
          className="p-2 text-gray-400 hover:text-gray-600"
        >
          &lt;
        </button>
        <h1 className="text-xl font-bold text-gray-800">
          {year}年{month}月
        </h1>
        <button
          onClick={() => router.push(`/schedule/${nextMonth}`)}
          className="p-2 text-gray-400 hover:text-gray-600"
        >
          &gt;
        </button>
      </div>

      {!schedule ? (
        <div className="text-center py-12 text-gray-400">
          この月のスケジュールはまだ登録されていません
        </div>
      ) : schedule.status === "draft" ? (
        <div className="text-center py-12 text-gray-400">
          スケジュール準備中です
        </div>
      ) : (
        <>
          {/* Status Badge */}
          <div className="text-center mb-6">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
              schedule.status === "collecting" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
            }`}>
              {STATUS_LABELS[schedule.status]}
            </span>
          </div>

          {/* Schedule Grid */}
          <div className="space-y-4">
            {schedule.days.map((day) => (
              <div key={day.date} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-700">{formatDateShort(day.date)}</span>
                  <span className="text-sm text-gray-500 ml-2">{day.dayLabel}</span>
                </div>
                <div className="grid grid-cols-4 gap-0 divide-x divide-gray-100">
                  {day.slots.map((slot) => {
                    const key = getSlotKey(day.date, slot.time);
                    const isAvailable = myAvailability[key];
                    const colors = slot.classType ? CLASS_TYPE_COLORS[slot.classType] : null;
                    const assignedNames = shift?.assignmentNames?.[key];
                    const isAssignedToMe = shift?.assignments?.[key]?.includes(user?.uid || "");

                    if (!slot.needsFacilitator) {
                      return (
                        <div key={key} className="p-3 text-center bg-gray-50">
                          <div className="text-xs text-gray-400 mb-1">{slot.time}</div>
                          <div className="text-xs text-gray-300">-</div>
                        </div>
                      );
                    }

                    return (
                      <div key={key} className="p-3 text-center">
                        <div className="text-xs text-gray-500 mb-1">{slot.time}</div>
                        {colors && (
                          <div
                            className="text-[10px] px-1 py-0.5 rounded mb-2 inline-block"
                            style={{ backgroundColor: colors.bg, color: colors.text }}
                          >
                            {slot.classType}
                          </div>
                        )}
                        {isPublished && assignedNames ? (
                          <div className="mt-1">
                            {isAssignedToMe ? (
                              <div className="w-8 h-8 mx-auto rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">
                                出
                              </div>
                            ) : (
                              <div className="w-8 h-8 mx-auto rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-xs">
                                -
                              </div>
                            )}
                          </div>
                        ) : schedule.status === "collecting" ? (
                          <button
                            onClick={() => toggleSlot(key)}
                            className={`w-10 h-10 mx-auto rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all ${
                              isAvailable
                                ? "bg-blue-500 border-blue-500 text-white"
                                : "bg-white border-gray-300 text-gray-300"
                            }`}
                          >
                            {isAvailable ? "○" : "—"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Submit Button */}
          {schedule.status === "collecting" && (
            <div className="mt-6 px-4">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="w-full py-3 rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-300 transition-colors"
              >
                {saving ? "送信中..." : submitted ? "回答を更新する" : "回答を送信する"}
              </button>
              {submitted && (
                <p className="text-center text-sm text-green-600 mt-2">回答済みです</p>
              )}
            </div>
          )}

          {/* Published Shift Summary */}
          {isPublished && shift && (
            <div className="mt-6 bg-blue-50 rounded-xl p-4">
              <h3 className="font-medium text-blue-800 mb-2">あなたのシフト</h3>
              {schedule.days.flatMap((day) =>
                day.slots
                  .filter((slot) => {
                    const key = getSlotKey(day.date, slot.time);
                    return shift.assignments?.[key]?.includes(user?.uid || "");
                  })
                  .map((slot) => (
                    <div key={getSlotKey(day.date, slot.time)} className="text-sm text-blue-700">
                      {formatDateShort(day.date)} {slot.time} {slot.classType || ""}
                    </div>
                  ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
