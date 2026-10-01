// One slide image of a reel (public on purpose; the id is an unguessable uuid).
import { db } from "@/lib/db";
import { renderSlideJpeg, SLIDE_COUNT } from "@/lib/slideImage";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req, { params }) {
  const { id, n: nRaw } = await params;
  const n = parseInt(nRaw, 10);
  if (!/^[0-9a-f-]{36}$/.test(id) || !(n >= 1 && n <= SLIDE_COUNT)) return new Response("Not found", { status: 404 });
  const { data: row } = await db.from("reels").select("*").eq("id", id).maybeSingle();
  if (!row) return new Response("Not found", { status: 404 });
  const jpg = await renderSlideJpeg(row, n);
  return new Response(jpg, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=3600" } });
}
