"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getClassDays, formatMonthId } from "@/lib/utils/dateCalc";

export default function CalendarPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => setCurrentYear((y) => y - 1)} className="p-2 text-gray-400 hover:text-gray-600">&lt;</button>
        <h1 className="text-xl font-bold text-gray-800">{currentYear}年 クラス開催予定日</h1>
        <button onClick={() => setCurrentYear((y) => y + 1)} className="p-2 text-gray-400 hover:text-gray-600">&gt;</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {months.map((month) => {
          const classDays = getClassDays(currentYear, month);
          const classDates = new Set(classDays.map((d) => parseInt(d.date.split("-")[2])));
          const daysInMonth = new Date(currentYear, month, 0).getDate();
          const firstDayOfWeek = new Date(currentYear, month - 1, 1).getDay();
          const monthId = formatMonthId(currentYear, month);
          const today = new Date();
          const isCurrentMonth = today.getFullYear() === currentYear && today.getMonth() + 1 === month;

          return (
            <Link
              key={month}
              href={`/schedule/${monthId}`}
              className={`bg-white rounded-xl border p-3 hover:shadow-md transition-shadow ${
                isCurrentMonth ? "border-brand-300 ring-1 ring-brand-200" : "border-gray-200"
              }`}
            >
              <div className={`text-sm font-bold mb-2 ${isCurrentMonth ? "text-brand-700" : "text-gray-700"}`}>
                {month}月
              </div>
              <div className="grid grid-cols-7 gap-0 text-center">
                {dayNames.map((d) => (
                  <div key={d} className="text-[9px] text-gray-400 leading-4">{d}</div>
                ))}
                {Array.from({ length: firstDayOfWeek }, (_, i) => (
                  <div key={`e${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const isClassDay = classDates.has(day);
                  const date = new Date(currentYear, month - 1, day);
                  const isSun = date.getDay() === 0;
                  const isSat = date.getDay() === 6;
                  return (
                    <div
                      key={day}
                      className={`text-[10px] leading-5 rounded-full ${
                        isClassDay
                          ? "bg-brand-500 text-white font-bold"
                          : isSun
                          ? "text-red-400"
                          : isSat
                          ? "text-blue-400"
                          : "text-gray-600"
                      }`}
                    >
                      {day}
                    </div>
                  );
                })}
              </div>
              {classDays.length > 0 && (
                <div className="mt-2 text-[10px] text-gray-500">
                  {classDays.map((d) => `${parseInt(d.date.split("-")[2])}日`).join("・")}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
