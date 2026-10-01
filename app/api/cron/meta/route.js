// Daily Facebook Page + Instagram photo post. Runs once a day (vercel.json).
// Preview mode (default): writes the post and saves it to `meta_posts` WITHOUT posting.
// Turn on posting: social_state key "setting:meta_mode" = "auto" (needs the META_* env vars in Vercel).
// Manual preview: /api/cron/meta?secret=YOUR_CRON_SECRET  (add &regenerate=1 for a new draft, preview mode only)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { findMatchingPhoto } from "@/lib/emailPhotos";
import { findDestinationPhoto } from "@/lib/photos";
import { getContent } from "@/lib/content";
import { metaTopicFor, writeCaptions, hostPhoto, postToFacebook, postToInstagram, metaConfigured } from "@/lib/meta";
import { THEMES } from "@/lib/content";

export const maxDuration = 120;

export async function GET(req) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const authorized =
    secret && (req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const auto = (await getSetting("meta_mode", "preview")) === "auto";
  const today = new Date().toISOString().slice(0, 10);
  const regenerate = url.searchParams.get("regenerate") === "1" && !auto;

  const { data: existing } = await db.from("meta_posts").select("*").eq("post_date", today).maybeSingle();
  let row = existing;

  if (!row || regenerate) {
    const topic = metaTopicFor(today);
    try {
      const captions = await writeCaptions(topic);
      // Photo: one that matches the tip/fact, else a general city photo
      let src = null;
      let credit = "";
      try {
        const themeIndex = Math.max(0, THEMES.indexOf(topic.theme));
        const { tip, fact } = await getContent(topic.destination, themeIndex);
        const m = await findMatchingPhoto(topic.destination, tip, fact);
        if (m) { src = m.hit.largeUrl || m.hit.url; credit = m.credit; }
      } catch (e) {
        console.error("META matched photo failed:", e);
      }
      if (!src) {
        const p = await findDestinationPhoto(topic.destination);
        if (p?.url) { src = p.url; credit = p.credit; }
      }
      if (!src) throw new Error("No photo found");
      const photoUrl = await hostPhoto(src, today);
      const { data, error } = await db
        .from("meta_posts")
        .upsert(
          { post_date: today, destination: topic.destination, theme: topic.theme, instagram_caption: captions.instagram, facebook_caption: captions.facebook, photo_url: photoUrl, photo_credit: credit, status: "preview", error: null },
          { onConflict: "post_date" }
        )
        .select()
        .single();
      if (error) throw new Error(error.message);
      row = data;
    } catch (e) {
      console.error("META generation failed:", e);
      return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
    }
  }

  if (!auto) {
    return NextResponse.json({ mode: "preview (not posted; set setting:meta_mode to auto to post)", destination: row.destination, photo: row.photo_url, instagram: row.instagram_caption, facebook: row.facebook_caption });
  }

  const cfg = metaConfigured();
  const update = {};
  const errors = [];
  // Each platform is posted at most once per day
  if (!row.facebook_post_id && cfg.facebook) {
    try { update.facebook_post_id = await postToFacebook(row.photo_url, row.facebook_caption); }
    catch (e) { console.error("META Facebook failed:", e); errors.push(`facebook: ${e.message}`); }
  }
  if (!row.instagram_post_id && cfg.instagram) {
    try { update.instagram_post_id = await postToInstagram(row.photo_url, row.instagram_caption); }
    catch (e) { console.error("META Instagram failed:", e); errors.push(`instagram: ${e.message}`); }
  }
  const both = (row.facebook_post_id || update.facebook_post_id || !cfg.facebook) && (row.instagram_post_id || update.instagram_post_id || !cfg.instagram);
  await db.from("meta_posts").update({
    ...update,
    status: both ? "posted" : "failed",
    error: errors.join(" | ").slice(0, 500) || null,
    posted_at: Object.keys(update).length ? new Date().toISOString() : row.posted_at,
  }).eq("post_date", today);
  return NextResponse.json({ mode: "posted", ...update, errors });
}
