"use client";

import { useEffect, useState, useRef, use, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSchedule, getAvailability, saveAvailability, getShift, saveShift, getActiveAnnouncements, getCollectingSchedules, getAttendance, checkIn as firestoreCheckIn, checkOut as firestoreCheckOut, editMyAttendanceTime, resetDayAttendance, getMonthAvailabilities, getAllUsers, updateSchedule, getPayrollConfirmation, createPayrollReport, getFacilitatorPayrollReports, getPayrollAcknowledgment, acknowledgePayroll } from "@/lib/firebase/firestore";
import { MonthSchedule, Availability, ShiftAssignment, Announcement, Attendance, UserProfile, PayrollConfirmation, PayrollReport, PayrollAcknowledgment } from "@/lib/types";
import { getSlotKey, parseMonthId, formatMonthId, formatDateShort, formatDeadline, isDeadlinePassed, getSlotDate, getTodayString, timestampToTimeString, datetimeLocalToTimestamp, timestampToDatetimeLocal } from "@/lib/utils/dateCalc";
import { CLASS_TYPE_COLORS, STATUS_LABELS, CLASS_DURATION_MINUTES, TRAINING_MAX, LAUNCH_YEAR, LAUNCH_MONTH, DEMO_MONTH_ID, DEMO_HOURLY_RATE, getTier, getNextTier, isTraining, getEffectiveRate, getEffectiveRateForMonth, getRequiredFacilitators, getAssemblyTime, BREAK_MINUTES, getBreakDeduction, getSatokoPayrollThanks } from "@/lib/utils/constants";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const ART_SCHOOL_IMAGES = [
  "/art_school/art_school_woodwork@2x.webp",
  "/art_school/art_school_textile@2x.webp",
  "/art_school/art_school_animation@2x.webp",
  "/art_school/art_school_painting@2x.webp",
  "/art_school/art_school_pottery@2x.webp",
  "/art_school/art_school_history@2x.webp",
  "/art_school/art_school_calligraphy@2x.webp",
  "/art_school/art_school_digital@2x.webp",
  "/art_school/art_school_printmaking@2x.webp",
  "/art_school/art_school_sculpture@2x.webp",
  "/art_school/art_school_drawing@2x.webp",
  "/art_school/art_school_storage@2x.webp",
  "/art_school/art_school_gallery@2x.webp",
  "/art_school/art_school_darkroom@2x.webp",
];

