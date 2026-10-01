import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { exchangeCode, tiktokConfigured } from "@/lib/tiktokApi";

const page = (msg) =>
  new NextResponse(`<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;max-width:520px;margin:60px auto;padding:0 20px"><h2>${msg}</h2><p><a href="/">Back to Destinations Daily</a></p>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });

export async function GET(req) {
  if (!(await getSetting("tiktok_connect_open", false)) || !tiktokConfigured()) return new NextResponse("Not available", { status: 404 });
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return page("TikTok connection was cancelled.");
  const { data } = await db.from("social_state").select("value").eq("key", "tiktok:oauth_state").maybeSingle();
  if (!code || !state || !data?.value || data.value.state !== state || Date.now() - data.value.at > 15 * 60 * 1000) return page("That link expired. Please try again.");
  try {
    await exchangeCode(code);
    await db.from("social_state").delete().eq("key", "tiktok:oauth_state");
    return page("TikTok is connected. You can close this tab.");
  } catch (e) {
    console.error("TIKTOK connect failed:", e);
    return page("Something went wrong connecting TikTok.");
  }
}
