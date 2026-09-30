// Temporary: sends Ryan a [TEST] sample daily tip. Locked by a one-time token in Supabase
// (social_state "setting:diag_token"); only sends to "setting:test_email". Links are dummies.
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { getContent } from "@/lib/content";
import { sendDaily } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  const expected = await getSetting("diag_token", null);
  const to = await getSetting("test_email", null);
  if (!expected || !token || token !== expected || !to) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const destination = "Maui, Hawaii";
  const start = "2026-12-01";
  try {
    const { tip, fact } = await getContent(destination, 5);
    await sendDaily({
      email: to, destination, token: "00000000-0000-0000-0000-000000000000", daysLeft: 62, tipNumber: 2, personalLine: true,
      tip, fact, startDate: start, endDate: "", subjectPrefix: "[TEST] ",
    });
    return NextResponse.json({ sent: 1 });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
