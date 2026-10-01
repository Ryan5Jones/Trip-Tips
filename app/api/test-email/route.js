// Temporary: sends one personal note from Ryan to Tori with her Passport Quest test link.
// Locked by "setting:diag_token"; removed right after use.
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const expected = await getSetting("diag_token", null);
  if (!expected || new URL(req.url).searchParams.get("token") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/practice/afd06d89-e157-4744-bf11-8ba2c804eb04`;
  const code = "F3679BDC4C";
  const text = [
    "Hey Tori!",
    "Ryan here. Could you help me test the new language game I built for Destinations Daily? It's a quick, silent game where you beat the clock learning phrases for a trip.",
    `Here's your own link (I set up a Lisbon test profile for you): ${link}`,
    `Play a round all the way to the results screen. Then paste my friend code into the "Have a friend's code?" box and tap "Join their group": ${code}. That puts us both on the same leaderboard.`,
    "Tell me anything that's confusing, broken, or just feels off. Just hit reply.",
    "Thanks!\nRyan",
  ].join("\n\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">${text
    .split("\n\n")
    .map((p) => `<p>${p.replace(link, `<a href="${link}">${link}</a>`).replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: "tori.tyson21@gmail.com",
    subject: "Can you test my new game?",
    text,
    html,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sent: 1, id: data?.id });
}
