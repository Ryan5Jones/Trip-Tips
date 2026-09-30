// Temporary: sends Ryan [TEST] daily emails with the daily phrase. Locked by "setting:diag_token";
// only sends to "setting:test_email". ?dest=Paris%2C%20France&day=0 picks destination + phrase day.
import { NextResponse } from "next/server";
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
  const destination = params.get("dest") || "Paris, France";
  const day = Number(params.get("day") || 0);
  try {
    const { tip, fact } = await getContent(destination, day);
    const phrase = await getDailyPhrase(destination, day, tip, fact);
    await sendDaily({
      email: to, destination, token: "00000000-0000-0000-0000-000000000000", daysLeft: 45 - day,
      tipNumber: day + 2, tip, fact, startDate: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10),
      endDate: "", subjectPrefix: "[TEST] ", personalLine: true, firstName: firstNameFor({ email: to }), phrase,
    });
    return NextResponse.json({ sent: 1, destination, tip, fact, phrase });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
