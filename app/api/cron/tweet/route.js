// Twice-daily tweet (morning + evening). Runs on the schedules in vercel.json.
// The slot is worked out from the time of day (UTC), or forced with ?slot=morning / ?slot=evening.
//
// Preview mode (default): writes today's tweet and saves it to the `tweets` table
// WITHOUT posting. Turn on posting with the Supabase switch "setting:tweets_enabled" = true
// (in the social_state table), or TWEETS_ENABLED=true in Vercel.
//
// Manual preview in a browser:
//   https://www.destinationsdaily.com/api/cron/tweet?secret=YOUR_CRON_SECRET
//   add &regenerate=1 to get a different draft (preview mode only)
//   add &slot=evening to preview the evening tweet
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tweetTopicFor, writeTweet, shortenForX } from "@/lib/tweets";
import { postTweet, xConfigured } from "@/lib/twitter";
import { getSetting } from "@/lib/settings";
import { COST, canSpend, recordSpend } from "@/lib/budget";
import { findDestinationPhoto } from "@/lib/photos";
import { uploadImageFromUrl } from "@/lib/twitter";

export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const authorized =
    secret &&
    (req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Switch lives in Supabase (social_state key "setting:tweets_enabled"); env var is the fallback
  const enabled = String(await getSetting("tweets_enabled", process.env.TWEETS_ENABLED)) === "true";
  // X Premium allows longer posts (Supabase switch "setting:long_tweets")
  const long = String(await getSetting("long_tweets", "false")) === "true";
  const regenerate = url.searchParams.get("regenerate") === "1" && !enabled;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const requested = url.searchParams.get("slot");
  // Morning cron runs ~16:00 UTC (9am Pacific); evening cron ~01:00 UTC (6pm Pacific)
  const slot = requested === "morning" || requested === "evening"
    ? requested
    : now.getUTCHours() >= 12 ? "morning" : "evening";

  const { data: existing, error: readError } = await db
    .from("tweets").select("*").eq("tweet_date", today).eq("slot", slot).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  // Already posted in this slot: never post twice
  if (existing?.status === "posted") {
    return NextResponse.json({ mode: "already_posted", text: existing.text, tweet_id: existing.tweet_id });
  }

  // Reuse today's draft (so what you previewed is what posts), unless asked for a new one
  let row = existing;
  if (!row || regenerate) {
    const topic = tweetTopicFor(today, slot);
    try {
      const text = await writeTweet(topic, { long });
      const { data, error } = await db
        .from("tweets")
        .upsert(
          { tweet_date: today, slot, destination: topic.destination, theme: topic.theme, text, status: "preview", error: null },
          { onConflict: "tweet_date,slot" }
        )
        .select()
        .single();
      if (error) throw new Error(error.message);
      row = data;
    } catch (e) {
      console.error("Tweet generation failed:", e);
      return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
    }
  }

  if (!enabled) {
    return NextResponse.json({
      mode: "preview (not posted; set TWEETS_ENABLED=true in Vercel to post)",
      slot,
      destination: row.destination,
      characters: [...row.text].length,
      text: row.text,
    });
  }

  if (!xConfigured()) {
    return NextResponse.json({ error: "X keys missing in Vercel environment variables" }, { status: 500 });
  }

  if (!(await canSpend(COST.post, { reserveForTweets: false }))) {
    return NextResponse.json({ mode: "skipped: monthly X budget reached", text: row.text });
  }

  // Try to attach a destination photo (Pexels). Any failure -> post text only.
  let text = row.text;
  let mediaIds;
  let photoNote = "no photo";
  try {
    const photo = await findDestinationPhoto(row.destination || "");
    if (photo?.url) {
      const credit = `\n${photo.credit}`;
      mediaIds = [await uploadImageFromUrl(photo.url)];
      // Credit the photographer when it fits (Pixabay/Pexels don't strictly require it)
      if ([...(text + credit)].length <= (long ? 600 : 280)) text = text + credit;
      photoNote = `${photo.credit} (${photo.sourceUrl})`;
    }
  } catch (e) {
    console.error("Photo step failed, posting text only:", e);
    photoNote = `photo failed: ${String(e.message || e).slice(0, 150)}`;
    mediaIds = undefined;
    text = row.text;
  }

  try {
    let tweetId;
    try {
      tweetId = await postTweet(text, { mediaIds });
    } catch (e) {
      // If X rejects a long post (e.g. Premium lapsed), retry once with a short version
      if ([...text].length <= 280) throw e;
      console.error("Long post rejected, retrying short:", e);
      const credit = text.match(/\n📷 .+$/)?.[0] || "";
      text = shortenForX(row.text);
      if (credit && [...(text + credit)].length <= 280) text += credit;
      else mediaIds = mediaIds && credit ? undefined : mediaIds;
      tweetId = await postTweet(text, { mediaIds });
    }
    await recordSpend(COST.post);
    await db.from("tweets").update({ status: "posted", tweet_id: tweetId, posted_at: new Date().toISOString(), error: null })
      .eq("tweet_date", today).eq("slot", slot);
    return NextResponse.json({ mode: "posted", slot, tweet_id: tweetId, text, photo: photoNote });
  } catch (e) {
    console.error("Posting tweet failed:", e);
    await db.from("tweets").update({ status: "failed", error: String(e.message || e).slice(0, 500) }).eq("tweet_date", today).eq("slot", slot);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
