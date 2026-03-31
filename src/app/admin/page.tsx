"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getSchedule, getMonthAvailabilities, updateScheduleStatus } from "@/lib/firebase/firestore";
import { MonthSchedule } from "@/lib/types";
import { formatMonthId } from "@/lib/utils/dateCalc";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/utils/constants";

interface MonthEntry {
  monthId: string;
  label: string;
  schedule: MonthSchedule | null;
  responseCount: number;
}

export default function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [months, setMonths] = useState<MonthEntry[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push("/");
    }
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      const now = new Date();
      const entries: MonthEntry[] = [];

      for (let offset = -1; offset <= 3; offset++) {
        const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        const monthId = formatMonthId(d.getFullYear(), d.getMonth() + 1);
        const schedule = await getSchedule(monthId);
        let responseCount = 0;
        if (schedule && schedule.status !== "draft") {
          const avails = await getMonthAvailabilities(monthId);
          responseCount = avails.length;
        }
        entries.push({
          monthId,
          label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
          schedule,
          responseCount,
        });
      }
      setMonths(entries);
      setDataLoading(false);
    })();
  }, [user, isAdmin]);

  const handleRevertToDraft = async (monthId: string) => {
    if (!confirm("下書きに戻すと、ファシリテーターからの回答が無効になる可能性があります。よろしいですか？")) return;
    await updateScheduleStatus(monthId, "draft");
    setMonths((prev) =>
      prev.map((m) =>
        m.monthId === monthId && m.schedule
          ? { ...m, schedule: { ...m.schedule, status: "draft" as const }, responseCount: 0 }
          : m
      )
    );
  };

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">管理ダッシュボード</h1>
        <div className="flex items-center gap-4">
          <Link href="/admin/announcements" className="text-sm text-brand-600 hover:text-brand-800">
            お知らせ管理
          </Link>
          <Link href="/admin/users" className="text-sm text-brand-600 hover:text-brand-800">
            ユーザー管理
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {months.map((entry) => (
          <div key={entry.monthId} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-gray-800">{entry.label}</h2>
                {entry.schedule ? (
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[entry.schedule.status]}`}>
                      {STATUS_LABELS[entry.schedule.status]}
                    </span>
                    {entry.schedule.status !== "draft" && (
                      <span className="text-xs text-gray-500">{entry.responseCount}名回答済み</span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">未作成</span>
                )}
              </div>
              <div className="flex gap-2">
                {!entry.schedule && (
                  <Link
                    href={`/admin/schedule/${entry.monthId}`}
                    className="px-3 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
                  >
                    作成
                  </Link>
                )}
                {entry.schedule?.status === "draft" && (
                  <Link
                    href={`/admin/schedule/${entry.monthId}`}
                    className="px-3 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
                  >
                    設定
                  </Link>
                )}
                {entry.schedule?.status === "collecting" && (
                  <>
                    <Link
                      href={`/admin/responses/${entry.monthId}`}
                      className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
                    >
                      回答一覧
                    </Link>
                    <Link
                      href={`/admin/shifts/${entry.monthId}`}
                      className="px-3 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
                    >
                      シフト作成
                    </Link>
                  </>
                )}
                {(entry.schedule?.status === "shift_created" || entry.schedule?.status === "published") && (
                  <>
                    <Link
                      href={`/admin/shifts/${entry.monthId}`}
                      className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
                    >
                      シフト確認
                    </Link>
                    <Link
                      href={`/admin/payroll/${entry.monthId}`}
                      className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
                    >
                      支払い
                    </Link>
                  </>
                )}
                {entry.schedule && entry.schedule.status !== "draft" && (
                  <button
                    onClick={() => handleRevertToDraft(entry.monthId)}
                    className="px-3 py-1.5 bg-white border border-orange-300 text-orange-600 text-sm rounded-lg hover:bg-orange-50"
                  >
                    日程変更
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
