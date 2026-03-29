import { Timestamp } from "firebase/firestore";

export type ClassType = "カリキュラム" | "オーダーメイド" | "オーダーテック";
export type MonthStatus = "draft" | "collecting" | "shift_created" | "published";
export type UserRole = "admin" | "facilitator";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  nickname?: string;
  photoURL?: string;
  role: UserRole;
  hourlyRate?: number;
  classCount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type FacilitatorTier = "none" | "bronze" | "silver" | "gold" | "platinum";

export interface SlotDefinition {
  time: string;
  classType: ClassType | null;
  needsFacilitator: boolean;
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
