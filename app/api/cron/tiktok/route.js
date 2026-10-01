// Daily TikTok photo carousel DRAFT. Runs once a day (vercel.json, 16:30 UTC).
// Step 1 (built): writes the carousel text + picks a photo and saves it to `tiktok_posts` (the slide images are served at
//   /api/tiktok/slide/<date>/<n>). Manual preview: /api/cron/tiktok?secret=CRON_SECRET (add &regenerate=1 for a new one).
// Step 2 (needs Ryan's TikTok developer app + login, not built yet): send the slides to his TikTok inbox.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { THEMES, getContent } from "@/lib/content";
import { findMatchingPhoto } from "@/lib/emailPhotos";
import { findDestinationPhoto } from "@/lib/photos";
import { hostPhoto } from "@/lib/meta";
import { Resend } from "resend";
import { getSetting } from "@/lib/settings";
import { sendPhotoDraft, tiktokConfigured } from "@/lib/tiktokApi";
import { tiktokTopicFor, writeTikTok, SLIDE_COUNT } from "@/lib/tiktok";

export const maxDuration = 120;

export async function GET(req) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const authorized = secret && (req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await db.from("tiktok_posts").select("*").eq("post_date", today).maybeSingle();
  if (existing && url.searchParams.get("regenerate") !== "1") {
    const sent = await maybeSend(existing, today);
    return NextResponse.json({ mode: "draft exists", sent, ...summary(existing, today) });
  }

  try {
    const topic = tiktokTopicFor(today);
    const content = await writeTikTok(topic);
    let src = null;
    try {
      const { tip, fact } = await getContent(topic.destination, Math.max(0, THEMES.indexOf(topic.theme)));
      const m = await findMatchingPhoto(topic.destination, tip, fact);
      if (m) src = m.hit.largeUrl || m.hit.url;
    } catch (e) {
      console.error("TIKTOK matched photo failed:", e);
    }
    if (!src) src = (await findDestinationPhoto(topic.destination))?.url;
    if (!src) throw new Error("No photo found");
    const photoUrl = await hostPhoto(src, `tiktok-${today}`);
    const { data, error } = await db
      .from("tiktok_posts")
      .upsert({ post_date: today, destination: topic.destination, theme: topic.theme, ...content, photo_url: photoUrl, status: "draft", error: null }, { onConflict: "post_date" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const sent = await maybeSend(data, today);
    return NextResponse.json({ mode: "draft saved", sent, ...summary(data, today) });
  } catch (e) {
    console.error("TIKTOK generation failed:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}

function summary(row, date) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.destinationsdaily.com").replace(/\/$/, "");
  return {
    destination: row.destination, title: row.title, description: row.description,
    slides: Array.from({ length: SLIDE_COUNT }, (_, i) => `${base}/api/tiktok/slide/${date}/${i + 1}`),
  };
}

// setting:tiktok_mode: "preview" (default) = draft only; "send" = also put it in Ryan's TikTok inbox and email him the caption.
async function maybeSend(row, date) {
  if ((await getSetting("tiktok_mode", "preview")) !== "send") return "preview: not sent";
  if (row.status === "sent" || row.publish_id) return "already sent";
  if (!tiktokConfigured()) return "TikTok keys missing";
  try {
    const imageUrls = summary(row, date).slides;
    const publishId = await sendPhotoDraft({ title: row.title, description: row.description, imageUrls });
    await db.from("tiktok_posts").update({ status: "sent", publish_id: publishId, error: null }).eq("post_date", date);
    const owner = await getSetting("owner_email", null);
    if (owner && process.env.RESEND_API_KEY) {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: process.env.EMAIL_FROM,
        to: owner,
        subject: `TikTok draft ready: ${row.title}`,
        text: `Today's TikTok carousel is in your TikTok inbox. Open TikTok, tap the notification (or Inbox), add a trending sound, paste this caption and tap Post.\n\nCaption:\n${row.title}\n\n${row.description}\n`,
      });
    }
    return "sent to TikTok inbox";
  } catch (e) {
    console.error("TIKTOK send failed:", e);
    await db.from("tiktok_posts").update({ status: "failed", error: String(e.message || e).slice(0, 500) }).eq("post_date", date);
    return `failed: ${String(e.message || e)}`;
  }
}
