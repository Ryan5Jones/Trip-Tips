// Temporary: emails the owner his own Passport Quest link so he can test it on his phone.
// Locked by "setting:diag_token"; sends only to "setting:test_email"; removed right after use.
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const expected = await getSetting("diag_token", null);
  const to = await getSetting("test_email", null);
  if (!expected || !to || new URL(req.url).searchParams.get("token") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: s } = await db
    .from("subscribers").select("token, share_code, group_code").eq("email", to).eq("destination", "lisbon, portugal")
    .order("created_at").limit(1).maybeSingle();
  if (!s) return NextResponse.json({ error: "No profile" }, { status: 404 });
  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/practice/${s.token}`;
  const text = [
    "Hey Ryan!",
    `Here's your Passport Quest link to test on your phone: ${link}`,
    `Your friend code is ${(s.group_code || s.share_code).toUpperCase()}.`,
    "Things to try: tap the answers (does it feel snappy now?), tap the speaker button next to a phrase, and play all the way to the results screen for the globe and leaderboard.",
  ].join("\n\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">${text
    .split("\n\n").map((p) => `<p>${p.replace(link, `<a href="${link}">${link}</a>`)}</p>`).join("")}</div>`;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM, to, subject: "Your game test link", text, html,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sent: 1, id: data?.id });
}
