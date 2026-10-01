// Posts the rendered reel to Instagram, only when setting:reels_mode = "auto". Bearer REELS_SECRET.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { postReelToInstagram, metaConfigured } from "@/lib/meta";
import { reelsAuthorized } from "@/lib/reels";

export const maxDuration = 120;

export async function POST(req) {
  if (!reelsAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const { data: row } = await db.from("reels").select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.status === "posted" || row.ig_media_id) return NextResponse.json({ result: "already posted" });
  if (!row.video_url) return NextResponse.json({ error: "no video yet" }, { status: 400 });
  if ((await getSetting("reels_mode", "preview")) !== "auto") return NextResponse.json({ result: "preview mode: not posted", video_url: row.video_url, caption: row.description });
  if (!metaConfigured().instagram) return NextResponse.json({ error: "Instagram not configured" }, { status: 500 });
  try {
    const mediaId = await postReelToInstagram(row.video_url, row.description);
    await db.from("reels").update({ status: "posted", ig_media_id: mediaId, error: null }).eq("id", id);
    return NextResponse.json({ result: "posted", ig_media_id: mediaId });
  } catch (e) {
    console.error("REEL publish failed:", e);
    await db.from("reels").update({ status: "failed", error: String(e.message || e).slice(0, 500) }).eq("id", id);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
