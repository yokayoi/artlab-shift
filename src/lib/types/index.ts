import { Timestamp } from "firebase/firestore";

export type ClassType = "カリキュラム" | "オーダーメイド";
export type MonthStatus = "draft" | "collecting" | "shift_created" | "published";
export type UserRole = "admin" | "facilitator";

export interface BankAccount {
  bankName: string;
  branchName: string;
  accountType: "普通" | "当座";
  accountNumber: string;
  accountHolder: string;
}

export interface FacilitatorIntro {
  name: string;
  strengths: string;
  experience: string;
  dream: string;
  message: string;
  status: "draft" | "confirmed";
  updatedAt: Timestamp;
  confirmedAt?: Timestamp;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  nickname?: string;
  photoURL?: string;
  role: UserRole;
  hourlyRate?: number;
  transportCost?: number;
  classCount?: number;
  bankAccount?: BankAccount;
  lineUserId?: string;
  lineDisplayName?: string;
  facilitatorIntro?: FacilitatorIntro;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AttendanceRecord {
  checkIn: Timestamp | null;
  checkOut: Timestamp | null;
  editedBy?: string;
}

export interface Attendance {
  id: string;
  monthId: string;
  facilitatorId: string;
  records: Record<string, AttendanceRecord>;
  updatedAt: Timestamp;
}

export type FacilitatorTier = "none" | "bronze" | "silver" | "gold" | "platinum";

export interface SlotDefinition {
  time: string;
  classType: ClassType | null;
  needsFacilitator: boolean;
  childCount?: number;
}

export interface DaySchedule {
  date: string;
  dayLabel: string;
  slots: SlotDefinition[];
}

export interface MonthSchedule {
  id: string;
  status: MonthStatus;
  createdBy: string;
  days: DaySchedule[];
  deadline?: string;
  slotNotes?: Record<string, string>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Availability {
  id: string;
  monthId: string;
  facilitatorId: string;
  facilitatorName: string;
  slots: Record<string, boolean>;
  submittedAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ShiftAssignment {
  id: string;
  monthId: string;
  assignments: Record<string, string[]>;
  assignmentNames: Record<string, string[]>;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PayrollDayDetail {
  dayKey: string;
  checkIn: Timestamp | null;
  checkOut: Timestamp | null;
  minutes: number;
  slotCount: number;
}

export interface PayrollConfirmation {
  monthId: string;
  facilitatorId: string;
  confirmedAt: Timestamp;
  confirmedBy: string;
  totalPay: number;
  classPay: number;
  transportCost: number;
  totalMinutes: number;
  breakMinutes: number;
  slotCount: number;
  hourlyRate: number;
  days: PayrollDayDetail[];
  carryOverIn?: number;
  carryOverOut?: number;
  isDeferred?: boolean;
}

export interface PayrollCarryOver {
  monthId: string;
  facilitatorId: string;
  amount: number;
  note?: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface PayrollAcknowledgment {
  monthId: string;
  facilitatorId: string;
  facilitatorName: string;
  acknowledgedAt: Timestamp;
}

export type PayrollReportStatus = "open" | "resolved";

export interface PayrollReport {
  id: string;
  monthId: string;
  facilitatorId: string;
  facilitatorName: string;
  message: string;
  status: PayrollReportStatus;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
  adminResponse?: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
