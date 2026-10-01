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
    return NextResponse.json({ mode: "draft exists", ...summary(existing, today) });
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
    return NextResponse.json({ mode: "draft saved (not sent to TikTok yet)", ...summary(data, today) });
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
