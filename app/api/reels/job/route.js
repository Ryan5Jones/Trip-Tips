// Called by the GitHub Actions job (Bearer REELS_SECRET). Finds or creates today's reel for the slot and says what to do next.
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { getOrCreateReel, reelsAuthorized, slideUrls } from "@/lib/reels";

export const maxDuration = 120;

export async function GET(req) {
  if (!reelsAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const slot = url.searchParams.get("slot") === "evening" ? "evening" : "morning";
  const today = new Date().toISOString().slice(0, 10);
  try {
    const row = await getOrCreateReel(today, slot);
    const mode = await getSetting("reels_mode", "preview");
    let action = "none";
    if (row.status === "posted") action = "none";
    else if (!row.video_url || url.searchParams.get("rerender") === "1") action = "render";
    else if (mode === "auto") action = "publish";
    return NextResponse.json({ id: row.id, status: row.status, mode, action, destination: row.destination, title: row.title, slides: slideUrls(row.id), video_url: row.video_url || null });
  } catch (e) {
    console.error("REEL job failed:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
