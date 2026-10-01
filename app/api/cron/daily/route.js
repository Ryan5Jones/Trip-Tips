import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPersonalContent } from "@/lib/personalContent";
import { sendDaily } from "@/lib/email";
import { getSetting } from "@/lib/settings";
import { checkMilestones } from "@/lib/milestones";
import { getEmailPhoto } from "@/lib/emailPhotos";
import { THEMES } from "@/lib/content";
import { firstNameFor } from "@/lib/names";
import { getDailyPhrase, ensurePhrases } from "@/lib/phrases";
import { getFoodList } from "@/lib/food";

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

  // Supabase switch "setting:daily_personal_line": add a personal question to every daily email
  const personalLine = String(await getSetting("daily_personal_line", "false")) === "true";
  // Supabase switch "setting:email_photos": add a photo matching the tip or fun fact
  const withPhotos = String(await getSetting("email_photos", "false")) === "true";
  // Supabase switch "setting:daily_phrase": add a daily phrase in the destination's language
  const withPhrase = String(await getSetting("daily_phrase", "false")) === "true";

  // Switch "setting:replies_live": replies really reach us, so emails can say they tailor future tips
  const replyLive = String(await getSetting("replies_live", "false")) === "true";

  // Switch "setting:food_list": on food-and-dining days (theme 2), link the "Food to try" page
  const withFood = String(await getSetting("food_list", "false")) === "true";

  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    try {
      const { tip, fact } = await getPersonalContent(s, s.emails_sent);
      let photo = null;
      if (withPhotos) {
        photo = await getEmailPhoto(s.destination, s.emails_sent % THEMES.length, tip, fact).catch(() => null);
      }
      const phrase = withPhrase ? await getDailyPhrase(s.destination, s.emails_sent, tip, fact).catch(() => null) : null;
      // Starter pack for the practice game: phrases 0..2 (or up to today's) must exist
      if (phrase) await ensurePhrases(s.destination, Math.max(2, s.emails_sent)).catch(() => null);
      const foodDay = withFood && s.emails_sent % THEMES.length === 1;
      if (foodDay) await getFoodList(s.destination).catch((e) => console.error("FOOD_LIST failed:", e));
      const daysLeft = Math.round((new Date(s.start_date) - new Date(today)) / 86400000);
      const tipNumber = s.emails_sent + 1;
      const resendEmailId = await sendDaily({
        email: s.email, destination: s.destination, token: s.token, daysLeft, tipNumber, tip, fact,
        startDate: s.start_date, endDate: s.end_date, personalLine, photo,
        firstName: firstNameFor(s), phrase, groupCode: s.group_code || s.share_code, replyLive, foodDay,
      });
      // Record the send so opens/clicks can be matched to it (never blocks the email)
      if (resendEmailId) {
        const { error: logError } = await db.from("email_sends").insert({
          resend_email_id: resendEmailId,
          subscriber_email: s.email,
          destination: s.destination,
          tip_number: tipNumber,
          days_left: daysLeft,
        });
        if (logError) console.error("Could not record send for", s.id, logError);
      }
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
  // One-time reminder emails to Ryan at subscriber milestones (never blocks the daily send)
  try {
    await checkMilestones();
  } catch (e) {
    console.error("Milestone check failed:", e);
  }

  return NextResponse.json({ sent, failed });
}
