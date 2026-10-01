// "Food to try": 12 candidate local foods and drinks per destination, written once and shared (food_cache).
// Photos come from the dish's own English Wikipedia article (so a photo is of THAT dish), and a photo is only
// used when the AI confirms the article is about the same food. No match means no photo: a missing photo beats a wrong one.
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { destinationKey } from "./content";
import { attachFoodPhotos } from "./foodPhotos";

const anthropic = new Anthropic();
const UA = "DestinationsDaily/1.0 (https://www.destinationsdaily.com; tips@destinationsdaily.com)";

const MAX_ITEMS = 6; // Ryan wants a short list shown (also keeps Google lookups to 6 per destination)
const PHOTOS_VERSION = 2; // 2 = AI-checked, appetizing photos from Pixabay / Commons / Wikipedia
const CANDIDATES = 12; // we write and photo-check 12, then show the best 6

// Show dishes that have a photo first (keeping the classics-first order), then fill with the rest
function topPicks(items) {
  const withPhoto = items.filter((x) => x.photo);
  const without = items.filter((x) => !x.photo);
  return [...withPhoto, ...without].slice(0, MAX_ITEMS);
}
const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
export const dishKey = (name) =>
  String(name || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

async function askJSON(system, content, maxTokens = 6000) {
  const res = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: maxTokens, // room for thinking + answer
    system,
    messages: [{ role: "user", content }],
  });
  const text = (res.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in response");
  return JSON.parse(m[0]);
}

// Returns { cuisine, items: [{ key, name, local_name, kind, what, how, photo }] }
export async function getFoodList(destination) {
  const key = destinationKey(destination);
  const { data: cached } = await db.from("food_cache").select("cuisine, items, photos_v").eq("destination_key", key).maybeSingle();
  if (cached?.items?.length) {
    let items = cached.items;
    if ((cached.photos_v || 1) < PHOTOS_VERSION) {
      // Older lists used Wikipedia-only photos: redo them with the better, AI-checked photo search (once)
      const r = await attachFoodPhotos({ destination, destKey: key, cuisine: cached.cuisine, items });
      items = r.items;
      await db.from("food_cache").update({ items, photos_v: r.ok ? PHOTOS_VERSION : cached.photos_v || 1 }).eq("destination_key", key);
    }
    return { cuisine: cached.cuisine, items: topPicks(items) };
  }

  const out = await askJSON(
    "You are a well-traveled friend who loves local food. List exactly 12 foods and drinks a first-time visitor " +
      "should try at the destination, roughly from must-try classics to more adventurous. Mix about 7 dishes, 2 " +
      "snacks or street foods, 1-2 desserts and 1-2 drinks. They must be genuine local or regional specialties of " +
      "that destination's own cuisine, well documented, not generic international foods. Respond with ONLY JSON: " +
      '{"cuisine": string (one or two words, e.g. "Portuguese", "Japanese", "Cajun and Creole"), "items": [{"name": string, "local_name": string|null, "kind": "dish"|"snack"|"dessert"|"drink", ' +
      '"what": string, "how": string, "wiki_title": string|null}]}. "name" is what menus call it (the usual name ' +
      'visitors see). "local_name" is the native-script or local spelling if different, else null. "what" is one ' +
      'friendly sentence on what it is (max 140 characters). "how" is one short practical tip on when or how to ' +
      'eat or order it (max 120 characters); light humor is fine, never mocking the culture. "wiki_title" is the ' +
      "EXACT title of the English Wikipedia article about that specific dish, or null if you are not certain that " +
      "exact article exists. Only include things you are confident are accurate. No safety or health claims.",
    `Destination: ${destination}`
  );

  const kinds = new Set(["dish", "snack", "dessert", "drink"]);
  const seen = new Set();
  const items = (Array.isArray(out.items) ? out.items : [])
    .map((x) => ({
      key: dishKey(x.name),
      name: clip(x.name, 60),
      local_name: x.local_name ? clip(x.local_name, 60) : null,
      kind: kinds.has(x.kind) ? x.kind : "dish",
      what: clip(x.what, 160),
      how: clip(x.how, 140),
      wiki_title: x.wiki_title ? clip(x.wiki_title, 120) : null,
    }))
    .filter((x) => x.key && x.name && x.what && !seen.has(x.key) && seen.add(x.key))
    .slice(0, CANDIDATES);
  if (items.length < 6) throw new Error("Food list came back too short");

  const cuisine = clip(out.cuisine, 60) || null;
  const photoRes = await attachFoodPhotos({ destination, destKey: key, cuisine, items });
  const withPhotos = photoRes.items;
  const row = { destination_key: key, cuisine, items: withPhotos, photos_v: photoRes.ok ? PHOTOS_VERSION : 1 };
  await db.from("food_cache").upsert(row);
  return { cuisine: row.cuisine, items: topPicks(withPhotos) };
}
