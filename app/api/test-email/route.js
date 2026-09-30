// Temporary: sends Ryan a [TEST] copy of the confirmation email and a sample daily tip.
// Locked by a one-time token in Supabase (social_state "setting:diag_token"); only sends to the
// address in "setting:test_email". Links inside are dummies (confirm/unsubscribe won't do anything).
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { getContent } from "@/lib/content";
import { sendConfirmation, sendDaily } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  const expected = await getSetting("diag_token", null);
  const to = await getSetting("test_email", null);
  if (!expected || !token || token !== expected || !to) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const destination = "New Orleans, USA";
  const dummy = "00000000-0000-0000-0000-000000000000";
  const start = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  try {
    await sendConfirmation({ email: to, destination, token: dummy, subjectPrefix: "[TEST] " });
    const { tip, fact } = await getContent(destination, 0);
    await sendDaily({
      email: to, destination, token: dummy, daysLeft: 30, tipNumber: 1, tip, fact,
      startDate: start, endDate: "", subjectPrefix: "[TEST] ",
    });
    return NextResponse.json({ sent: 2 });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
