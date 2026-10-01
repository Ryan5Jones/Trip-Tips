// TEMPORARY diagnostic (deleted right after use). Never returns the keys.
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

export async function GET(req) {
  const t = new URL(req.url).searchParams.get("t");
  const want = await getSetting("diag_token", null);
  if (!want || t !== want) return new NextResponse("Not found", { status: 404 });
  const k = process.env.TIKTOK_CLIENT_KEY || "";
  const s = process.env.TIKTOK_CLIENT_SECRET || "";
  const info = { keyLen: k.length, keyTrimmedLen: k.trim().length, secretLen: s.length, secretTrimmedLen: s.trim().length };
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: k, client_secret: s, grant_type: "client_credentials" }),
  });
  const j = await res.json().catch(() => ({}));
  return NextResponse.json({ ...info, status: res.status, error: j.error, description: j.error_description, gotToken: Boolean(j.access_token) });
}
