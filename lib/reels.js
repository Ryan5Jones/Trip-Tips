// Instagram Reels: two a day. The site writes the content + picks a photo; a GitHub Actions job (which has ffmpeg) turns the
// 4 slide images into a video, uploads it here, and asks us to publish it. See .github/workflows/reels.yml.
import crypto from "crypto";
import { db } from "./db";
import { THEMES, getContent } from "./content";
import { TWEET_DESTINATIONS } from "./tweets";
import { findMatchingPhoto } from "./emailPhotos";
import { findDestinationPhoto } from "./photos";
import { hostPhoto, SITE } from "./meta";
import { writeTikTok } from "./tiktok";
import { SLIDE_COUNT } from "./slideImage";

export function reelTopicFor(date, slot = "morning") {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  const evening = slot === "evening";
  return {
    destination: TWEET_DESTINATIONS[(day + (evening ? 33 : 20)) % TWEET_DESTINATIONS.length],
    theme: THEMES[(day + (evening ? 12 : 9)) % THEMES.length],
  };
}

export function reelsAuthorized(req) {
  const secret = process.env.REELS_SECRET;
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const slideUrls = (id) => Array.from({ length: SLIDE_COUNT }, (_, i) => `${SITE}/api/reels/slide/${id}/${i + 1}`);

export async function getOrCreateReel(date, slot) {
  const { data: existing } = await db.from("reels").select("*").eq("post_date", date).eq("slot", slot).maybeSingle();
  if (existing) return existing;
  const topic = reelTopicFor(date, slot);
  const content = await writeTikTok(topic);
  let src = null;
  try {
    const { tip, fact } = await getContent(topic.destination, Math.max(0, THEMES.indexOf(topic.theme)));
    const m = await findMatchingPhoto(topic.destination, tip, fact);
    if (m) src = m.hit.largeUrl || m.hit.url;
  } catch (e) {
    console.error("REEL matched photo failed:", e);
  }
  if (!src) src = (await findDestinationPhoto(topic.destination))?.url;
  if (!src) throw new Error("No photo found");
  const photoUrl = await hostPhoto(src, `reel-${date}-${slot}`);
  const { data, error } = await db
    .from("reels")
    .upsert({ post_date: date, slot, destination: topic.destination, theme: topic.theme, ...content, photo_url: photoUrl, status: "drafted" }, { onConflict: "post_date,slot" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
