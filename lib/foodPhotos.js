// Food photos for the "Food to try" page. For each dish we gather several candidate photos (Pixabay stock
// photos, Wikimedia Commons, the dish's Wikipedia article), then the AI LOOKS at the actual pictures and picks
// one that (1) clearly shows that exact dish as served in that cuisine and (2) looks appetizing
// (well lit, in focus, nicely plated). If nothing passes, the dish gets NO photo: a missing photo beats a bad one.
// Pixabay doesn't allow hotlinking, so a copy of the chosen Pixabay photo is hosted in our Supabase storage.
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";

const anthropic = new Anthropic();
const UA = "DestinationsDaily/1.0 (https://www.destinationsdaily.com; tips@destinationsdaily.com)";
const BUCKET = "email-photos";
const MIN_APPETIZING = 4; // out of 5, judged with a strict "magazine-quality" rubric (5 rejected every Lisbon photo; Ryan raised the bar 2026-09-30)
const MAX_BYTES = 1_500_000;

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

async function getJSON(url, headers = {}) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(8000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function pixabayCandidates(dish) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const seen = new Set();
  const out = [];
  for (const q of [dish.name, dish.local_name && dish.local_name !== dish.name ? dish.local_name : null].filter(Boolean)) {
    const j = await getJSON(
      `https://pixabay.com/api/?${new URLSearchParams({ key, q, image_type: "photo", orientation: "horizontal", safesearch: "true", per_page: "6", order: "popular" })}`
    );
    for (const h of j?.hits || []) {
      if (seen.has(h.id) || !h.webformatURL) continue;
      seen.add(h.id);
      out.push({ source: "pixabay", url: h.webformatURL, page: h.pageURL, credit: "Pixabay", tags: h.tags });
    }
  }
  return out.slice(0, 3);
}

async function commonsCandidates(dish) {
  const j = await getJSON(
    "https://commons.wikimedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "8",
        gsrsearch: `filetype:bitmap ${dish.name}`, prop: "imageinfo", iiprop: "url|mime", iiurlwidth: "640",
      })
  );
  const pages = Object.values(j?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages
    .map((p) => p.imageinfo?.[0])
    .filter((i) => i && i.mime === "image/jpeg" && i.thumburl)
    .slice(0, 4)
    .map((i) => ({ source: "commons", url: i.thumburl, page: i.descriptionurl, credit: "Wikimedia Commons" }));
}

async function wikipediaCandidate(dish) {
  // Lists saved earlier no longer carry the article name, but keep the Wikipedia photo they already had
  if (dish.photo?.url && !dish.wiki_title) return [{ source: "wikipedia", url: dish.photo.url, page: dish.photo.page, credit: "Wikipedia" }];
  if (!dish.wiki_title) return [];
  const j = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(dish.wiki_title).replace(/ /g, "_"))}?redirect=true`);
  const img = j?.type === "standard" ? j.thumbnail?.source : null;
  if (!img || /\.svg/i.test(img)) return [];
  return [{ source: "wikipedia", url: img, page: j.content_urls?.desktop?.page, credit: "Wikipedia" }];
}

async function download(c) {
  try {
    const res = await fetch(c.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_BYTES || bytes.length < 2000) return null;
    return { ...c, bytes, mediaType: type };
  } catch {
    return null;
  }
}

// Ask the AI to look at the candidate pictures. Returns the chosen candidate or null.
async function judge(dish, destination, cuisine, cands) {
  const content = [
    {
      type: "text",
      text:
        `Dish: ${dish.name}${dish.local_name && dish.local_name !== dish.name ? ` (${dish.local_name})` : ""}\n` +
        `What it is: ${dish.what}\nCuisine/destination: ${cuisine || ""} / ${destination}\n\n` +
        `Below are ${cands.length} candidate photos, numbered from 0.`,
    },
  ];
  cands.forEach((c, i) => {
    content.push({ type: "text", text: `Photo ${i}:` });
    content.push({ type: "image", source: { type: "base64", media_type: c.mediaType, data: c.bytes.toString("base64") } });
  });
  const res = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 3000, // room for thinking + answer
    system:
      "You choose a food photo for a travel website whose standard is HIGH. A photo qualifies ONLY if (1) it clearly " +
      "shows this exact dish or drink as it is served in this cuisine (not a different dish, a similar foreign " +
      "version, raw ingredients, a menu, a restaurant exterior, a map or a person's face) and (2) it would make a " +
      "stranger hungry: it must look like a professional or high-quality food photo, with good natural or warm " +
      "lighting, sharp focus, vivid natural colors, appealing plating and a flattering close-up or angle. Score " +
      "appetizing from 1 to 5, where 5 means a genuinely mouth-watering, magazine-quality photo; give 3 or less to " +
      "dim, blurry, flat, cluttered, harshly flash-lit, oddly cropped, messy, unplated or snapshot-quality photos, " +
      "and to photos where the dish is small or hard to see. Among qualifying photos pick the best. Be strict: if " +
      "unsure the dish matches, or the photo is merely okay, reject it. Respond with ONLY JSON: " +
      '{"index": number, "appetizing": number from 1 to 5} or {"index": -1} if no photo qualifies.',
    messages: [{ role: "user", content }],
  });
  const text = (res.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error("No JSON from photo judge");
  const out = JSON.parse(m[0]);
  const i = Number(out.index);
  if (!Number.isInteger(i) || i < 0 || i >= cands.length) return null;
  return Number(out.appetizing) >= MIN_APPETIZING ? cands[i] : null;
}

async function hostCopy(c, destKey, dishKey) {
  const path = `food/${slug(destKey)}/${dishKey}.jpg`;
  const { error } = await db.storage.from(BUCKET).upload(path, c.bytes, { contentType: c.mediaType, upsert: true });
  if (error) throw new Error(`Food photo upload failed: ${error.message}`);
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// items: [{ key, name, local_name, what, wiki_title?, ...}]. Returns { items: same items with .photo set or null, ok }
// ok=false means something failed (not just "no good photo"), so the caller can try again later.
export async function attachFoodPhotos({ destination, destKey, cuisine, items }) {
  let ok = true;
  const out = await Promise.all(
    items.map(async (it) => {
      const { wiki_title, ...rest } = it;
      try {
        const lists = await Promise.all([pixabayCandidates(it), commonsCandidates(it), wikipediaCandidate(it)]);
        const downloaded = (await Promise.all(lists.flat().map(download))).filter(Boolean).slice(0, 8);
        if (!downloaded.length) return { ...rest, photo: null };
        const best = await judge(it, destination, cuisine, downloaded);
        if (!best) return { ...rest, photo: null };
        const url = best.source === "pixabay" ? await hostCopy(best, destKey, it.key) : best.url;
        return { ...rest, photo: { url, page: best.page, credit: best.credit, title: it.name } };
      } catch (e) {
        ok = false;
        console.error("FOOD_PHOTO failed for", it.name, e);
        return { ...rest, photo: it.photo || null }; // keep whatever it had
      }
    })
  );
  return { items: out, ok };
}
