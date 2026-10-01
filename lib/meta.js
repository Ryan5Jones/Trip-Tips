// Daily Facebook Page + Instagram posts (Meta Graph API). Free to post; only the AI caption costs ~1-2 cents.
// Env (Vercel): META_PAGE_ID, META_PAGE_ACCESS_TOKEN (long-lived Page token), META_IG_USER_ID.
// Switch: social_state key setting:meta_mode = "preview" (default: write + save drafts, post nothing) or "auto".
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { THEMES } from "./content";
import { TWEET_DESTINATIONS, destinationHashtag, maybeMeme } from "./tweets";

const anthropic = new Anthropic();
const GRAPH = "https://graph.facebook.com/v21.0";
const BUCKET = "email-photos";
export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.destinationsdaily.com").replace(/\/$/, "");

export const metaConfigured = () => ({
  facebook: Boolean(process.env.META_PAGE_ID && process.env.META_PAGE_ACCESS_TOKEN),
  instagram: Boolean(process.env.META_IG_USER_ID && process.env.META_PAGE_ACCESS_TOKEN),
});

// A third rotation (different from the two tweets): destination and theme chosen by date
export function metaTopicFor(date, slot = "morning") {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  const evening = slot === "evening";
  return {
    destination: TWEET_DESTINATIONS[(day + (evening ? 30 : 10)) % TWEET_DESTINATIONS.length],
    theme: THEMES[(day + (evening ? 7 : 2)) % THEMES.length],
  };
}

// Returns { facebook, instagram } captions. Instagram can't have clickable links, so it says "link in bio".
export async function writeCaptions({ destination, theme }) {
  const tag = destinationHashtag(destination);
  const res = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 3000,
    system:
      "You write one social post a day for Destinations Daily, a free service that emails travelers a daily tip and fun fact " +
      "about where they're headed. Voice: snappy and funny; open with a hook starting with the place name; light, witty humor about " +
      "the traveler's experience, never mocking the place, its people or culture; no stereotypes. Content: one practical, culturally aware " +
      "tip and one surprising fun fact about the destination and theme given, only well-established, widely documented things; no safety, " +
      "visa, legal or price claims. Write TWO versions as JSON: " +
      `{"instagram": string, "facebook": string}. Instagram: 350 to 600 characters, short paragraphs separated by blank lines, ` +
      `at most 3 emojis, ends with a nudge like "Heading there? Get a daily tip until you go. Link in bio!" (vary the wording), then a blank line and ` +
      `3 to 5 hashtags, the first being ${tag}. Facebook: 300 to 500 characters, same content, at most 2 emojis, ends with a nudge to get a free ` +
      `daily tip at ${SITE.replace(/^https?:\/\//, "")}, no hashtags except ${tag}. No @mentions, no quotation marks around the post. Output only the JSON.`,
    messages: [{ role: "user", content: `Destination: ${destination}\nTheme: ${theme}${maybeMeme()}` }],
  });
  const text = (res.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON from caption writer");
  const out = JSON.parse(m[0]);
  const ig = String(out.instagram || "").trim();
  const fb = String(out.facebook || "").trim();
  if (ig.length < 80 || fb.length < 80) throw new Error("Caption too short");
  if (/https?:\/\//i.test(ig)) throw new Error("Instagram caption contained a link");
  return { instagram: ig.slice(0, 2000), facebook: fb.slice(0, 2000) };
}

// Download a photo and host a JPEG copy in our storage (Instagram needs a public JPEG URL; Pixabay forbids hotlinking)
export async function hostPhoto(srcUrl, key) {
  const img = await fetch(srcUrl, { signal: AbortSignal.timeout(15000) });
  if (!img.ok) throw new Error(`Photo download failed (${img.status})`);
  const type = (img.headers.get("content-type") || "").split(";")[0];
  if (type !== "image/jpeg") throw new Error(`Photo is ${type}, Instagram needs JPEG`);
  const bytes = Buffer.from(await img.arrayBuffer());
  const path = `social/${key}.jpg`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function graph(path, params, token = process.env.META_PAGE_ACCESS_TOKEN) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: token }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`Meta API ${res.status}: ${j.error?.message || JSON.stringify(j)}`.slice(0, 400));
  return j;
}

