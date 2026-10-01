// The finished MP4 arrives here from GitHub Actions (raw body, Bearer REELS_SECRET). Vercel allows ~4.5 MB bodies.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reelsAuthorized } from "@/lib/reels";

export const maxDuration = 60;

export async function POST(req) {
  if (!reelsAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const { data: row } = await db.from("reels").select("id,post_date,slot,status").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.status === "posted") return NextResponse.json({ error: "already posted" }, { status: 409 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length < 10000 || buf.length > 4_300_000) return NextResponse.json({ error: `video size ${buf.length} not accepted` }, { status: 400 });
  if (buf.slice(4, 8).toString() !== "ftyp") return NextResponse.json({ error: "not an mp4" }, { status: 400 });
  const path = `reels/${row.post_date}-${row.slot}-${Date.now()}.mp4`;
  const { error: upErr } = await db.storage.from("email-photos").upload(path, buf, { contentType: "video/mp4", upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const { data: pub } = db.storage.from("email-photos").getPublicUrl(path);
  await db.from("reels").update({ video_url: pub.publicUrl, status: "rendered", error: null }).eq("id", id);
  return NextResponse.json({ ok: true, video_url: pub.publicUrl, bytes: buf.length });
}
