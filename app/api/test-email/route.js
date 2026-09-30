// Temporary: sends Ryan a [TEST] daily email built from HIS real subscription (real token, so the
// practice-game link works). Reuses today's already-sent tip so it doesn't spoil tomorrow's.
// Locked by "setting:diag_token"; only sends to "setting:test_email".
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getContent } from "@/lib/content";
import { getDailyPhrase } from "@/lib/phrases";
import { sendDaily } from "@/lib/email";
import { firstNameFor } from "@/lib/names";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const expected = await getSetting("diag_token", null);
  const to = await getSetting("test_email", null);
  if (!expected || params.get("token") !== expected || !to) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: s } = await db
    .from("subscribers").select("*").eq("email", to).eq("confirmed", true).eq("unsubscribed", false)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!s) return NextResponse.json({ error: "No active subscription for test address" }, { status: 404 });

  const day = Math.max(0, (s.emails_sent || 1) - 1); // today's already-sent content
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { tip, fact } = await getContent(s.destination, day);
    const phrase = await getDailyPhrase(s.destination, day, tip, fact);
    await sendDaily({
      email: s.email, destination: s.destination, token: s.token,
      daysLeft: Math.round((new Date(s.start_date) - new Date(today)) / 86400000),
      tipNumber: day + 2, tip, fact, startDate: s.start_date, endDate: s.end_date,
      subjectPrefix: "[TEST] ", personalLine: true, firstName: firstNameFor(s), phrase,
    });
    return NextResponse.json({ sent: 1, destination: s.destination, phrase });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