// The system-user token can't post as the Page directly (Meta answers "publish_actions deprecated"),
// so first swap it for the Page's own token.
export async function pageToken() {
  const r = await fetch(`${GRAPH}/${process.env.META_PAGE_ID}?fields=access_token&access_token=${encodeURIComponent(process.env.META_PAGE_ACCESS_TOKEN)}`, { signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Could not get Page token: ${j.error?.message || r.status}`.slice(0, 300));
  return j.access_token;
}

export async function postToFacebook(photoUrl, caption) {
  const j = await graph(`${process.env.META_PAGE_ID}/photos`, { url: photoUrl, caption }, await pageToken());
  return j.post_id || j.id;
}

export async function postToInstagram(photoUrl, caption) {
  const igId = process.env.META_IG_USER_ID;
  const created = await graph(`${igId}/media`, { image_url: photoUrl, caption });
  // Instagram prepares the image first; wait until it's ready (usually a few seconds)
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`${GRAPH}/${created.id}?fields=status_code&access_token=${encodeURIComponent(process.env.META_PAGE_ACCESS_TOKEN)}`);
    const s = (await r.json().catch(() => ({}))).status_code;
    if (s === "FINISHED") break;
    if (s === "ERROR" || s === "EXPIRED") throw new Error(`Instagram could not process the photo (${s})`);
    await new Promise((ok) => setTimeout(ok, 3000));
  }
  const pub = await graph(`${igId}/media_publish`, { creation_id: created.id });
  return pub.id;
}

// ---- Stats (read-only) ----
async function getJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  return j.error ? { error: String(j.error.message || "").slice(0, 200) } : j;
}
const tok = () => encodeURIComponent(process.env.META_PAGE_ACCESS_TOKEN);

// Instagram: likes, comments, plus reach / saves / shares / views from insights. Missing numbers stay null.
export async function getInstagramStats(mediaId) {
  const out = { likes: null, comments: null, reach: null, saves: null, shares: null, views: null };
  const base = await getJSON(`${GRAPH}/${mediaId}?fields=like_count,comments_count&access_token=${tok()}`);
  if (!base.error) { out.likes = base.like_count ?? null; out.comments = base.comments_count ?? null; }
  for (const metrics of ["reach,saved,shares,views", "reach,saved,shares", "reach"]) {
    const ins = await getJSON(`${GRAPH}/${mediaId}/insights?metric=${metrics}&access_token=${tok()}`);
    if (ins.error) continue;
    for (const m of ins.data || []) {
      const v = m.values?.[0]?.value ?? m.total_value?.value ?? null;
      if (m.name === "reach") out.reach = v;
      if (m.name === "saved") out.saves = v;
      if (m.name === "shares") out.shares = v;
      if (m.name === "views") out.views = v;
    }
    break;
  }
  return out;
}

// Facebook: reactions, comments, shares, plus reach when Meta offers it for this post
export async function getFacebookStats(postId) {
  const out = { reactions: null, comments: null, shares: null, reach: null };
  const t = encodeURIComponent(await pageToken());
  const base = await getJSON(`${GRAPH}/${postId}?fields=reactions.summary(true).limit(0),comments.summary(true).limit(0),shares&access_token=${t}`);
  if (!base.error) {
    out.reactions = base.reactions?.summary?.total_count ?? null;
    out.comments = base.comments?.summary?.total_count ?? null;
    out.shares = base.shares?.count ?? 0;
  }
  for (const metric of ["post_total_media_view_unique", "post_impressions_unique", "post_media_view"]) {
    const ins = await getJSON(`${GRAPH}/${postId}/insights?metric=${metric}&access_token=${t}`);
    const v = ins.data?.[0]?.values?.[0]?.value;
    if (!ins.error && typeof v === "number") { out.reach = v; break; }
  }
  return out;
}

// Instagram Reel from a public MP4 URL (9:16, H.264). Takes longer to process than a photo, so poll up to ~2 minutes.
export async function postReelToInstagram(videoUrl, caption) {
  const igId = process.env.META_IG_USER_ID;
  const created = await graph(`${igId}/media`, { media_type: "REELS", video_url: videoUrl, caption, share_to_feed: "true" });
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${GRAPH}/${created.id}?fields=status_code&access_token=${encodeURIComponent(process.env.META_PAGE_ACCESS_TOKEN)}`);
    const s = (await r.json().catch(() => ({}))).status_code;
    if (s === "FINISHED") break;
    if (s === "ERROR" || s === "EXPIRED") throw new Error(`Instagram could not process the reel (${s})`);
    await new Promise((ok) => setTimeout(ok, 4000));
  }
  const pub = await graph(`${igId}/media_publish`, { creation_id: created.id });
  return pub.id;
}
