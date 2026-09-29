import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getContent } from "@/lib/content";
import { sendDaily } from "@/lib/email";

export const maxDuration = 300;

export async function GET(req) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Confirmed, still subscribed, trip hasn't started, not already emailed today
  const { data: subs, error } = await db
    .from("subscribers")
    .select("*")
    .eq("confirmed", true)
    .eq("unsubscribed", false)
    .gt("start_date", today)
    .or(`last_sent_on.is.null,last_sent_on.lt.${today}`)
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    try {
      const { tip, fact } = await getContent(s.destination, s.emails_sent);
      const daysLeft = Math.round((new Date(s.start_date) - new Date(today)) / 86400000);
      await sendDaily({ email: s.email, destination: s.destination, token: s.token, daysLeft, tip, fact });
      await db
        .from("subscribers")
        .update({ emails_sent: s.emails_sent + 1, last_sent_on: today })
        .eq("id", s.id);
      sent++;
    } catch (e) {
      console.error("Failed for", s.id, e);
      failed++;
    }
  }
  return NextResponse.json({ sent, failed });
}
