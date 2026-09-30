// Once a day: fetch views (impressions), likes, reposts, replies, quotes, bookmarks and profile clicks
// for our posts from the last 14 days, and save them next to each post in Supabase.
// Cost: X "owned reads", about $0.001 per post, inside the monthly X budget.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { xConfigured, getTweetMetrics } from "@/lib/twitter";
import { COST, canSpend, recordSpend } from "@/lib/budget";

export const maxDuration = 60;

function statsFrom(t) {
  const p = t.public_metrics || {};
  const np = t.non_public_metrics || {};
  return {
    impressions: p.impression_count ?? np.impression_count ?? null,
    likes: p.like_count ?? null,
    reposts: p.retweet_count ?? null,
    replies: p.reply_count ?? null,
    quotes: p.quote_count ?? null,
    bookmarks: p.bookmark_count ?? null,
    profile_clicks: np.user_profile_clicks ?? null,
    stats_updated_at: new Date().toISOString(),
  };
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!xConfigured()) return NextResponse.json({ error: "X keys missing" }, { status: 500 });

  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [{ data: daily }, { data: social }] = await Promise.all([
    db.from("tweets").select("tweet_id").eq("status", "posted").gte("posted_at", since),
    db.from("social_posts").select("posted_tweet_id").eq("status", "posted").gte("posted_at", since),
  ]);
  const dailyIds = (daily || []).map((r) => r.tweet_id).filter(Boolean);
  const socialIds = (social || []).map((r) => r.posted_tweet_id).filter(Boolean);
  const ids = [...dailyIds, ...socialIds];
  if (!ids.length) return NextResponse.json({ updated: 0, note: "no recent posts" });

  if (!(await canSpend(ids.length * COST.ownedRead))) {
    return NextResponse.json({ skipped: "monthly X budget reached" });
  }

  let updated = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const results = await getTweetMetrics(batch);
    await recordSpend(results.length * COST.ownedRead);
    for (const t of results) {
      const stats = statsFrom(t);
      if (dailyIds.includes(t.id)) await db.from("tweets").update(stats).eq("tweet_id", t.id);
      else await db.from("social_posts").update(stats).eq("posted_tweet_id", t.id);
      updated++;
    }
  }
  return NextResponse.json({ updated });
}
