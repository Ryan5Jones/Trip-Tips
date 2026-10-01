// "Food to try": 18 candidate local foods and drinks per destination, written once and shared (food_cache),
// of which 6 are shown: 4 entrees, 1 sweet dessert, 1 culturally special alcoholic drink (Ryan 2026-09-30).
// Photos come from lib/foodPhotos.js (AI-checked for matching the dish and looking appetizing).
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { destinationKey } from "./content";
import { attachFoodPhotos } from "./foodPhotos";

const anthropic = new Anthropic();
const UA = "DestinationsDaily/1.0 (https://www.destinationsdaily.com; tips@destinationsdaily.com)";

const PHOTOS_VERSION = 4; // 4 = scored (good 4+, ok 3), every shown dish needs a photo; strict-rubric, AI-checked appetizing photos from Pixabay / Commons / Wikipedia (bump to redo photos everywhere)
const LIST_VERSION = 2; // 2 = entrees + dessert + alcoholic drink mix (older lists were a general mix of 12)
const CANDIDATES = 18; // we write and photo-check 18, then show the best 6 that have photos
export const SHOWN = { entree: 4, dessert: 1, drink: 1 }; // how many of each kind are shown

// Pick what to show: ONLY dishes that have a photo (Ryan 2026-09-30). The quota of each kind comes first
// (4 entrees, 1 dessert, 1 drink), best photos first within a kind (score 4+ before 3, then classics-first order);
// if a kind is short, top up from the other kinds' leftover photo dishes. Shown in the order entrees, dessert, drink.
export function rankedByKind(items) {
  const kindOf = (x) => (x.kind === "dessert" ? "dessert" : x.kind === "drink" ? "drink" : "entree"); // old "dish"/"snack" count as entrees
  const withPhoto = items.filter((x) => x.photo);
  const ranked = (list) => [...list.filter((x) => (x.photo.score || 4) >= 4), ...list.filter((x) => (x.photo.score || 4) < 4)];
  return { entree: ranked(withPhoto.filter((x) => kindOf(x) === "entree")), dessert: ranked(withPhoto.filter((x) => kindOf(x) === "dessert")), drink: ranked(withPhoto.filter((x) => kindOf(x) === "drink")) };
}

function topPicks(items) {
  const kindOf = (x) => (x.kind === "dessert" ? "dessert" : x.kind === "drink" ? "drink" : "entree"); // old "dish"/"snack" count as entrees
  const withPhoto = items.filter((x) => x.photo);
  const ranked = (list) => [...list.filter((x) => (x.photo.score || 4) >= 4), ...list.filter((x) => (x.photo.score || 4) < 4)];
  const chosen = [];
  for (const k of ["entree", "dessert", "drink"]) chosen.push(...ranked(withPhoto.filter((x) => kindOf(x) === k)).slice(0, SHOWN[k]));
  const total = Object.values(SHOWN).reduce((a, b) => a + b, 0);
  if (chosen.length < total) chosen.push(...ranked(withPhoto.filter((x) => !chosen.includes(x))).slice(0, total - chosen.length));
  return chosen;
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
  const { data: cached } = await db.from("food_cache").select("cuisine, items, photos_v, list_v").eq("destination_key", key).maybeSingle();
  if (cached?.items?.length && (cached.list_v || 1) >= LIST_VERSION) {
    let items = cached.items;
    if ((cached.photos_v || 1) < PHOTOS_VERSION) {
      // Older lists used Wikipedia-only photos: redo them with the better, AI-checked photo search (once)
      const r = await attachFoodPhotos({ destination, destKey: key, cuisine: cached.cuisine, items });
      items = r.items;
      await db.from("food_cache").update({ items, photos_v: r.ok ? PHOTOS_VERSION : cached.photos_v || 1 }).eq("destination_key", key);
    }
    return { cuisine: cached.cuisine, items: topPicks(items), all: items };
  }
  try {
    return await generateList(destination, key);
  } catch (e) {
    // An older list is better than an error page
    if (cached?.items?.length) {
      console.error("FOOD_LIST regenerate failed, using the older list:", e);
      return { cuisine: cached.cuisine, items: topPicks(cached.items), all: cached.items };
    }
    throw e;
  }
}

async function generateList(destination, key) {
  const out = await askJSON(
    "You are a well-traveled friend who loves local food. List exactly 18 things a first-time visitor should try at the " +
      "destination: 10 ENTREES (main dishes, the iconic meals of that cuisine), 4 sweet DESSERTS, and 4 culturally " +
      "special ALCOHOLIC drinks (a traditional spirit, wine, beer, liqueur or a signature cocktail that is specific to " +
      "this place or culture; if the culture has no alcohol tradition, use its signature traditional drink instead). " +
      "Within each group go from must-try classics to more adventurous. They must be genuine local or regional " +
      "specialties of that destination's own cuisine, well documented, not generic international foods. Respond with ONLY JSON: " +
      '{"cuisine": string (one or two words, e.g. "Portuguese", "Japanese", "Cajun and Creole"), "items": [{"name": string, "local_name": string|null, "kind": "entree"|"dessert"|"drink", ' +
      '"what": string, "how": string, "wiki_title": string|null}]}. "name" is what menus call it (the usual name ' +
      'visitors see). "local_name" is the native-script or local spelling if different, else null. "what" is one ' +
      'friendly sentence on what it is (max 140 characters). "how" is one short practical tip on when or how to ' +
      'eat or order it (max 120 characters); light humor is fine, never mocking the culture. "wiki_title" is the ' +
      "EXACT title of the English Wikipedia article about that specific dish, or null if you are not certain that " +
      "exact article exists. Only include things you are confident are accurate. No safety or health claims.",
    `Destination: ${destination}`
  );

  const kinds = new Set(["entree", "dessert", "drink"]);
  const seen = new Set();
  const items = (Array.isArray(out.items) ? out.items : [])
    .map((x) => ({
      key: dishKey(x.name),
      name: clip(x.name, 60),
      local_name: x.local_name ? clip(x.local_name, 60) : null,
      kind: kinds.has(x.kind) ? x.kind : "entree",
      what: clip(x.what, 160),
      how: clip(x.how, 140),
      wiki_title: x.wiki_title ? clip(x.wiki_title, 120) : null,
    }))
    .filter((x) => x.key && x.name && x.what && !seen.has(x.key) && seen.add(x.key))
    .slice(0, CANDIDATES);
  if (items.length < 10 || !items.some((x) => x.kind === "drink") || !items.some((x) => x.kind === "dessert")) throw new Error("Food list came back too short");

  const cuisine = clip(out.cuisine, 60) || null;
  const photoRes = await attachFoodPhotos({ destination, destKey: key, cuisine, items });
  const withPhotos = photoRes.items;
  const row = { destination_key: key, cuisine, items: withPhotos, photos_v: photoRes.ok ? PHOTOS_VERSION : 1, list_v: LIST_VERSION };
  await db.from("food_cache").upsert(row);
  return { cuisine: row.cuisine, items: topPicks(withPhotos), all: withPhotos };
}
