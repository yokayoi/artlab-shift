"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSchedule, createSchedule, updateSchedule, updateScheduleStatus } from "@/lib/firebase/firestore";
import { MonthSchedule, ClassType, DaySchedule } from "@/lib/types";
import { generateDaySchedules, parseMonthId, formatDateShort, formatDeadline, generateDefaultSlots } from "@/lib/utils/dateCalc";
import { CLASS_TYPES, CLASS_TYPE_COLORS, TIME_SLOTS } from "@/lib/utils/constants";

export default function AdminScheduleSetupPage({ params }: { params: Promise<{ monthId: string }> }) {
  const { monthId } = use(params);
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null);
  const [days, setDays] = useState<DaySchedule[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingDate, setAddingDate] = useState(false);
  const [newDate, setNewDate] = useState("");

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push("/");
    }
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      const existing = await getSchedule(monthId);
      if (existing) {
        setSchedule(existing);
        setDays(existing.days);
      } else {
        const { year, month } = parseMonthId(monthId);
        setDays(generateDaySchedules(year, month));
      }
      setDataLoading(false);
    })();
  }, [user, isAdmin, monthId]);

  const setClassType = (dayIndex: number, slotIndex: number, classType: ClassType | null) => {
    setDays((prev) => {
      const updated = [...prev];
      updated[dayIndex] = {
        ...updated[dayIndex],
        slots: updated[dayIndex].slots.map((s, i) =>
          i === slotIndex ? { ...s, classType } : s
        ),
      };
      return updated;
    });
  };

  const handleAddDate = () => {
    if (!newDate) return;
    const existing = days.find((d) => d.date === newDate);
    if (existing) return;
    const date = new Date(newDate);
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    const newDay: DaySchedule = {
      date: newDate,
      dayLabel: `追加日(${dayNames[date.getDay()]})`,
      slots: generateDefaultSlots(),
    };
    setDays((prev) => [...prev, newDay].sort((a, b) => a.date.localeCompare(b.date)));
    setNewDate("");
    setAddingDate(false);
  };

  const handleRemoveDate = (dateToRemove: string) => {
    setDays((prev) => prev.filter((d) => d.date !== dateToRemove));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    if (schedule) {
      await updateSchedule(monthId, { days });
    } else {
      await createSchedule(monthId, days, user.uid);
    }
    setSaving(false);
    router.push("/admin");
  };

  const handleStartCollecting = async () => {
    if (!user) return;
    setSaving(true);
    if (!schedule) {
      await createSchedule(monthId, days, user.uid);
    } else {
      await updateSchedule(monthId, { days });
    }
    await updateScheduleStatus(monthId, "collecting");
    setSaving(false);
    router.push("/admin");
  };

  const { year, month } = parseMonthId(monthId);
  const isDraft = !schedule || schedule.status === "draft";

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => router.push("/admin")} className="text-sm text-brand-600 mb-4 inline-block">
        ← ダッシュボード
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-2">
        {year}年{month}月 スケジュール設定
      </h1>

      {/* Deadline info */}
      <div className="mb-6 text-sm text-gray-500">
        回答締め切り: <span className="font-medium">{formatDeadline(year, month)}</span>
        <span className="text-xs text-gray-400 ml-1">（開催1週間前）</span>
      </div>

      <div className="space-y-4">
        {days.map((day, dayIndex) => (
          <div key={day.date} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
              <div>
                <span className="font-medium text-gray-700">{formatDateShort(day.date)}</span>
                <span className="text-sm text-gray-500 ml-2">{day.dayLabel}</span>
              </div>
              {isDraft && (
                <button
                  onClick={() => handleRemoveDate(day.date)}
                  className="text-gray-400 hover:text-red-500 text-sm transition-colors"
                >
                  削除
                </button>
              )}
            </div>
            <div className="p-4 space-y-3">
              {day.slots.map((slot, slotIndex) => (
                <div key={slot.time} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-600 w-12">{slot.time}</span>
                  {!slot.needsFacilitator ? (
                    <span className="text-xs text-gray-400">ファシリテーター不要</span>
                  ) : (
                    <div className="flex gap-2">
                      {CLASS_TYPES.map((ct) => {
                        const colors = CLASS_TYPE_COLORS[ct];
                        const isSelected = slot.classType === ct;
                        return (
                          <button
                            key={ct}
                            onClick={() => isDraft ? setClassType(dayIndex, slotIndex, isSelected ? null : ct) : null}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!isDraft ? "cursor-default" : ""}`}
                            style={
                              isSelected
                                ? { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }
                                : { backgroundColor: "white", color: "#9CA3AF", borderColor: "#E5E7EB" }
                            }
                          >
                            {ct}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add Date */}
      {isDraft && (
        <div className="mt-4">
          {addingDate ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={handleAddDate}
                className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
              >
                追加
              </button>
              <button
                onClick={() => setAddingDate(false)}
                className="px-4 py-2 text-gray-500 text-sm"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingDate(true)}
              className="text-sm text-brand-600 hover:text-brand-700"
            >
              + 日程を追加
            </button>
          )}
        </div>
      )}

      {isDraft && (
        <div className="mt-6 space-y-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:bg-gray-100 transition-colors"
          >
            {saving ? "保存中..." : "下書き保存"}
          </button>
          <button
            onClick={handleStartCollecting}
            disabled={saving}
            className="w-full py-3 rounded-xl font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 transition-colors"
          >
            {saving ? "保存中..." : "回答受付を開始する"}
          </button>
        </div>
      )}
    </div>
  );
}
