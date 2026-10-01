// TEMPORARY diagnostic (deleted right after use). Shows only the first/last characters of the public client key (never the secret).
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

export async function GET(req) {
  const t = new URL(req.url).searchParams.get("t");
  const want = await getSetting("diag_token", null);
  if (!want || t !== want) return new NextResponse("Not found", { status: 404 });
  const k = (process.env.TIKTOK_CLIENT_KEY || "").trim();
  return NextResponse.json({ len: k.length, start: k.slice(0, 5), end: k.slice(-3) });
}
