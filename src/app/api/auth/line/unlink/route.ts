import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  // Verify Firebase auth token
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { getApps } = await import("firebase-admin/app");
    const app = getApps()[0];
    const decoded = await getAuth(app).verifyIdToken(token);

    const db = getAdminDb();
    await db.collection("users").doc(decoded.uid).update({
      lineUserId: FieldValue.delete(),
      lineDisplayName: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
