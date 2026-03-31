import { DaySchedule, SlotDefinition } from "../types";
import { TIME_SLOTS } from "./constants";

interface ClassDay {
  date: string;
  dayLabel: string;
  weekNumber: 2 | 3;
  dayOfWeek: "saturday" | "sunday";
}

export function getClassDays(year: number, month: number): ClassDay[] {
  const days: ClassDay[] = [];
  const saturdays: Date[] = [];
  const sundays: Date[] = [];

  // Find all Saturdays and Sundays in the month
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() === 6) saturdays.push(date);
    if (date.getDay() === 0) sundays.push(date);
  }

  // 2nd Saturday
  if (saturdays.length >= 2) {
    days.push({
      date: formatDate(saturdays[1]),
      dayLabel: "第2土曜",
      weekNumber: 2,
      dayOfWeek: "saturday",
    });
  }

  // 2nd Sunday
  if (sundays.length >= 2) {
    days.push({
      date: formatDate(sundays[1]),
      dayLabel: "第2日曜",
      weekNumber: 2,
      dayOfWeek: "sunday",
    });
  }

  // 3rd Saturday
  if (saturdays.length >= 3) {
    days.push({
      date: formatDate(saturdays[2]),
      dayLabel: "第3土曜",
      weekNumber: 3,
      dayOfWeek: "saturday",
    });
  }

  // 3rd Sunday
  if (sundays.length >= 3) {
    days.push({
      date: formatDate(sundays[2]),
      dayLabel: "第3日曜",
      weekNumber: 3,
      dayOfWeek: "sunday",
    });
  }

  return days;
}

export function generateSlots(day: ClassDay): SlotDefinition[] {
  return TIME_SLOTS.map((time) => ({
    time,
    classType: null,
    needsFacilitator: !(day.weekNumber === 2 && day.dayOfWeek === "sunday" && time === "16:00"),
  }));
}

export function generateDaySchedules(year: number, month: number): DaySchedule[] {
  const classDays = getClassDays(year, month);
  return classDays.map((day) => ({
    date: day.date,
    dayLabel: day.dayLabel,
    slots: generateSlots(day),
  }));
}

export function getSlotKey(date: string, time: string): string {
  return `${date}_${time}`;
}

export function parseMonthId(monthId: string): { year: number; month: number } {
  const [year, month] = monthId.split("-").map(Number);
  return { year, month };
}

export function formatMonthId(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getMonth() + 1}/${date.getDate()}(${dayNames[date.getDay()]})`;
}

export function getDeadline(year: number, month: number): Date {
  const classDays = getClassDays(year, month);
  const firstDay = classDays[0]; // 第2土曜
  if (!firstDay) return new Date(year, month - 1, 1);
  const deadline = new Date(firstDay.date);
  deadline.setDate(deadline.getDate() - 7);
  return deadline;
}

export function formatDeadline(year: number, month: number, customDeadline?: string): string {
  const deadline = customDeadline ? new Date(customDeadline) : getDeadline(year, month);
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  return `${deadline.getMonth() + 1}月${deadline.getDate()}日(${dayNames[deadline.getDay()]})`;
}

export function isDeadlinePassed(year: number, month: number, customDeadline?: string): boolean {
  const deadline = customDeadline ? new Date(customDeadline) : getDeadline(year, month);
  deadline.setHours(23, 59, 59);
  return new Date() > deadline;
}

export function getDeadlineDate(year: number, month: number): string {
  const deadline = getDeadline(year, month);
  return formatDate(deadline);
}

export function generateDefaultSlots(): SlotDefinition[] {
  return TIME_SLOTS.map((time) => ({
    time,
    classType: null,
    needsFacilitator: true,
  }));
}
