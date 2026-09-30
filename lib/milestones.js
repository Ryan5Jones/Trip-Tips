import { Resend } from "resend";
import { db } from "./db";
import { getSetting } from "./settings";

const resend = new Resend(process.env.RESEND_API_KEY);

// One-time reminders to Ryan when the subscriber count crosses a milestone.
// Each milestone emails once, then records "milestone:<n>" in social_state so it never repeats.
const MILESTONES = [
  {
    count: 100,
    subject: "🎉 Destinations Daily just hit 100 subscribers",
    body: (n) =>
      `You now have ${n} active subscribers.\n\n` +
      `Reminder you asked for: consider adding a "Text me instead" option at signup (daily tip by SMS).\n` +
      `- Cost: ~1 cent per text via Twilio, plus ~$1.15/month for the number and ~$2-10/month registration fees.\n` +
      `- Setup: US carriers require "A2P 10DLC" registration first (1-3 weeks to approve).\n` +
      `- Needs: consent checkbox, "Reply YES" confirmation text, STOP/HELP handling, daytime-only sending.\n\n` +
      `Open your Claude chat and say "let's add texting" to get started. Details are in CLAUDE.md in your repo.`,
  },
];

export async function checkMilestones() {
  const owner = await getSetting("owner_email", null);
  if (!owner) return;
  const { count } = await db
    .from("subscribers")
    .select("id", { count: "exact", head: true })
    .eq("confirmed", true)
    .eq("unsubscribed", false);

  for (const m of MILESTONES) {
    if ((count || 0) < m.count) continue;
    const key = `milestone:${m.count}`;
    const { data: done } = await db.from("social_state").select("key").eq("key", key).maybeSingle();
    if (done) continue;
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: owner,
      subject: m.subject,
      text: m.body(count),
    });
    if (!error) {
      await db.from("social_state").upsert({ key, value: { notified_at: new Date().toISOString(), count } });
    } else {
      console.error("Milestone email failed:", error);
    }
  }
}
