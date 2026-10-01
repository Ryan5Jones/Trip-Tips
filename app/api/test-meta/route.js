// TEMPORARY (delete after use): debug Facebook stats calls.
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { db } from "@/lib/db";
import { pageToken } from "@/lib/meta";
export const maxDuration = 120;
export async function GET(req) {
  const want = await getSetting("diag_token", null);
  if (!want || new URL(req.url).searchParams.get("t") !== want) return NextResponse.json({ error: "no" }, { status: 401 });
  const { data } = await db.from("meta_posts").select("facebook_post_id").not("facebook_post_id", "is", null).limit(1);
  const id = data?.[0]?.facebook_post_id;
  const t = encodeURIComponent(await pageToken());
  const get = async (q) => { const r = await fetch(`https://graph.facebook.com/v21.0/${q}&access_token=${t}`); return await r.json(); };
  return NextResponse.json({
    a: await get(`${id}?fields=id,created_time`),
    b: await get(`${id}?fields=reactions.summary(true).limit(0)`),
    c: await get(`${id}?fields=comments.summary(true).limit(0)`),
    d: await get(`${id}?fields=shares`),
    e: await get(`${id}/insights?metric=post_total_media_view_unique`),
    f: await get(`${id}/insights?metric=post_impressions_unique`),
  });
}
