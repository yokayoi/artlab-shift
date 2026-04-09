import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code || !state) {
    return NextResponse.redirect(new URL(`/profile?line=error&detail=params_missing_or_denied`, req.url));
  }

  const [uid] = state.split(":");
  if (!uid) {
    return NextResponse.redirect(new URL(`/profile?line=error&detail=no_uid`, req.url));
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${req.nextUrl.origin}/api/auth/line/callback`,
        client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
        client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET!,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("LINE token exchange failed:", tokenRes.status, errText);
      return NextResponse.redirect(new URL(`/profile?line=error&detail=token_${tokenRes.status}`, req.url));
    }

    const tokenData = await tokenRes.json();

    // Get LINE profile
    const profileRes = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      return NextResponse.redirect(new URL(`/profile?line=error&detail=profile_${profileRes.status}`, req.url));
    }

    const lineProfile = await profileRes.json();

    // Save to Firestore
    const db = getAdminDb();
    await db.collection("users").doc(uid).update({
      lineUserId: lineProfile.userId,
      lineDisplayName: lineProfile.displayName,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.redirect(new URL("/profile?line=success", req.url));
  } catch (e) {
    console.error("LINE OAuth callback error:", e);
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.redirect(new URL(`/profile?line=error&detail=catch_${encodeURIComponent(msg.slice(0, 100))}`, req.url));
  }
}
