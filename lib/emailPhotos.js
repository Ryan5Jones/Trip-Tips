// Picks a photo that matches what today's tip or fun fact is actually about (e.g. a fact about
// poke -> a photo of poke), checks the match, and hosts a copy on our own Supabase storage
// (Pixabay doesn't allow hotlinking). Cached per destination + theme so subscribers going to
// the same place share one photo. Returns null if nothing good is found -> email goes without one.
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { destinationKey } from "./content";

const anthropic = new Anthropic();
const BUCKET = "email-photos";

async function askJSON(system, content) {
  const res = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 2000, // room for thinking + answer
    system,
    messages: [{ role: "user", content }],
  });
  const text = (res.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");
  // Be forgiving: pull the first {...} out of the reply; null if there isn't valid JSON
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// 1) Decide what the photo should show
async function planPhoto(destination, tip, fact) {
  return askJSON(
    "You choose a stock photo for a travel email. Given a destination, a tip and a fun fact, pick the ONE " +
      "concrete, photographable subject that best illustrates either the tip or the fact (a dish, a landmark, " +
      "a vehicle, a festival, a landscape). Respond with ONLY JSON: " +
      '{"about": "tip" | "fact", "subject": string, "queries": [string, string, string]}. ' +
      '"queries" are 1-3 word stock-photo search terms, most specific first, e.g. ["poke bowl", "poke", "hawaiian food"]. ' +
      "Prefer things over people. Never pick anything sensitive (religious ceremonies in progress, poverty, accidents).",
    `Destination: ${destination}\nTip: ${tip}\nFun fact: ${fact}`
  );
}

async function searchPixabay(q) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const res = await fetch(
    `https://pixabay.com/api/?${new URLSearchParams({
      key, q, image_type: "photo", orientation: "horizontal", safesearch: "true", per_page: "12", order: "popular",
    })}`
  );
  if (!res.ok) return [];
  return ((await res.json().catch(() => ({}))).hits || []).map((h) => ({
    url: h.webformatURL, // ~640px wide: right size for email
    tags: h.tags,
    user: h.user,
    page: h.pageURL,
  }));
}

// 2) Check which result (if any) really shows the subject, using Pixabay's photo labels
async function pickMatch(subject, destination, hits) {
  if (!hits.length) return null;
  const list = hits.map((h, i) => `${i}: ${h.tags}`).join("\n");
  const out = await askJSON(
    "You check stock photo labels. Given a subject and numbered photos with their label tags, return the index " +
      "of the photo whose tags clearly show that subject (it must match the specific thing, not just the general " +
      'category). Respond with ONLY JSON and no other text: {"index": number}, or {"index": -1} if none clearly match.',
    `Subject: ${subject} (for a trip to ${destination})\nPhotos:\n${list}`
  );
  const i = Number(out?.index);
  return Number.isInteger(i) && i >= 0 && i < hits.length ? hits[i] : null;
}

async function hostCopy(hit, fileKey) {
  const img = await fetch(hit.url);
  if (!img.ok) throw new Error(`Photo download failed (${img.status})`);
  const bytes = Buffer.from(await img.arrayBuffer());
  const path = `${fileKey}.jpg`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function getEmailPhoto(destination, themeIndex, tip, fact) {
  const key = destinationKey(destination);
  const { data: cached } = await db
    .from("content_cache")
    .select("photo_url, photo_credit, photo_alt, photo_about, photo_checked")
    .eq("destination_key", key)
    .eq("theme_index", themeIndex)
    .maybeSingle();
  if (cached?.photo_checked) {
    return cached.photo_url
      ? { url: cached.photo_url, credit: cached.photo_credit, alt: cached.photo_alt, about: cached.photo_about }
      : null;
  }

  let result = null;
  try {
    const plan = await planPhoto(destination, tip, fact);
    if (!plan?.subject || !Array.isArray(plan.queries)) throw new Error("Could not plan a photo");
    const place = destination.split(",")[0].trim();
    for (const q of (plan.queries || []).slice(0, 3)) {
      // Try "<subject> <place>" first (e.g. "poke bowl hawaii"), then the subject alone
      for (const query of [`${q} ${place}`, q]) {
        const match = await pickMatch(plan.subject, destination, await searchPixabay(query)).catch(() => null);
        if (match) {
          const slug = `${key}-${themeIndex}`.replace(/[^a-z0-9-]+/g, "-");
          result = {
            url: await hostCopy(match, slug),
            credit: `Photo: ${String(match.user).slice(0, 30)} / Pixabay`,
            alt: plan.subject,
            about: plan.about === "tip" ? "tip" : "fact",
          };
          break;
        }
      }
      if (result) break;
    }
  } catch (e) {
    console.error("Email photo failed:", e);
    return null; // don't cache failures; try again next time
  }

  // Cache the outcome (including "no good photo found") so we don't search again for this topic
  await db
    .from("content_cache")
    .update({
      photo_url: result?.url ?? null,
      photo_credit: result?.credit ?? null,
      photo_alt: result?.alt ?? null,
      photo_about: result?.about ?? null,
      photo_checked: true,
    })
    .eq("destination_key", key)
    .eq("theme_index", themeIndex);
  return result;
}
