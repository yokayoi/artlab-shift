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
  /** slotKey → 管理者が手動指定した必要ファシリテーター数（childCount から自動計算される値を上書き） */
  slotRequiredOverrides?: Record<string, number>;
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

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
