// One-time "Connect TikTok" link for Ryan. Only works while setting:tiktok_connect_open is true (Claude switches it on
// for the connect step and off afterwards), so a stranger can't connect their own account.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { REDIRECT_URI, tiktokConfigured, clientKey } from "@/lib/tiktokApi";

export async function GET() {
  if (!(await getSetting("tiktok_connect_open", false)) || !tiktokConfigured()) return new NextResponse("Not available", { status: 404 });
  const state = crypto.randomBytes(16).toString("hex");
  await db.from("social_state").upsert({ key: "tiktok:oauth_state", value: { state, at: Date.now() } });
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", clientKey());
  url.searchParams.set("scope", "user.info.basic,video.upload");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString());
}