export default function FacilitatorSchedulePage({ params }: { params: Promise<{ monthId: string }> }) {
  const { monthId } = use(params);
  const { user, profile, isAdmin, loading } = useAuth();
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
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [payrollConf, setPayrollConf] = useState<PayrollConfirmation | null>(null);
  const [myPayrollReports, setMyPayrollReports] = useState<PayrollReport[]>([]);
  const [payrollAck, setPayrollAck] = useState<PayrollAcknowledgment | null>(null);
  const [ackSending, setAckSending] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [animationModal, setAnimationModal] = useState<{ type: "checkin" | "checkout"; message: string } | null>(null);
  const [sparkleKey, setSparkleKey] = useState<string | null>(null);
  const [artSchoolImage] = useState<string>(() => ART_SCHOOL_IMAGES[Math.floor(Math.random() * ART_SCHOOL_IMAGES.length)]);
  const [allAvailabilities, setAllAvailabilities] = useState<Availability[]>([]);
  const [adminUids, setAdminUids] = useState<Set<string>>(new Set());
  const shiftImageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      let sched, avail, shiftData, allAvails, allUsrs;
      try {
        [sched, avail, shiftData, allAvails, allUsrs] = await Promise.all([
          getSchedule(monthId),
          getAvailability(monthId, user.uid),
          getShift(monthId),
          getMonthAvailabilities(monthId),
          getAllUsers(),
        ]);
      } catch (err) {
        console.error("Firestore data load failed:", err);
        setDataLoading(false);
        return;
      }
      setAllAvailabilities(allAvails);
      setAdminUids(new Set(allUsrs.filter((u) => u.role === "admin").map((u) => u.uid)));
      setSchedule(sched);

      // デモ月: ログインユーザーを自動でシフトに追加（1日4クラス分すべて）
      if (monthId === DEMO_MONTH_ID && sched && sched.status === "published" && profile) {
        const newAssignments: Record<string, string[]> = { ...(shiftData?.assignments || {}) };
        const newNames: Record<string, string[]> = { ...(shiftData?.assignmentNames || {}) };
        const displayName = profile.nickname || profile.displayName;
        let modified = false;
        sched.days.forEach((day) =>
          day.slots.forEach((slot) => {
            const key = getSlotKey(day.date, slot.time);
            if (!newAssignments[key]) newAssignments[key] = [];
            if (!newNames[key]) newNames[key] = [];
            if (!newAssignments[key].includes(user.uid)) {
              newAssignments[key] = [...newAssignments[key], user.uid];
              newNames[key] = [...newNames[key], displayName];
              modified = true;
            }
          })
        );
        if (modified) {
          await saveShift(monthId, newAssignments, newNames, user.uid);
          shiftData = { id: monthId, monthId, assignments: newAssignments, assignmentNames: newNames, createdBy: user.uid } as ShiftAssignment;
        }
      }

      setShift(shiftData);
      try {
        const [attendanceData, confData, reportsData, ackData] = await Promise.all([
          getAttendance(monthId, user.uid),
          getPayrollConfirmation(monthId, user.uid),
          getFacilitatorPayrollReports(monthId, user.uid),
          getPayrollAcknowledgment(monthId, user.uid),
        ]);
        setAttendance(attendanceData);
        setPayrollConf(confData);
        setMyPayrollReports(reportsData);
        setPayrollAck(ackData);
      } catch {
        // collections may not have rules deployed yet
      }
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

  const fetchSatokoMessage = async (type: "checkin" | "checkout") => {
    if (!profile) return "";
    const name = profile.nickname || profile.displayName.split(" ")[0];
    try {
      const res = await fetch("/api/satoko", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, classCount: profile.classCount || 0, type }),
      });
      const data = await res.json();
      return data.message || "";
    } catch {
      return type === "checkin"
        ? `${name}さん、今日もよろしくね！`
        : `${name}さん、おつかれさま！`;
    }
  };

  const handleAcknowledgePayroll = async () => {
    if (!user || !profile) return;
    if (ackSending) return;
    if (!confirm(`${month}月の給与を確認しました、で送信しますか？`)) return;
    setAckSending(true);
    try {
      const name = profile.nickname || profile.displayName;
      const ack = await acknowledgePayroll(monthId, user.uid, name);
      setPayrollAck(ack);
    } catch (err) {
      console.error(err);
      alert("送信に失敗しました");
    }
    setAckSending(false);
  };

  const handleSubmitPayrollReport = async () => {
    if (!user || !profile) return;
    const text = reportText.trim();
    if (text.length === 0) {
      alert("報告内容を入力してください");
      return;
    }
    setReportSending(true);
    try {
      await createPayrollReport({
        monthId,
        facilitatorId: user.uid,
        facilitatorName: profile.nickname || profile.displayName,
        message: text,
      });
      const reports = await getFacilitatorPayrollReports(monthId, user.uid);
      setMyPayrollReports(reports);
      setReportText("");
      setReportModalOpen(false);
      alert("管理者に報告を送信しました");
    } catch (err) {
      console.error(err);
      alert("送信に失敗しました");
    }
    setReportSending(false);
  };

  const handleDayCheckIn = async (dayKey: string) => {
    if (!user) return;
    setCheckingIn(dayKey);
    setSparkleKey(dayKey);
    setTimeout(() => setSparkleKey(null), 1200);
    try {
      await firestoreCheckIn(monthId, user.uid, dayKey);
      const updated = await getAttendance(monthId, user.uid);
      setAttendance(updated);
      const msg = await fetchSatokoMessage("checkin");
      setAnimationModal({ type: "checkin", message: msg });
      setTimeout(() => setAnimationModal(null), 4000);
    } catch {
      alert("チェックインに失敗しました。管理者に連絡してください。");
    }
    setCheckingIn(null);
  };

  const handleDayCheckOut = async (dayKey: string) => {
    if (!user) return;
    setCheckingIn(dayKey);
    setSparkleKey(`out_${dayKey}`);
    setTimeout(() => setSparkleKey(null), 1200);
    try {
      await firestoreCheckOut(monthId, user.uid, dayKey);
      const updated = await getAttendance(monthId, user.uid);
      setAttendance(updated);
      const msg = await fetchSatokoMessage("checkout");
      setAnimationModal({ type: "checkout", message: msg });
      setTimeout(() => setAnimationModal(null), 4000);
    } catch {
      alert("チェックアウトに失敗しました。管理者に連絡してください。");
    }
    setCheckingIn(null);
  };

  const handleEditTime = async (dayKey: string, field: "checkIn" | "checkOut", value: string) => {
    if (!user || !value) return;
    try {
      const ts = datetimeLocalToTimestamp(value);
      await editMyAttendanceTime(monthId, user.uid, dayKey, field, ts);
      const updated = await getAttendance(monthId, user.uid);
      setAttendance(updated);
    } catch {
      alert("時間の更新に失敗しました。");
    }
  };

  const handleResetDay = async (dayKey: string) => {
    if (!user) return;
    try {
      await resetDayAttendance(monthId, user.uid, dayKey);
      const updated = await getAttendance(monthId, user.uid);
      setAttendance(updated);
    } catch {
      alert("リセットに失敗しました。");
    }
  };

  const toggleSlot = (key: string) => {
    if (schedule?.status !== "collecting") return;
    setMyAvailability((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async () => {
    if (!user || !profile) return;
    setSaving(true);
    await saveAvailability(monthId, user.uid, profile.displayName, myAvailability);
    setSubmitted(true);
    // 投票数表示を更新
    const updatedAvails = await getMonthAvailabilities(monthId);
    setAllAvailabilities(updatedAvails);
    setSaving(false);
  };

  const { year, month } = parseMonthId(monthId);
  const isDemo = monthId === DEMO_MONTH_ID;
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

  const downloadShiftImage = async () => {
    if (!shiftImageRef.current) return;
    const canvas = await html2canvas(shiftImageRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const link = document.createElement("a");
    link.download = `シフト表_${month}月.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const downloadShiftPdf = async () => {
    if (!shiftImageRef.current) return;
    const canvas = await html2canvas(shiftImageRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const pdfW = canvas.width * 0.264583;
    const pdfH = canvas.height * 0.264583;
    const pdf = new jsPDF({ orientation: pdfW > pdfH ? "landscape" : "portrait", unit: "mm", format: [pdfW, pdfH] });
    pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
    pdf.save(`シフト表_${month}月.pdf`);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-9">
      {/* Calendar & Demo Link */}
      <div className="flex justify-end gap-2 mb-2">
        {!isDemo && (
          <button
            onClick={() => router.push(`/schedule/${DEMO_MONTH_ID}`)}
            className="text-xs text-brand-600 bg-brand-50 border border-brand-200 rounded-lg px-3 py-1.5 hover:bg-brand-100 transition-colors"
          >
            デモ版
          </button>
        )}
        <button
          onClick={() => router.push("/schedule/calendar")}
          className="text-xs text-gray-600 bg-white border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
        >
          年間カレンダー
        </button>
        <button
          onClick={() => router.push("/schedule/help")}
          className="text-xs text-gray-600 bg-white border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
        >
          使い方
        </button>
        <a
          href="http://creative.artdesignlab.jp"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-600 bg-white border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
        >
          クリエイティブノート
        </a>
      </div>

      {/* Demo Guide */}
      {isDemo && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-4">
          <div className="text-sm font-medium text-blue-800 mb-2">デモ版について</div>
          <div className="text-sm text-blue-700 space-y-1">
            <p>このページではシフト管理アプリの主要機能を体験できます。</p>
            <ul className="list-disc list-inside text-xs space-y-0.5 mt-2">
              <li>各日の大きな<b>INボタン</b>でチェックイン（出勤記録）</li>
              <li>チェックイン後に<b>OUTボタン</b>でチェックアウト（退勤記録）</li>
              <li>記録した時間は<b>編集可能</b>です</li>
              <li>AI-SATO-β がメッセージで応援します</li>
              <li>ページ下部で<b>時給・給与</b>の確認ができます</li>
            </ul>
          </div>
        </div>
      )}

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
      <div className="flex items-center justify-between mt-9 mb-6">
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
          {isDemo ? "デモ" : `${year}年${month}月${isPublished ? "シフト" : ""}`}
        </h1>
        <button
          onClick={() => router.push(`/schedule/${nextMonth}`)}
          className="p-2 text-gray-400 hover:text-gray-600"
        >
          &gt;
        </button>
      </div>

      {/* 今月の給与（シフト確定後のみ表示。回答受付中はシミュレーションを別途表示） */}
      {profile && isPublished && (() => {
        const mySlots = shift && schedule
          ? Object.entries(shift.assignments)
              .filter(([, uids]) => uids.includes(user?.uid || ""))
              .map(([key]) => key)
          : [];
        const classCount = profile.classCount || 0;
        const effectiveRate = getEffectiveRateForMonth(monthId, classCount, profile.hourlyRate || 0);
        const trainingRate = classCount >= 1 && classCount <= TRAINING_MAX;
        const transportCost = profile.transportCost || 0;

        // Group slots by day and calculate actual minutes from day-level attendance
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
            actualMinutes += Math.round((record.checkOut.toDate().getTime() - record.checkIn.toDate().getTime()) / 60000) - breakMin;
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
        return (
          <div className={`mb-6 bg-white rounded-xl border p-4 ${payrollConf ? "border-green-300" : "border-gray-200"}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-brand-700">{month}月の給与</h2>
                {payrollConf && (
                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">確定済み</span>
                )}
              </div>
              <span className={`text-sm font-medium px-2 py-0.5 rounded ${effectiveRate > 0 ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-500"}`}>
                {effectiveRate > 0
                  ? `時給 ¥${(payrollConf?.hourlyRate || effectiveRate).toLocaleString()}${trainingRate ? "（研修）" : ""}`
                  : "時給未設定"}
              </span>
            </div>
            {payrollConf ? (
              <>
                <div className="text-xs text-green-600 mb-3">
                  {payrollConf.confirmedAt.toDate().toLocaleDateString("ja-JP")} 確定
                </div>
                {/* 日別明細 */}
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
                      <span className="text-gray-500">{d.minutes}分 × {d.slotCount}コマ</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-gray-500">
                    {payrollConf.slotCount}コマ（{payrollConf.totalMinutes}分{payrollConf.breakMinutes > 0 ? ` 休憩−${payrollConf.breakMinutes}分` : ""}）
                  </div>
                  <div className="text-sm text-gray-700">
                    ¥{payrollConf.classPay.toLocaleString()}
                  </div>
                </div>
                {payrollConf.transportCost > 0 && (
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-500">交通費</div>
                    <div className="text-sm text-gray-700">¥{payrollConf.transportCost.toLocaleString()}</div>
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
              isAdmin && schedule ? (() => {
                // 管理者向けデモ試算: 1日4クラス参加した想定
                const demoSlots: string[] = [];
                schedule.days.forEach((day) =>
                  day.slots.forEach((slot) => {
                    demoSlots.push(getSlotKey(day.date, slot.time));
                  })
                );
                const demoSlotsByDay: Record<string, string[]> = {};
                demoSlots.forEach((k) => {
                  const dk = getSlotDate(k);
                  if (!demoSlotsByDay[dk]) demoSlotsByDay[dk] = [];
                  demoSlotsByDay[dk].push(k);
                });
                const demoBreakMin = Object.values(demoSlotsByDay).reduce(
                  (s, ks) => s + getBreakDeduction(ks),
                  0
                );
                const demoMinutes = demoSlots.length * CLASS_DURATION_MINUTES - demoBreakMin;
                const demoRate = effectiveRate > 0 ? effectiveRate : DEMO_HOURLY_RATE;
                const demoClassPay = Math.round(demoRate * (demoMinutes / 60));
                const demoTotal = demoClassPay + transportCost;
                return (
                  <>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">
                        管理者デモ試算
                      </span>
                      <span className="text-[10px] text-gray-500">
                        1日4クラス × {Object.keys(demoSlotsByDay).length}日 参加した想定（実シフトではありません）
                      </span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-gray-500">
                        {demoSlots.length}コマ（{demoMinutes}分
                        {demoBreakMin > 0 ? ` 休憩−${demoBreakMin}分` : ""}）
                      </div>
                      <div className="text-sm text-gray-700">¥{demoClassPay.toLocaleString()}</div>
                    </div>
                    {transportCost > 0 && (
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-gray-500">交通費</div>
                        <div className="text-sm text-gray-700">¥{transportCost.toLocaleString()}</div>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div className="text-sm font-medium text-gray-700">合計（デモ試算）</div>
                      <div className="text-2xl font-bold text-brand-700">
                        ¥{demoTotal.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {demoSlots.sort().map((key) => (
                        <span
                          key={key}
                          className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-0.5 text-gray-600"
                        >
                          {slotLabels[key] || key}
                        </span>
                      ))}
                    </div>
                  </>
                );
              })() : (
                <div className="text-sm text-gray-400">シフト未割当</div>
              )
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-gray-500">
                    {mySlots.length}コマ（{displayMinutes}分{hasAttendance ? " 実績" : ""}{totalBreakDeduction > 0 ? ` 休憩−${totalBreakDeduction}分` : ""}）
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
                  <div className="text-sm font-medium text-gray-700">合計（見込み）</div>
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
            {/* 既存の報告 */}
            {myPayrollReports.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                <div className="text-xs font-medium text-gray-600">管理者への報告</div>
                {myPayrollReports.map((r) => (
                  <div
                    key={r.id}
                    className={`text-xs rounded-lg px-3 py-2 border ${
                      r.status === "open"
                        ? "bg-amber-50 border-amber-200 text-amber-800"
                        : "bg-gray-50 border-gray-200 text-gray-600"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">
                        {r.status === "open" ? "対応待ち" : "対応済み"}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {r.createdAt.toDate().toLocaleDateString("ja-JP")}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap break-words">{r.message}</div>
                    {r.adminResponse && (
                      <div className="mt-2 pt-2 border-t border-current/20">
                        <div className="text-[10px] font-medium mb-0.5">管理者からの返信</div>
                        <div className="whitespace-pre-wrap break-words">{r.adminResponse}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* AI-SATO-β から給与に向けた「ありがとう」一言 */}
            {(() => {
              const satokoName = profile.nickname || profile.displayName || "あなた";
              const satokoThanks = getSatokoPayrollThanks(
                satokoName,
                `${monthId}-${user?.uid || "guest"}`
              );
              return (
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
                      <p className="text-sm text-gray-700 leading-relaxed">{satokoThanks}</p>
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* 確認しました / 不備を報告ボタン */}
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
              {payrollAck ? (
                <div className="w-full bg-green-600 text-white text-center font-bold text-sm px-4 py-3 rounded-xl shadow-sm">
                  ✓ 確認済み（{payrollAck.acknowledgedAt.toDate().toLocaleDateString("ja-JP")}）
                </div>
              ) : (
                <button
                  onClick={handleAcknowledgePayroll}
                  disabled={ackSending}
                  className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-sm px-4 py-3 rounded-xl shadow-sm disabled:opacity-50 transition-colors"
                >
                  {ackSending ? "送信中…" : "給与を確認しました"}
                </button>
              )}
              <div className="flex justify-end">
                <button
                  onClick={() => setReportModalOpen(true)}
                  className="text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-lg"
                >
                  給与に不備があれば管理者に報告
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
          {/* チェックイン・チェックアウト（シフト作成後） */}
          {shift && (() => {
            const myAssignedDays = schedule.days.filter((day) =>
              day.slots.some((slot) => {
                const key = getSlotKey(day.date, slot.time);
                return slot.needsFacilitator && slot.classType && shift.assignments?.[key]?.includes(user?.uid || "");
              })
            );
            const displayDays = myAssignedDays.length > 0 ? myAssignedDays
              : isAdmin ? schedule.days.filter((day) => day.slots.some((s) => s.needsFacilitator && s.classType)) : [];
            if (displayDays.length === 0) {
              return (
                <div className="mb-6 text-center py-4 text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
                  今月のシフトは割り当てられていません
                </div>
              );
            }
            const isDummy = myAssignedDays.length === 0 && isAdmin;
            return (
            <div className="mb-6 space-y-3">
              {isDummy && (
                <div className="text-center text-xs text-gray-400 mb-1">※ 管理者プレビュー（ファシリテーター視点）</div>
              )}
              {displayDays.map((day) => {
                const dayKey = day.date;
                const record = attendance?.records?.[dayKey];
                const hasCheckIn = !!record?.checkIn;
                const hasCheckOut = !!record?.checkOut;
                const isProcessing = checkingIn === dayKey;
                let durationMin = 0;
                if (record?.checkIn && record?.checkOut) {
                  durationMin = Math.round((record.checkOut.toDate().getTime() - record.checkIn.toDate().getTime()) / 60000);
                }
                const durationHours = Math.floor(durationMin / 60);
                const durationRemainder = durationMin % 60;
                return (
                  <div key={dayKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                      <span className="font-medium text-gray-700">{formatDateShort(day.date)}</span>
                      <span className="text-sm text-gray-500 ml-2">{day.dayLabel}</span>
                    </div>
                    <div className="p-4">
                      {isDummy ? (
                        <div className="flex flex-col items-center py-2">
                          <button
                            disabled
                            className="w-28 h-28 rounded-full bg-green-300 text-white font-bold text-base flex flex-col items-center justify-center opacity-60"
                          >
                            <span className="text-2xl mb-0.5">IN</span>
                            <span className="text-xs opacity-90">チェックイン</span>
                          </button>
                        </div>
                      ) : !hasCheckIn ? (() => {
                        const isToday = dayKey === getTodayString();
                        return (
                        <div className="flex flex-col items-center py-2">
                          {!isToday && (
                            <p className="text-xs text-gray-400 mb-2">当日のみチェックインできます</p>
                          )}
                          <div className="relative">
                            <button
                              onClick={() => handleDayCheckIn(dayKey)}
                              disabled={isProcessing || !isToday}
                              className={`w-28 h-28 rounded-full text-white font-bold text-base flex flex-col items-center justify-center transition-all ${
                                isToday
                                  ? "bg-green-500 hover:bg-green-600 active:scale-95 disabled:bg-gray-300"
                                  : "bg-gray-300 cursor-not-allowed"
                              }`}
                            >
                              {isProcessing ? (
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                              ) : (
                                <>
                                  <span className="text-2xl mb-0.5">IN</span>
                                  <span className="text-xs opacity-90">チェックイン</span>
                                </>
                              )}
                            </button>
                            {sparkleKey === dayKey && (
                              <div className="sparkle-container">
                                {[...Array(12)].map((_, i) => (
                                  <span key={i} className="sparkle" style={{ '--i': i } as React.CSSProperties} />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        );
                      })() : !hasCheckOut ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-center gap-3">
                            <span className="text-sm text-gray-500 font-medium">IN</span>
                            <input
                              type="time"
                              value={timestampToTimeString(record!.checkIn!)}
                              onChange={(e) => {
                                const [h, m] = e.target.value.split(":");
                                const d = record!.checkIn!.toDate();
                                d.setHours(parseInt(h), parseInt(m));
                                handleEditTime(dayKey, "checkIn", timestampToDatetimeLocal({ toDate: () => d } as any));
                              }}
                              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <div className="flex flex-col items-center py-2">
                            <div className="relative">
                              <button
                                onClick={() => handleDayCheckOut(dayKey)}
                                disabled={isProcessing}
                                className="w-28 h-28 rounded-full bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-base disabled:bg-gray-300 flex flex-col items-center justify-center transition-all"
                              >
                                {isProcessing ? (
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                                ) : (
                                  <>
                                    <span className="text-2xl mb-0.5">OUT</span>
                                    <span className="text-xs opacity-90">チェックアウト</span>
                                  </>
                                )}
                              </button>
                              {sparkleKey === `out_${dayKey}` && (
                                <div className="sparkle-container">
                                  {[...Array(12)].map((_, i) => (
                                    <span key={i} className="sparkle" style={{ '--i': i } as React.CSSProperties} />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-center gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-green-600 font-medium">IN</span>
                              <input
                                type="time"
                                value={timestampToTimeString(record!.checkIn!)}
                                onChange={(e) => {
                                  const [h, m] = e.target.value.split(":");
                                  const d = record!.checkIn!.toDate();
                                  d.setHours(parseInt(h), parseInt(m));
                                  handleEditTime(dayKey, "checkIn", timestampToDatetimeLocal({ toDate: () => d } as any));
                                }}
                                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-orange-600 font-medium">OUT</span>
                              <input
                                type="time"
                                value={timestampToTimeString(record!.checkOut!)}
                                onChange={(e) => {
                                  const [h, m] = e.target.value.split(":");
                                  const d = record!.checkOut!.toDate();
                                  d.setHours(parseInt(h), parseInt(m));
                                  handleEditTime(dayKey, "checkOut", timestampToDatetimeLocal({ toDate: () => d } as any));
                                }}
                                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                            </div>
                          </div>
                          <div className="text-center">
                            <span className="text-lg font-bold text-brand-700">
                              実働 {durationHours > 0 ? `${durationHours}時間` : ""}{durationRemainder}分
                            </span>
                          </div>
                          {isDemo && (
                            <div className="text-center">
                              <button
                                onClick={() => handleResetDay(dayKey)}
                                className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
                              >
                                リセットしてもう一度体験
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {record?.editedBy && (
                        <div className="text-center mt-2">
                          <span className="text-[10px] text-gray-400">(管理者編集あり)</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            );
          })()}

          {/* シフト表（トップ表示） */}
          {shift && (() => {
            return (
              <div className="mb-6 max-w-[640px] mx-auto bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-bold text-gray-700">{month}月 シフト表</h3>
                </div>
                <div className="px-4 pt-3 pb-1 flex gap-4 text-xs text-gray-500">
                  {["カリキュラム", "オーダーメイド"].map((type) => {
                    const c = CLASS_TYPE_COLORS[type];
                    return (
                      <span key={type} className="flex items-center gap-1">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: c.bg, color: c.text }}>{type}</span>
                      </span>
                    );
                  })}
                </div>
                <div className="p-4 pt-2 space-y-4 overflow-x-auto">
                  {schedule.days.map((day) => {
                    const isPastDay = day.date < getTodayString();
                    const activeSlots = day.slots.filter((s) => s.needsFacilitator && s.classType);
                    if (activeSlots.length === 0) return null;
                    const dayFacUids: string[] = [];
                    activeSlots.forEach((slot) => {
                      (shift.assignments?.[getSlotKey(day.date, slot.time)] || []).forEach((uid) => {
                        if (!dayFacUids.includes(uid)) dayFacUids.push(uid);
                      });
                    });
                    const facCells: Record<string, { show: boolean; rowSpan: number; assigned: boolean }[]> = {};
                    dayFacUids.forEach((uid) => {
                      const cells: { show: boolean; rowSpan: number; assigned: boolean }[] = [];
                      let i = 0;
                      while (i < activeSlots.length) {
                        const k = getSlotKey(day.date, activeSlots[i].time);
                        if ((shift.assignments?.[k] || []).includes(uid)) {
                          let span = 1;
                          while (i + span < activeSlots.length) {
                            const nk = getSlotKey(day.date, activeSlots[i + span].time);
                            if ((shift.assignments?.[nk] || []).includes(uid)) span++;
                            else break;
                          }
                          cells.push({ show: true, rowSpan: span, assigned: true });
                          for (let j = 1; j < span; j++) cells.push({ show: false, rowSpan: 0, assigned: true });
                          i += span;
                        } else {
                          cells.push({ show: true, rowSpan: 1, assigned: false });
                          i++;
                        }
                      }
                      facCells[uid] = cells;
                    });
                    const facNameMap: Record<string, string> = {};
                    activeSlots.forEach((slot) => {
                      const k = getSlotKey(day.date, slot.time);
                      const uids = shift.assignments?.[k] || [];
                      const names = shift.assignmentNames?.[k] || [];
                      uids.forEach((uid, i) => { if (!facNameMap[uid]) facNameMap[uid] = names[i] || uid; });
                    });
                    const slotTimes = activeSlots.map((s) => s.time);
                    const idx12 = slotTimes.indexOf("12:00");
                    const idx14 = slotTimes.indexOf("14:30");
                    const hasBreak = idx12 !== -1 && idx14 !== -1 && idx14 === idx12 + 1;
                    if (hasBreak) {
                      dayFacUids.forEach((uid) => {
                        const cells = facCells[uid];
                        if (cells[idx12].assigned && cells[idx14].assigned) {
                          let startIdx = idx12;
                          while (startIdx > 0 && !cells[startIdx].show) startIdx--;
                          cells[startIdx].rowSpan += 1;
                        }
                      });
                    }
                    return (
                      <div key={day.date} className={isPastDay ? "opacity-40" : ""}>
                        <div className="bg-gray-100 px-3 py-1.5 rounded-md mb-1">
                          <span className="text-sm font-bold text-gray-700">{formatDateShort(day.date)}</span>
                        </div>
                        <table className="w-full border-collapse">
                          <tbody>
                            {activeSlots.map((slot, slotIdx) => {
                              const key = getSlotKey(day.date, slot.time);
                              const colors = CLASS_TYPE_COLORS[slot.classType!];
                              const assignedCount = (shift.assignments?.[key] || []).length;
                              const required = getRequiredFacilitators(slot.childCount);
                              const isShort = required > 0 && assignedCount < required;
                              return (
                                <Fragment key={key}>
                                <tr>
                                  <td className="border border-gray-200 px-2 py-2 align-top w-24 text-left">
                                    <div className="text-[11px] max-sm:text-[10px] text-brand-500 font-semibold">集合 {getAssemblyTime(slot.time)}</div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors.bg, border: `2px solid ${colors.border}` }} />
                                      <span className="font-bold text-gray-600 text-sm max-sm:text-xs">{slot.time}</span>
                                    </div>
                                    {slot.childCount && (
                                      <div className="text-sm max-sm:text-xs font-bold text-green-600 mt-0.5">子{slot.childCount}名</div>
                                    )}
                                    {isShort && (
                                      <div className="text-[11px] max-sm:text-[10px] text-red-600 font-bold mt-0.5">⚠ あと{required - assignedCount}名</div>
                                    )}
                                  </td>
                                  {dayFacUids.map((uid) => {
                                    const cell = facCells[uid][slotIdx];
                                    if (!cell.show) return null;
                                    const isMeUid = uid === user?.uid;
                                    return (
                                      <td
                                        key={uid}
                                        rowSpan={cell.rowSpan}
                                        className={`border border-gray-200 px-2 py-2 text-center text-sm max-sm:text-xs font-medium align-middle ${
                                          cell.assigned
                                            ? isMeUid ? "bg-brand-100 text-brand-700" : "bg-brand-50 text-gray-700"
                                            : ""
                                        }`}
                                      >
                                        {cell.assigned ? <>{facNameMap[uid]}<br /><span className="text-xs max-sm:text-[10px]">さん</span></> : ""}
                                      </td>
                                    );
                                  })}
                                </tr>
                                {hasBreak && slotIdx === idx12 && (
                                  <tr className="bg-gray-50">
                                    <td className="border border-gray-200 px-2 py-1 text-xs text-gray-500 font-medium text-center whitespace-nowrap">
                                      🍙 休憩<br />13:30〜14:15
                                    </td>
                                    {dayFacUids.map((uid) => {
                                      const spansBreak = facCells[uid][idx12].assigned && facCells[uid][idx14].assigned;
                                      if (spansBreak) return null;
                                      return <td key={uid} className="border border-gray-200 bg-gray-50" />;
                                    })}
                                  </tr>
                                )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
                <div className="px-4 py-4 bg-white border-t border-gray-200 space-y-1">
                  <p className="text-sm font-bold text-red-600">⚠️ 変更の際はLINEにてご連絡ください</p>
                  <p className="text-xs font-bold text-red-600">人数不足の時間帯に入れる方も、お気軽にご連絡ください</p>
                </div>
                {/* 給与見込み */}
                {profile && (() => {
                  const mySlots = Object.entries(shift.assignments)
                    .filter(([, uids]) => uids.includes(user?.uid || ""))
                    .map(([key]) => key);
                  const classCount = profile.classCount || 0;
                  const effectiveRate = getEffectiveRateForMonth(monthId, classCount, profile.hourlyRate || 0);
                  const slotsByDayEst: Record<string, string[]> = {};
                  mySlots.forEach((k) => { const d = getSlotDate(k); if (!slotsByDayEst[d]) slotsByDayEst[d] = []; slotsByDayEst[d].push(k); });
                  const totalBreakMin = Object.values(slotsByDayEst).reduce((sum, keys) => sum + getBreakDeduction(keys), 0);
                  const scheduledMinutes = mySlots.length * CLASS_DURATION_MINUTES - totalBreakMin;
                  const classPay = Math.round(effectiveRate * (scheduledMinutes / 60));
                  const transportCost = profile.transportCost || 0;
                  const totalPay = classPay + (mySlots.length > 0 ? transportCost : 0);
                  if (mySlots.length === 0 || effectiveRate === 0) return null;
                  return (
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">今月の給与（見込み）</span>
                        <span className="text-base font-bold text-brand-700">¥{totalPay.toLocaleString()}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{mySlots.length}コマ × 時給¥{effectiveRate.toLocaleString()}{totalBreakMin > 0 ? ` − 休憩${totalBreakMin}分` : ""}{transportCost > 0 ? ` + 交通費¥${transportCost.toLocaleString()}` : ""}</div>
                    </div>
                  );
                })()}
                <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
                  <button
                    onClick={downloadShiftImage}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700"
                  >
                    画像を保存
                  </button>
                  <button
                    onClick={downloadShiftPdf}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                  >
                    PDFを保存
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Status Badge & Deadline (collecting時のみ) */}
          {!isPublished && (
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
          )}

          {/* 給与シミュレーション (collecting時 & ファシリが希望を入力した時のみ) */}
          {schedule.status === "collecting" && profile && (() => {
            const okSlots = Object.entries(myAvailability)
              .filter(([, ok]) => ok)
              .map(([key]) => key);
            if (okSlots.length === 0) return null;
            const classCount = profile.classCount || 0;
            const effectiveRate = getEffectiveRateForMonth(monthId, classCount, profile.hourlyRate || 0);
            if (effectiveRate === 0) return null;
            const trainingRate = classCount >= 1 && classCount <= TRAINING_MAX;
            const slotsByDayEst: Record<string, string[]> = {};
            okSlots.forEach((k) => {
              const d = getSlotDate(k);
              if (!slotsByDayEst[d]) slotsByDayEst[d] = [];
              slotsByDayEst[d].push(k);
            });
            const totalBreakMin = Object.values(slotsByDayEst).reduce(
              (sum, keys) => sum + getBreakDeduction(keys),
              0,
            );
            const scheduledMinutes =
              okSlots.length * CLASS_DURATION_MINUTES - totalBreakMin;
            const classPay = Math.round(effectiveRate * (scheduledMinutes / 60));
            const transportCost = profile.transportCost || 0;
            const totalPay = classPay + (okSlots.length > 0 ? transportCost : 0);

            return (
              <div className="bg-white rounded-xl border border-brand-300 p-4 mb-6">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-brand-700">{month}月の給与シミュレーション</h2>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                      希望シフト試算
                    </span>
                  </div>
                  <span className="text-sm font-medium px-2 py-0.5 rounded bg-brand-50 text-brand-700">
                    時給 ¥{effectiveRate.toLocaleString()}{trainingRate ? "（研修）" : ""}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                  現在チェックを入れた希望シフトが全て採用された場合の見込み額です。<br />
                  実際の支払額はシフト確定後に変動します。
                </p>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">
                      {okSlots.length}コマ（{scheduledMinutes}分{totalBreakMin > 0 ? ` 休憩−${totalBreakMin}分` : ""}）
                    </span>
                    <span className="text-gray-800">¥{classPay.toLocaleString()}</span>
                  </div>
                  {transportCost > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">交通費</span>
                      <span className="text-gray-800">¥{transportCost.toLocaleString()}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-gray-100 mt-3 pt-3 flex items-center justify-between">
                  <span className="font-bold text-gray-700">合計（試算）</span>
                  <span className="text-2xl font-bold text-brand-700">
                    ¥{totalPay.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Schedule Grid (collecting時のみ表示) */}
          {!isPublished && <div className="space-y-4">
            {schedule.days.map((day) => {
              // Check if user has assigned slots on this day
              const myDaySlots = isPublished && shift
                ? day.slots.filter((slot) => {
                    const key = getSlotKey(day.date, slot.time);
                    return slot.needsFacilitator && slot.classType && shift.assignments?.[key]?.includes(user?.uid || "");
                  })
                : [];
              const dayKey = day.date;
              const record = attendance?.records?.[dayKey];
              const hasCheckIn = !!record?.checkIn;
              const hasCheckOut = !!record?.checkOut;
              const isProcessing = checkingIn === dayKey;
              let durationMin = 0;
              if (record?.checkIn && record?.checkOut) {
                durationMin = Math.round((record.checkOut.toDate().getTime() - record.checkIn.toDate().getTime()) / 60000);
              }
              const durationHours = Math.floor(durationMin / 60);
              const durationRemainder = durationMin % 60;

              return (
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

                      // 投票数計算（admin除外）
                      const voteCount = allAvailabilities.filter(
                        (a) => !adminUids.has(a.facilitatorId) && a.slots[key]
                      ).length;
                      const required = getRequiredFacilitators(slot.childCount);
                      const shortage = required > 0 ? required - voteCount : 0;

                      return (
                        <div key={key} className="p-3 text-center">
                          <div className="text-xs text-gray-500 mb-1">{slot.time}</div>
                          <div
                            className="text-[10px] px-1 py-0.5 rounded mb-1 inline-block"
                            style={{ backgroundColor: colors!.bg, color: colors!.text }}
                          >
                            {slot.classType}
                          </div>
                          {isAdmin && schedule.status === "collecting" ? (
                            <div className="mb-1">
                              <div className="flex items-center justify-center gap-0.5">
                                <span className="text-[10px] text-gray-500">子</span>
                                <select
                                  value={slot.childCount || 0}
                                  onChange={async (e) => {
                                    const count = parseInt(e.target.value) || 0;
                                    const updatedDays = schedule.days.map((d) => ({
                                      date: d.date, dayLabel: d.dayLabel,
                                      slots: d.slots.map((s) =>
                                        s.time === slot.time && d.date === day.date
                                          ? { time: s.time, classType: s.classType, needsFacilitator: s.needsFacilitator, ...(count > 0 ? { childCount: count } : {}) }
                                          : { time: s.time, classType: s.classType, needsFacilitator: s.needsFacilitator, ...(s.childCount ? { childCount: s.childCount } : {}) }
                                      ),
                                    }));
                                    await updateSchedule(monthId, { days: updatedDays });
                                    setSchedule({ ...schedule, days: updatedDays } as MonthSchedule);
                                  }}
                                  className="w-10 border border-gray-200 rounded px-0 py-0 text-[10px] text-center bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                                >
                                  <option value={0}>-</option>
                                  {[1,2,3,4,5,6,7,8,9,10,11,12].map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                  ))}
                                </select>
                                <span className="text-[10px] text-gray-500">名</span>
                              </div>
                              {getRequiredFacilitators(slot.childCount) > 0 && (
                                <div className="text-[10px] text-gray-700 font-medium">
                                  要{getRequiredFacilitators(slot.childCount)}名
                                </div>
                              )}
                            </div>
                          ) : slot.childCount ? (
                            <div className="mb-1">
                              <div className="text-[10px] text-gray-700 font-medium">
                                子ども{slot.childCount}名
                              </div>
                              {required > 0 && (
                                <div className="text-[10px] text-gray-700 font-medium">
                                  要{required}名
                                </div>
                              )}
                            </div>
                          ) : null}
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
                            <>
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
                              <div className={`mt-1 ${shortage > 0 ? "text-red-600 font-medium" : "text-green-600"}`}>
                                {shortage > 0 ? (
                                  <span className="text-[10px]">あと<span className="text-sm font-bold">{shortage}</span>名希望</span>
                                ) : required > 0 && voteCount === required ? (
                                  <>
                                    <span className="text-[10px]">回答<span className="text-xs">{voteCount}</span>名</span>
                                    <div className="text-[10px]">✓ OK</div>
                                  </>
                                ) : required > 0 && voteCount > required ? (
                                  <>
                                    <span className="text-[10px]">回答<span className="text-xs">{voteCount}</span>名</span>
                                    <div className="text-[10px] text-blue-600">{voteCount - required}名オーバー</div>
                                  </>
                                ) : (
                                  <span className="text-[10px] text-gray-400">回答<span className="text-xs">{voteCount}</span>名</span>
                                )}
                              </div>
                            </>
                          ) : null}
                          {/* 備考表示（全員）/ 備考編集（管理者のみ） */}
                          {isAdmin ? (
                            <input
                              type="text"
                              placeholder="備考"
                              value={schedule.slotNotes?.[key] || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                const updatedNotes = { ...(schedule.slotNotes || {}) };
                                if (val.trim()) {
                                  updatedNotes[key] = val;
                                } else {
                                  delete updatedNotes[key];
                                }
                                setSchedule({ ...schedule, slotNotes: updatedNotes } as MonthSchedule);
                              }}
                              onBlur={async () => {
                                await updateSchedule(monthId, { slotNotes: schedule.slotNotes || {} });
                              }}
                              className="mt-2 w-full text-[10px] text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white placeholder-gray-300"
                            />
                          ) : schedule.slotNotes?.[key] ? (
                            <div className="mt-2 text-[10px] text-gray-500 bg-gray-50 rounded px-1.5 py-1">
                              {schedule.slotNotes[key]}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {/* Per-day Check-in/out (shown below the slot grid) */}
                  {myDaySlots.length > 0 && (
                    <div className="border-t border-gray-200 bg-brand-50/50 p-4">
                      {/* Check-in/out buttons */}
                      {!hasCheckIn ? (
                        <div className="flex flex-col items-center py-2">
                          <div className="relative">
                            <button
                              onClick={() => handleDayCheckIn(dayKey)}
                              disabled={isProcessing}
                              className="w-28 h-28 rounded-full bg-green-500 hover:bg-green-600 active:scale-95 text-white font-bold text-base disabled:bg-gray-300 flex flex-col items-center justify-center transition-all"
                            >
                              {isProcessing ? (
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                              ) : (
                                <>
                                  <span className="text-2xl mb-0.5">IN</span>
                                  <span className="text-xs opacity-90">チェックイン</span>
                                </>
                              )}
                            </button>
                            {sparkleKey === dayKey && (
                              <div className="sparkle-container">
                                {[...Array(12)].map((_, i) => (
                                  <span key={i} className="sparkle" style={{ '--i': i } as React.CSSProperties} />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : !hasCheckOut ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-center gap-3">
                            <span className="text-sm text-gray-500 font-medium">IN</span>
                            <input
                              type="time"
                              value={timestampToTimeString(record!.checkIn!)}
                              onChange={(e) => {
                                const [h, m] = e.target.value.split(":");
                                const d = record!.checkIn!.toDate();
                                d.setHours(parseInt(h), parseInt(m));
                                handleEditTime(dayKey, "checkIn", timestampToDatetimeLocal({ toDate: () => d } as any));
                              }}
                              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <div className="flex flex-col items-center py-2">
                            <div className="relative">
                              <button
                                onClick={() => handleDayCheckOut(dayKey)}
                                disabled={isProcessing}
                                className="w-28 h-28 rounded-full bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-base disabled:bg-gray-300 flex flex-col items-center justify-center transition-all"
                              >
                                {isProcessing ? (
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                                ) : (
                                  <>
                                    <span className="text-2xl mb-0.5">OUT</span>
                                    <span className="text-xs opacity-90">チェックアウト</span>
                                  </>
                                )}
                              </button>
                              {sparkleKey === `out_${dayKey}` && (
                                <div className="sparkle-container">
                                  {[...Array(12)].map((_, i) => (
                                    <span key={i} className="sparkle" style={{ '--i': i } as React.CSSProperties} />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-center gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-green-600 font-medium">IN</span>
                              <input
                                type="time"
                                value={timestampToTimeString(record!.checkIn!)}
                                onChange={(e) => {
                                  const [h, m] = e.target.value.split(":");
                                  const d = record!.checkIn!.toDate();
                                  d.setHours(parseInt(h), parseInt(m));
                                  handleEditTime(dayKey, "checkIn", timestampToDatetimeLocal({ toDate: () => d } as any));
                                }}
                                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-orange-600 font-medium">OUT</span>
                              <input
                                type="time"
                                value={timestampToTimeString(record!.checkOut!)}
                                onChange={(e) => {
                                  const [h, m] = e.target.value.split(":");
                                  const d = record!.checkOut!.toDate();
                                  d.setHours(parseInt(h), parseInt(m));
                                  handleEditTime(dayKey, "checkOut", timestampToDatetimeLocal({ toDate: () => d } as any));
                                }}
                                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                            </div>
                          </div>
                          <div className="text-center">
                            <span className="text-lg font-bold text-brand-700">
                              実働 {durationHours > 0 ? `${durationHours}時間` : ""}{durationRemainder}分
                            </span>
                          </div>
                          {/* Demo reset button */}
                          {isDemo && (
                            <div className="text-center">
                              <button
                                onClick={() => handleResetDay(dayKey)}
                                className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
                              >
                                リセットしてもう一度体験
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {record?.editedBy && (
                        <div className="text-center mt-2">
                          <span className="text-[10px] text-gray-400">(管理者編集あり)</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>}

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
            <div className="mb-3 flex justify-center">
              <img
                src={artSchoolImage}
                alt="アートスクール"
                className="h-auto block"
                style={{ width: "60%", imageRendering: "pixelated" }}
              />
            </div>
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

      {/* ファシリテーターガイドライン */}
      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-medium text-gray-800 mb-3">ファシリテーターガイドライン</h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            { title: "アートデザインラボについて", url: "https://docs.google.com/presentation/d/1v4oo_HjM9oIXgB9JH0wSQ86k7C2Lf25MzayfkahYib4/edit?usp=sharing" },
            { title: "ファシリテーション&レビュー方法", url: "https://docs.google.com/presentation/d/1TdIsjPcKPR6NsP6vc2mv13p8ZfmGxuODobnBWOtRNXM/edit?usp=sharing" },
            { title: "作品、道具、素材の扱い方", url: "https://docs.google.com/presentation/d/1Y_7XEnLeQ79se5FBDFilL4AubNdA-tQn2k3lrA_GeiI/edit?usp=sharing" },
            { title: "時給&シフト管理", url: "https://docs.google.com/presentation/d/1IyTND2hSQ4IAyxW8EHe5DMlT5KLOs2OjF46Hr2ZbFLE/edit?usp=sharing" },
            { title: "緊急対応", url: "https://docs.google.com/presentation/d/1SsEa1Y5HfbO_KYxyVyXLqD9kzPA21jehXEkF14f66PY/edit?usp=sharing" },
            { title: "保護者アンケート", url: "https://docs.google.com/presentation/d/16wXORXZtBSdz7SvjVtYOtJsgqwEg7fguYeZP8wQTi1I/edit?usp=sharing" },
          ].map((doc) => (
            <a
              key={doc.url}
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100 hover:bg-brand-50 hover:border-brand-200 transition-colors"
            >
              <span className="text-brand-600 shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </span>
              <span className="text-xs font-medium text-gray-700 leading-tight">{doc.title}</span>
            </a>
          ))}
        </div>
      </div>
      {/* 給与不備 報告モーダル */}
      {reportModalOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          onClick={() => !reportSending && setReportModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-gray-800 mb-1">給与の不備を管理者に報告</h3>
            <p className="text-xs text-gray-500 mb-3">
              {month}月分の給与について、金額や明細の間違い、確認したいことなどを記入してください。
            </p>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              rows={5}
              placeholder="例: 4/13の出退勤時刻が実際と違います。13:00-17:00で勤務しました。"
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              disabled={reportSending}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setReportModalOpen(false)}
                disabled={reportSending}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleSubmitPayrollReport}
                disabled={reportSending || reportText.trim().length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {reportSending ? "送信中..." : "送信"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI-SATO-β Animation Modal */}
      {animationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setAnimationModal(null)}
          style={{ animation: "fadeIn 0.3s ease-out" }}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white rounded-2xl p-6 mx-6 max-w-sm w-full"
            style={{ animation: "bounceIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)" }}
          >
            <div className="flex flex-col items-center text-center">
              {/* Confetti-like decorations */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-3xl" style={{ animation: "bounceIn 0.6s ease-out" }}>
                {animationModal.type === "checkin" ? "🎨" : "🌟"}
              </div>
              <div className="mt-4 mb-3">
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold ${
                    animationModal.type === "checkin" ? "bg-green-500" : "bg-orange-500"
                  }`}
                  style={{ animation: "pulse 1s ease-in-out" }}
                >
                  {animationModal.type === "checkin" ? "IN" : "OUT"}
                </div>
              </div>
              <div className="text-lg font-bold text-gray-800 mb-3">
                {animationModal.type === "checkin" ? "チェックイン完了！" : "チェックアウト完了！"}
              </div>
              <div className="flex items-start gap-3 bg-pink-50 rounded-xl p-3 w-full">
                <img src="/sato.png" alt="AI-SATO-β" className="rounded-full object-cover shrink-0" style={{ width: 40, height: 40 }} />
                <div className="text-left">
                  <div className="text-[10px] font-medium text-pink-600 mb-0.5">AI-SATO-β</div>
                  <p className="text-sm text-gray-700">{animationModal.message}</p>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-400">タップして閉じる</div>
            </div>
          </div>
        </div>
      )}

      {/* Animation Keyframes */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes bounceIn {
          0% { opacity: 0; transform: scale(0.3); }
          50% { opacity: 1; transform: scale(1.05); }
          70% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        .sparkle-container {
          position: absolute;
          inset: -20px;
          pointer-events: none;
        }
        .sparkle {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: gold;
          animation: sparkleOut 1s ease-out forwards;
          animation-delay: calc(var(--i) * 0.05s);
          opacity: 0;
        }
        .sparkle:nth-child(odd) {
          background: #fbbf24;
          width: 4px;
          height: 4px;
        }
        .sparkle:nth-child(3n) {
          background: #f472b6;
          width: 5px;
          height: 5px;
        }
        .sparkle:nth-child(4n+1) {
          background: #60a5fa;
        }
        @keyframes sparkleOut {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) rotate(calc(var(--i) * 30deg)) translateY(0);
          }
          60% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) rotate(calc(var(--i) * 30deg)) translateY(-70px);
          }
        }
      `}</style>

      {/* 画像生成用の非表示シフト表 */}
      {shift && schedule && (
        <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
          <div ref={shiftImageRef} style={{ width: 120 + Math.max(...schedule.days.map((day) => {
            const uids = new Set<string>();
            day.slots.filter((s) => s.needsFacilitator && s.classType).forEach((slot) => {
              (shift.assignments?.[getSlotKey(day.date, slot.time)] || []).forEach((uid) => uids.add(uid));
            });
            return uids.size;
          }), 1) * 120, padding: "20px 16px", backgroundColor: "#fff", fontFamily: "sans-serif" }}>
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: "#1f2937" }}>{month}月 シフト表</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", marginTop: 4 }}>※ 10:30の回→30分前（10:00）集合 ／ 他の時間帯→10分前集合</div>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 16 }}>
              {["カリキュラム", "オーダーメイド"].map((type) => {
                const c = CLASS_TYPE_COLORS[type];
                return (
                  <span key={type} style={{ backgroundColor: c.bg, color: c.text, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500 }}>
                    {type}
                  </span>
                );
              })}
            </div>
            {schedule.days.map((day) => {
              const activeSlots = day.slots.filter((s) => s.needsFacilitator && s.classType);
              if (activeSlots.length === 0) return null;
              const dayFacUids: string[] = [];
              activeSlots.forEach((slot) => {
                (shift.assignments?.[getSlotKey(day.date, slot.time)] || []).forEach((uid) => {
                  if (!dayFacUids.includes(uid)) dayFacUids.push(uid);
                });
              });
              const facCells: Record<string, { show: boolean; rowSpan: number; assigned: boolean }[]> = {};
              dayFacUids.forEach((uid) => {
                const cells: { show: boolean; rowSpan: number; assigned: boolean }[] = [];
                let i = 0;
                while (i < activeSlots.length) {
                  const k = getSlotKey(day.date, activeSlots[i].time);
                  if ((shift.assignments?.[k] || []).includes(uid)) {
                    let span = 1;
                    while (i + span < activeSlots.length) {
                      const nk = getSlotKey(day.date, activeSlots[i + span].time);
                      if ((shift.assignments?.[nk] || []).includes(uid)) span++;
                      else break;
                    }
                    cells.push({ show: true, rowSpan: span, assigned: true });
                    for (let j = 1; j < span; j++) cells.push({ show: false, rowSpan: 0, assigned: true });
                    i += span;
                  } else {
                    cells.push({ show: true, rowSpan: 1, assigned: false });
                    i++;
                  }
                }
                facCells[uid] = cells;
              });
              const facNameMap: Record<string, string> = {};
              activeSlots.forEach((slot) => {
                const k = getSlotKey(day.date, slot.time);
                const uids = shift.assignments?.[k] || [];
                const names = shift.assignmentNames?.[k] || [];
                uids.forEach((uid, i) => { if (!facNameMap[uid]) facNameMap[uid] = names[i] || uid; });
              });
              const imgSlotTimes = activeSlots.map((s) => s.time);
              const imgIdx12 = imgSlotTimes.indexOf("12:00");
              const imgIdx14 = imgSlotTimes.indexOf("14:30");
              const imgHasBreak = imgIdx12 !== -1 && imgIdx14 !== -1 && imgIdx14 === imgIdx12 + 1;
              if (imgHasBreak) {
                dayFacUids.forEach((uid) => {
                  const cells = facCells[uid];
                  if (cells[imgIdx12].assigned && cells[imgIdx14].assigned) {
                    let startIdx = imgIdx12;
                    while (startIdx > 0 && !cells[startIdx].show) startIdx--;
                    cells[startIdx].rowSpan += 1;
                  }
                });
              }
              return (
                <div key={day.date} style={{ marginBottom: 16 }}>
                  <div style={{ backgroundColor: "#f3f4f6", padding: "6px 12px", borderRadius: 6, marginBottom: 4, fontSize: 14, fontWeight: "bold", color: "#374151" }}>
                    {formatDateShort(day.date)}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {activeSlots.map((slot, slotIdx) => {
                        const key = getSlotKey(day.date, slot.time);
                        const colors = CLASS_TYPE_COLORS[slot.classType!];
                        const assignedCount = (shift.assignments?.[key] || []).length;
                        const required = getRequiredFacilitators(slot.childCount);
                        const isShort = required > 0 && assignedCount < required;
                        return (
                          <Fragment key={key}>
                          <tr>
                            <td style={{ border: "1px solid #e5e7eb", padding: "6px 10px", verticalAlign: "top", width: 120 }}>
                              <div style={{ fontSize: 10, color: "#9ca3af" }}>集合 {getAssemblyTime(slot.time)}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", backgroundColor: colors.bg, border: `2px solid ${colors.border}`, flexShrink: 0 }} />
                                <span style={{ fontWeight: "bold", color: "#4b5563", fontSize: 13 }}>{slot.time}</span>
                              </div>
                              {slot.childCount && (
                                <div style={{ fontSize: 13, fontWeight: "bold", color: "#059669", marginTop: 2, paddingLeft: 15 }}>子{slot.childCount}名</div>
                              )}
                              {isShort && (
                                <div style={{ fontSize: 11, fontWeight: "bold", color: "#dc2626", marginTop: 2, paddingLeft: 15 }}>⚠ あと{required - assignedCount}名</div>
                              )}
                            </td>
                            {dayFacUids.map((uid) => {
                              const cell = facCells[uid][slotIdx];
                              if (!cell.show) return null;
                              return (
                                <td
                                  key={uid}
                                  rowSpan={cell.rowSpan}
                                  style={{
                                    border: "1px solid #e5e7eb",
                                    padding: "6px 10px",
                                    textAlign: "center",
                                    fontSize: 13,
                                    fontWeight: 500,
                                    verticalAlign: "middle",
                                    backgroundColor: cell.assigned ? "#eff6ff" : undefined,
                                    color: cell.assigned ? "#374151" : undefined,
                                  }}
                                >
                                  {cell.assigned ? <>{facNameMap[uid]}<br /><span style={{ fontSize: 11 }}>さん</span></> : ""}
                                </td>
                              );
                            })}
                          </tr>
                          {imgHasBreak && slotIdx === imgIdx12 && (
                            <tr>
                              <td style={{ border: "1px solid #e5e7eb", padding: "4px 10px", textAlign: "center", fontSize: 11, color: "#6b7280", fontWeight: 500, backgroundColor: "#f9fafb" }}>
                                🍙 休憩<br />13:30〜14:15
                              </td>
                              {dayFacUids.map((uid) => {
                                const spansBreak = facCells[uid][imgIdx12].assigned && facCells[uid][imgIdx14].assigned;
                                if (spansBreak) return null;
                                return <td key={uid} style={{ border: "1px solid #e5e7eb", backgroundColor: "#f9fafb" }} />;
                              })}
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
