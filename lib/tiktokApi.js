// TikTok Content Posting API (inbox/draft mode) + login tokens. Tokens live in social_state key "tiktok:tokens".
// Needs Vercel env TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.
import { db } from "./db";

const API = "https://open.tiktokapis.com";
export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.destinationsdaily.com").replace(/\/$/, "");
export const REDIRECT_URI = `${SITE}/api/tiktok/callback`;
const TOKENS_KEY = "tiktok:tokens";

export const clientKey = () => (process.env.TIKTOK_CLIENT_KEY || "").trim();
const clientSecret = () => (process.env.TIKTOK_CLIENT_SECRET || "").trim();
export const tiktokConfigured = () => Boolean(clientKey() && clientSecret());

async function tokenRequest(params) {
  const res = await fetch(`${API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: clientKey(), client_secret: clientSecret(), ...params }),
  });
  const j = await res.json();
  if (!res.ok || j.error || !j.access_token) throw new Error(`TikTok token error: ${j.error || res.status} ${j.error_description || ""}`.trim());
  return j;
}

async function saveTokens(j) {
  const now = Date.now();
  const value = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    open_id: j.open_id,
    scope: j.scope,
    access_expires_at: now + (j.expires_in || 86400) * 1000,
    refresh_expires_at: now + (j.refresh_expires_in || 31536000) * 1000,
  };
  await db.from("social_state").upsert({ key: TOKENS_KEY, value });
  return value;
}

export async function exchangeCode(code) {
  return saveTokens(await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: REDIRECT_URI }));
}

export async function getAccessToken() {
  const { data } = await db.from("social_state").select("value").eq("key", TOKENS_KEY).maybeSingle();
  const t = data?.value;
  if (!t?.access_token) throw new Error("TikTok is not connected yet");
  if (t.access_expires_at - Date.now() > 3600 * 1000) return t.access_token;
  const fresh = await saveTokens(await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token }));
  return fresh.access_token;
}

// Sends the photo slides to the creator's TikTok inbox as a draft (they finish + post it in the app).
export async function sendPhotoDraft({ title, description, imageUrls }) {
  const token = await getAccessToken();
  const res = await fetch(`${API}/v2/post/publish/content/init/`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: { title: String(title).slice(0, 90), description: String(description).slice(0, 4000) },
      source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: imageUrls },
      post_mode: "MEDIA_UPLOAD",
      media_type: "PHOTO",
    }),
  });
  const j = await res.json();
  if (!res.ok || (j.error && j.error.code && j.error.code !== "ok")) throw new Error(`TikTok upload error: ${j.error?.code || res.status} ${j.error?.message || ""}`.trim());
  return j.data?.publish_id || null;
}
