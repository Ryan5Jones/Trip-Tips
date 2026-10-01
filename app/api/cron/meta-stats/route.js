// Once a day: save reach, likes/reactions, comments, saves and shares for our Facebook + Instagram posts from the
// last 14 days into `meta_posts`. Read-only calls (free).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getInstagramStats, getFacebookStats, metaConfigured } from "@/lib/meta";

export const maxDuration = 120;

export async function runMetaStats() {
  const cfg = metaConfigured();
  if (!cfg.facebook && !cfg.instagram) return { error: "Meta keys missing" };
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const { data: rows } = await db.from("meta_posts").select("post_date, slot, instagram_post_id, facebook_post_id").gte("post_date", since);
  let updated = 0;
  const errors = [];
  for (const r of rows || []) {
    const stats = { stats_updated_at: new Date().toISOString() };
    try {
      if (r.instagram_post_id && cfg.instagram) {
        const s = await getInstagramStats(r.instagram_post_id);
        Object.assign(stats, { ig_reach: s.reach, ig_likes: s.likes, ig_comments: s.comments, ig_saves: s.saves, ig_shares: s.shares, ig_views: s.views });
      }
      if (r.facebook_post_id && cfg.facebook) {
        const s = await getFacebookStats(r.facebook_post_id);
        Object.assign(stats, { fb_reach: s.reach, fb_reactions: s.reactions, fb_comments: s.comments, fb_shares: s.shares });
      }
      await db.from("meta_posts").update(stats).eq("post_date", r.post_date).eq("slot", r.slot);
      updated++;
    } catch (e) {
      errors.push(`${r.post_date} ${r.slot}: ${String(e.message || e).slice(0, 120)}`);
    }
  }
  return { updated, errors };
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runMetaStats());
}
