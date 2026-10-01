// Temporary: sends the owner ONE real-looking food-day daily email (with the Food to try link).
// Locked by "setting:diag_token"; sends only to "setting:test_email"; does not touch emails_sent; removed right after use.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getPersonalContent } from "@/lib/personalContent";
import { sendDaily } from "@/lib/email";
import { firstNameFor } from "@/lib/names";
import { getDailyPhrase, ensurePhrases } from "@/lib/phrases";
import { getFoodList } from "@/lib/food";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req) {
  const expected = await getSetting("diag_token", null);
  const to = await getSetting("test_email", null);
  if (!expected || !to || new URL(req.url).searchParams.get("token") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: s } = await db.from("subscribers").select("*").eq("email", to).eq("destination", "lisbon, portugal")
    .order("created_at").limit(1).maybeSingle();
  if (!s) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const idx = 11; // emails_sent % 10 == 1 -> a food day (tip #12)
  const { tip, fact } = await getPersonalContent(s, idx);
  const phrase = await getDailyPhrase(s.destination, idx, tip, fact).catch(() => null);
  if (phrase) await ensurePhrases(s.destination, idx).catch(() => null);
  await getFoodList(s.destination).catch(() => null);
  const daysLeft = Math.round((new Date(s.start_date) - new Date()) / 86400000);
  const id = await sendDaily({
    email: to, destination: s.destination, token: s.token, daysLeft, tipNumber: idx + 1, tip, fact,
    startDate: s.start_date, endDate: s.end_date, personalLine: true, photo: null,
    firstName: firstNameFor(s), phrase, groupCode: s.group_code || s.share_code, replyLive: false, foodDay: true,
    subjectPrefix: "[TEST] ",
  });
  return NextResponse.json({ sent: 1, id });
}
