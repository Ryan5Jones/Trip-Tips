// TEMPORARY test endpoint (delete after use): checks the Meta token + IDs read-only, then runs the daily meta job in its current mode.
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { GET as metaCron } from "../cron/meta/route";

export const maxDuration = 120;

async function g(path) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(process.env.META_PAGE_ACCESS_TOKEN || "")}`);
  const j = await r.json().catch(() => ({}));
  return j.error ? { error: String(j.error.message).slice(0, 200) } : j;
}

export async function GET(req) {
  const url = new URL(req.url);
  const want = await getSetting("diag_token", null);
  if (!want || url.searchParams.get("t") !== want) return NextResponse.json({ error: "no" }, { status: 401 });
  const out = {
    token_present: Boolean(process.env.META_PAGE_ACCESS_TOKEN),
    page: await g(`${process.env.META_PAGE_ID}?fields=name,id`),
    instagram: await g(`${process.env.META_IG_USER_ID}?fields=username,id`),
  };
  if (url.searchParams.get("run") === "1") {
    const res = await metaCron(new Request("https://x/api/cron/meta", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    out.cron = await res.json();
  }
  return NextResponse.json(out);
}
