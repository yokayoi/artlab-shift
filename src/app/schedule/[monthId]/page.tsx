"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSchedule, getAvailability, saveAvailability, getShift, getActiveAnnouncements, getCollectingSchedules } from "@/lib/firebase/firestore";
import { MonthSchedule, Availability, ShiftAssignment, Announcement } from "@/lib/types";
import { getSlotKey, parseMonthId, formatMonthId, formatDateShort, formatDeadline, isDeadlinePassed } from "@/lib/utils/dateCalc";
import { CLASS_TYPE_COLORS, STATUS_LABELS, CLASS_DURATION_MINUTES, TRAINING_MAX, LAUNCH_YEAR, LAUNCH_MONTH, getTier, getNextTier, isTraining, getEffectiveRate } from "@/lib/utils/constants";

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
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [collectingMonths, setCollectingMonths] = useState<string[]>([]);
  const [satokoMsg, setSatokoMsg] = useState<string>("");

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
      try {
        const [anns, collectingScheds] = await Promise.all([
          getActiveAnnouncements(),
          getCollectingSchedules(),
        ]);
        setAnnouncements(anns);
        setCollectingMonths(collectingScheds.map((s) => s.id).filter((id) => id !== monthId));
      } catch {
        // announcements collection may not have rules deployed yet
      }
      if (avail) {
        setMyAvailability(avail.slots);
        setSubmitted(true);
      } else if (sched) {
        const initial: Record<string, boolean> = {};
        sched.days.forEach((day) =>
          day.slots.forEach((slot) => {
            if (slot.needsFacilitator && slot.classType) {
              initial[getSlotKey(day.date, slot.time)] = false;
            }
          })
        );
        setMyAvailability(initial);
      }
      setDataLoading(false);
    })();
  }, [user, monthId]);

  useEffect(() => {
    if (!profile) return;
    const name = profile.nickname || profile.displayName.split(" ")[0];
    const classCount = profile.classCount || 0;
    fetch("/api/satoko", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, classCount }),
    })
      .then((res) => res.json())
      .then((data) => setSatokoMsg(data.message))
      .catch(() => setSatokoMsg(`${name}さん、今日もアートで世界を広げよう！`));
  }, [profile]);

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
  const isFirstMonth = year === LAUNCH_YEAR && month === LAUNCH_MONTH;

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  const isPublished = schedule?.status === "published" || schedule?.status === "shift_created";

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Calendar Link */}
      <div className="flex justify-end mb-2">
        <button
          onClick={() => router.push("/schedule/calendar")}
          className="text-xs text-gray-600 bg-white border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
        >
          年間カレンダー
        </button>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="mb-4 space-y-2">
          {announcements.map((ann) => (
            <div key={ann.id} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <div className="text-sm font-medium text-amber-800">{ann.title}</div>
              {ann.body && <p className="text-sm text-amber-700 mt-1 whitespace-pre-wrap">{ann.body}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Collecting Month Banner */}
      {collectingMonths.length > 0 && (
        <div className="mb-4 space-y-2">
          {collectingMonths.map((cmId) => {
            const { year: cy, month: cm } = parseMonthId(cmId);
            return (
              <button
                key={cmId}
                onClick={() => router.push(`/schedule/${cmId}`)}
                className="w-full bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 text-left hover:bg-brand-100 transition-colors"
              >
                <span className="text-sm text-brand-700">
                  {cy}年{cm}月のシフト希望を受付中です
                </span>
                <span className="text-xs text-brand-500 ml-2">&rarr; 回答する</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-6">
        {isFirstMonth ? (
          <div className="p-2 w-8" />
        ) : (
          <button
            onClick={() => router.push(`/schedule/${prevMonth}`)}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            &lt;
          </button>
        )}
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
          {/* Status Badge & Deadline */}
          <div className="text-center mb-6">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
              schedule.status === "collecting" ? "bg-brand-100 text-brand-700" : "bg-green-100 text-green-700"
            }`}>
              {STATUS_LABELS[schedule.status]}
            </span>
            {schedule.status === "collecting" && (
              <div className="mt-2 text-sm">
                {isDeadlinePassed(year, month, schedule?.deadline) ? (
                  <span className="text-red-600 font-medium">締め切りを過ぎています</span>
                ) : (
                  <span className="text-gray-500">回答締め切り: <span className="font-medium">{formatDeadline(year, month, schedule?.deadline)}</span></span>
                )}
              </div>
            )}
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

                    if (!slot.needsFacilitator || !slot.classType) {
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
                        <div
                          className="text-[10px] px-1 py-0.5 rounded mb-2 inline-block"
                          style={{ backgroundColor: colors!.bg, color: colors!.text }}
                        >
                          {slot.classType}
                        </div>
                        {isPublished && assignedNames ? (
                          <div className="mt-1">
                            {isAssignedToMe ? (
                              <div className="w-8 h-8 mx-auto rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-bold">
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
                                ? "bg-brand-500 border-brand-500 text-white"
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
                className="w-full py-3 rounded-xl font-medium text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 disabled:bg-gray-300 transition-colors"
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
            <div className="mt-6 bg-brand-50 rounded-xl p-4">
              <h3 className="font-medium text-brand-800 mb-2">あなたのシフト</h3>
              {schedule.days.flatMap((day) =>
                day.slots
                  .filter((slot) => {
                    const key = getSlotKey(day.date, slot.time);
                    return shift.assignments?.[key]?.includes(user?.uid || "");
                  })
                  .map((slot) => (
                    <div key={getSlotKey(day.date, slot.time)} className="text-sm text-brand-700">
                      {formatDateShort(day.date)} {slot.time} {slot.classType || ""}
                    </div>
                  ))
              )}
            </div>
          )}
        </>
      )}

      {/* AI-SATO-β から一言 */}
      {profile && (
        <div className="mt-8 bg-pink-50 rounded-xl border border-pink-200 p-4">
          <div className="flex items-start gap-3">
            <img src="/sato.png" alt="AI-SATO-β" className="rounded-full object-cover shrink-0" style={{ width: 46, height: 46 }} />
            <div>
              <div className="text-xs font-medium text-pink-600 mb-1">AI-SATO-β から一言</div>
              {satokoMsg ? (
                <p className="text-sm text-gray-700">{satokoMsg}</p>
              ) : (
                <p className="text-sm text-gray-400 animate-pulse">考え中...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 参加実績 */}
      {profile && (() => {
        const classCount = profile.classCount || 0;
        const tier = getTier(classCount);
        const nextTier = getNextTier(classCount);
        const training = isTraining(classCount);
        return (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-medium text-gray-800 mb-3">参加実績</h2>
            <div className="flex items-center gap-3 mb-3">
              <div className="text-3xl font-bold text-brand-700">{classCount}</div>
              <div className="text-sm text-gray-500">クラス参加</div>
              {training && (
                <span className="px-3 py-1 rounded-full text-xs font-medium border bg-blue-100 text-blue-700 border-blue-300">
                  📚 研修中（{classCount}/{TRAINING_MAX}）
                </span>
              )}
              {!training && tier && (
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${tier.color}`}>
                  {tier.emoji} {tier.label}
                </span>
              )}
            </div>
            {training && (
              <div className="text-xs text-blue-600">
                研修期間あと <span className="font-bold">{TRAINING_MAX - classCount}回</span>で卒業！
              </div>
            )}
            {!training && nextTier && (
              <div className="text-xs text-gray-500">
                次のランク「{nextTier.label}」まであと <span className="font-bold text-brand-600">{nextTier.remaining}回</span>
              </div>
            )}
            {!nextTier && tier && (
              <div className="text-xs text-brand-600 font-medium">最高ランク達成！</div>
            )}
            <div className="mt-3 relative">
              {/* Tier icons above bar */}
              <div className="relative h-6 mb-1">
                <span className="absolute text-center text-[10px] -translate-x-1/2" style={{ left: "0.5%" }} title="研修">📚</span>
                <span className="absolute text-center text-[10px] -translate-x-1/2" style={{ left: "10%" }} title="ブロンズ">🥉</span>
                <span className="absolute text-center text-[10px] -translate-x-1/2" style={{ left: "26.7%" }} title="シルバー">🥈</span>
                <span className="absolute text-center text-[10px] -translate-x-1/2" style={{ left: "50%" }} title="ゴールド">🥇</span>
                <span className="absolute text-center text-[10px] -translate-x-1/2" style={{ left: "100%" }} title="プラチナ">💎</span>
              </div>
              <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all"
                  style={{ width: `${Math.min((classCount / 300) * 100, 100)}%` }}
                />
              </div>
              <div className="relative h-4 mt-1 text-[10px] text-gray-400">
                <span className="absolute -translate-x-1/2" style={{ left: "0.5%" }}>研修</span>
                <span className="absolute -translate-x-1/2" style={{ left: "10%" }}>30</span>
                <span className="absolute -translate-x-1/2" style={{ left: "26.7%" }}>80</span>
                <span className="absolute -translate-x-1/2" style={{ left: "50%" }}>150</span>
                <span className="absolute right-0">300</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 今月の給与 */}
      {profile && (() => {
        const mySlots = shift && schedule
          ? Object.entries(shift.assignments)
              .filter(([, uids]) => uids.includes(user?.uid || ""))
              .map(([key]) => key)
          : [];
        const classCount = profile.classCount || 0;
        const effectiveRate = getEffectiveRate(classCount, profile.hourlyRate || 0);
        const trainingRate = classCount >= 1 && classCount <= TRAINING_MAX;
        const transportCost = profile.transportCost || 0;
        const totalMinutes = mySlots.length * CLASS_DURATION_MINUTES;
        const classPay = Math.round(effectiveRate * (totalMinutes / 60));
        const totalPay = classPay + (mySlots.length > 0 ? transportCost : 0);
        const slotLabels: Record<string, string> = {};
        if (schedule) {
          schedule.days.forEach((day) => {
            day.slots.forEach((slot) => {
              slotLabels[getSlotKey(day.date, slot.time)] = `${formatDateShort(day.date)} ${slot.time}`;
            });
          });
        }
        return (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium text-gray-800">{month}月の給与</h2>
              <span className={`text-sm font-medium px-2 py-0.5 rounded ${effectiveRate > 0 ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-500"}`}>
                {effectiveRate > 0
                  ? `時給 ¥${effectiveRate.toLocaleString()}${trainingRate ? "（研修）" : ""}`
                  : "時給未設定"}
              </span>
            </div>
            {mySlots.length === 0 ? (
              <div className="text-sm text-gray-400">シフト未割当</div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-gray-500">
                    {mySlots.length}コマ（{totalMinutes}分）
                  </div>
                  <div className="text-sm text-gray-700">
                    ¥{classPay.toLocaleString()}
                  </div>
                </div>
                {transportCost > 0 && (
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-500">交通費</div>
                    <div className="text-sm text-gray-700">¥{transportCost.toLocaleString()}</div>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="text-sm font-medium text-gray-700">合計</div>
                  <div className={`text-2xl font-bold ${effectiveRate > 0 ? "text-brand-700" : "text-gray-400"}`}>
                    {effectiveRate > 0 ? `¥${totalPay.toLocaleString()}` : "—"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {mySlots.sort().map((key) => (
                    <span key={key} className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-0.5 text-gray-600">
                      {slotLabels[key] || key}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
