import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  onSnapshot,
  increment,
} from "firebase/firestore";
import { getFirebaseDb } from "./config";
import {
  UserProfile,
  MonthSchedule,
  Availability,
  ShiftAssignment,
  MonthStatus,
  DaySchedule,
  Announcement,
} from "../types";

// ===== Users =====

export async function getUser(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(getFirebaseDb(), "users", uid));
  return snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null;
}

export async function createUser(profile: Omit<UserProfile, "createdAt" | "updatedAt">) {
  const now = Timestamp.now();
  await setDoc(doc(getFirebaseDb(), "users", profile.uid), {
    ...profile,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateUserRole(uid: string, role: "admin" | "facilitator") {
  await updateDoc(doc(getFirebaseDb(), "users", uid), { role, updatedAt: Timestamp.now() });
}

export async function updateUserHourlyRate(uid: string, hourlyRate: number) {
  await updateDoc(doc(getFirebaseDb(), "users", uid), { hourlyRate, updatedAt: Timestamp.now() });
}

export async function updateUserProfile(uid: string, data: { nickname?: string; photoURL?: string }) {
  await updateDoc(doc(getFirebaseDb(), "users", uid), { ...data, updatedAt: Timestamp.now() });
}

export async function deleteUserDoc(uid: string) {
  await deleteDoc(doc(getFirebaseDb(), "users", uid));
}

export async function updateUserClassCount(uid: string, count: number) {
  await updateDoc(doc(getFirebaseDb(), "users", uid), { classCount: increment(count), updatedAt: Timestamp.now() });
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(getFirebaseDb(), "users"));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile));
}

export async function getFacilitators(): Promise<UserProfile[]> {
  const q = query(collection(getFirebaseDb(), "users"), where("role", "==", "facilitator"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile));
}

// ===== Schedules =====

export async function getSchedule(monthId: string): Promise<MonthSchedule | null> {
  const snap = await getDoc(doc(getFirebaseDb(), "schedules", monthId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as MonthSchedule) : null;
}

export async function createSchedule(monthId: string, days: DaySchedule[], createdBy: string) {
  const now = Timestamp.now();
  await setDoc(doc(getFirebaseDb(), "schedules", monthId), {
    status: "draft",
    createdBy,
    days,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateSchedule(monthId: string, data: Partial<MonthSchedule>) {
  await updateDoc(doc(getFirebaseDb(), "schedules", monthId), {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

export async function updateScheduleStatus(monthId: string, status: MonthStatus) {
  await updateDoc(doc(getFirebaseDb(), "schedules", monthId), {
    status,
    updatedAt: Timestamp.now(),
  });
}

export function onScheduleChange(monthId: string, callback: (schedule: MonthSchedule | null) => void) {
  return onSnapshot(doc(getFirebaseDb(), "schedules", monthId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as MonthSchedule) : null);
  });
}

// ===== Availabilities =====

export async function getAvailability(monthId: string, uid: string): Promise<Availability | null> {
  const docId = `${monthId}_${uid}`;
  const snap = await getDoc(doc(getFirebaseDb(), "availabilities", docId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Availability) : null;
}

export async function saveAvailability(
  monthId: string,
  uid: string,
  facilitatorName: string,
  slots: Record<string, boolean>
) {
  const docId = `${monthId}_${uid}`;
  const now = Timestamp.now();
  await setDoc(doc(getFirebaseDb(), "availabilities", docId), {
    monthId,
    facilitatorId: uid,
    facilitatorName,
    slots,
    submittedAt: now,
    updatedAt: now,
  });
}

export async function getMonthAvailabilities(monthId: string): Promise<Availability[]> {
  const q = query(collection(getFirebaseDb(), "availabilities"), where("monthId", "==", monthId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Availability));
}

// ===== Shifts =====

export async function getShift(monthId: string): Promise<ShiftAssignment | null> {
  const snap = await getDoc(doc(getFirebaseDb(), "shifts", monthId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as ShiftAssignment) : null;
}

export async function saveShift(
  monthId: string,
  assignments: Record<string, string[]>,
  assignmentNames: Record<string, string[]>,
  createdBy: string
) {
  const now = Timestamp.now();
  await setDoc(doc(getFirebaseDb(), "shifts", monthId), {
    monthId,
    assignments,
    assignmentNames,
    createdBy,
    createdAt: now,
    updatedAt: now,
  });
}

export function onShiftChange(monthId: string, callback: (shift: ShiftAssignment | null) => void) {
  return onSnapshot(doc(getFirebaseDb(), "shifts", monthId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as ShiftAssignment) : null);
  });
}

// ===== Announcements =====

export async function getActiveAnnouncements(): Promise<Announcement[]> {
  const q = query(collection(getFirebaseDb(), "announcements"), where("active", "==", true));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement));
}

export async function getAllAnnouncements(): Promise<Announcement[]> {
  const snap = await getDocs(collection(getFirebaseDb(), "announcements"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement));
}

export async function createAnnouncement(title: string, body: string, createdBy: string) {
  const now = Timestamp.now();
  const ref = doc(collection(getFirebaseDb(), "announcements"));
  await setDoc(ref, { title, body, createdBy, active: true, createdAt: now, updatedAt: now });
}

export async function toggleAnnouncement(id: string, active: boolean) {
  await updateDoc(doc(getFirebaseDb(), "announcements", id), { active, updatedAt: Timestamp.now() });
}

export async function deleteAnnouncement(id: string) {
  await deleteDoc(doc(getFirebaseDb(), "announcements", id));
}

// ===== Super Satoko Message =====

export async function getSatokoMessage(): Promise<string> {
  const snap = await getDoc(doc(getFirebaseDb(), "settings", "satokoMessage"));
  return snap.exists() ? (snap.data().body || "") : "";
}

export async function setSatokoMessage(body: string) {
  await setDoc(doc(getFirebaseDb(), "settings", "satokoMessage"), { body, updatedAt: Timestamp.now() });
}

// ===== Schedule Queries =====

export async function getCollectingSchedules(): Promise<MonthSchedule[]> {
  const q = query(collection(getFirebaseDb(), "schedules"), where("status", "==", "collecting"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MonthSchedule));
}
