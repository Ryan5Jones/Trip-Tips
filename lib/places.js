// Best-rated place to try each dish, from Google Places (Text Search, new API).
// Built to be cheap and safe:
//  - Lookups happen only when someone opens a food page, and only for dishes with no fresh result.
//  - One lookup per dish per ~month, shared by every subscriber going to that destination.
//  - Hard monthly spending cap (setting:places_monthly_budget, default $10). Over the cap, no new lookups
//    happen and the page simply shows no restaurant line.
//  - Off until BOTH the env var GOOGLE_PLACES_API_KEY exists AND setting:food_places is true.
// Google's rules: name/rating may be kept ~30 days (we refresh at 25 and never show anything older than 30),
// the rating must link to Google Maps.
import { db } from "./db";
import { destinationKey } from "./content";
import { getSetting } from "./settings";

const COST_PER_LOOKUP = 0.035; // Text Search with rating fields, per request (estimate; Google also gives a free monthly allowance)
const REFRESH_DAYS = 25;
const SHOW_DAYS = 30;
const MIN_REVIEWS = 100;
const MIN_REVIEWS_FALLBACK = 30;
const FOODISH = /restaurant|cafe|coffee|bar$|^bar|pub|bakery|food|meal|dessert|ice_cream|confectionery|tea_house|brewery|winery|sandwich|pizza|seafood|steak|sushi|ramen/;

const monthKey = () => `spend:places:${new Date().toISOString().slice(0, 7)}`;
const daysAgo = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000;

async function spentThisMonth() {
  const { data } = await db.from("social_state").select("value").eq("key", monthKey()).maybeSingle();
  return Number(data?.value || 0);
}
async function recordSpend(calls) {
  if (!calls) return;
  const current = await spentThisMonth();
  await db.from("social_state").upsert({
    key: monthKey(),
    value: Math.round((current + calls * COST_PER_LOOKUP) * 10000) / 10000,
    updated_at: new Date().toISOString(),
  });
}

// Pick the highest-rated, open, food-related result with enough reviews
function pickBest(results) {
  const ok = (results || []).filter(
    (p) =>
      p.id && p.displayName?.text && typeof p.rating === "number" && p.googleMapsUri &&
      (!p.businessStatus || p.businessStatus === "OPERATIONAL") &&
      (p.types || []).some((t) => FOODISH.test(t))
  );
  for (const min of [MIN_REVIEWS, MIN_REVIEWS_FALLBACK]) {
    const pool = ok.filter((p) => (p.userRatingCount || 0) >= min);
    if (pool.length) {
      pool.sort((a, b) => b.rating - a.rating || (b.userRatingCount || 0) - (a.userRatingCount || 0));
      return pool[0];
    }
  }
  return null;
}

// Returns { ok: true, place|null } on a real answer (even "nothing good found"), { ok: false } on an error
async function lookup(apiKey, destination, dishName) {
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount,places.googleMapsUri,places.businessStatus,places.types",
      },
      body: JSON.stringify({ textQuery: `${dishName} in ${destination}`, pageSize: 10, languageCode: "en" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error("PLACES_ERROR", res.status, (await res.text()).slice(0, 300));
      return { ok: false, billed: false };
    }
    const j = await res.json();
    return { ok: true, billed: true, place: pickBest(j.places) };
  } catch (e) {
    console.error("PLACES_ERROR", e);
    return { ok: false, billed: false };
  }
}

// items: the food list items. Returns { [dishKey]: { name, rating, count, url } } for dishes that have a fresh result.
export async function getPlaces(destination, items) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return {};
  if ((await getSetting("food_places", false)) !== true) return {};

  const dkey = destinationKey(destination);
  const { data: rows } = await db.from("food_places").select("*").eq("destination_key", dkey);
  const byDish = new Map((rows || []).map((r) => [r.dish_key, r]));

  const needs = items.filter((it) => {
    const r = byDish.get(it.key);
    return !r || daysAgo(r.fetched_at) >= REFRESH_DAYS;
  });

  if (needs.length) {
    const budget = Number(await getSetting("places_monthly_budget", 10));
    const spent = await spentThisMonth();
    const allowed = Math.max(0, Math.floor((budget - spent) / COST_PER_LOOKUP));
    const todo = needs.slice(0, allowed);
    if (needs.length > todo.length) console.error(`PLACES_BUDGET: cap reached (${spent.toFixed(2)} of ${budget}), skipping ${needs.length - todo.length} lookups`);

    if (todo.length) {
      const results = await Promise.all(todo.map((it) => lookup(apiKey, destination, it.name)));
      const now = new Date().toISOString();
      const upserts = [];
      results.forEach((r, i) => {
        if (!r.ok) return; // error: try again next visit, keep any old row
        const p = r.place;
        const row = p
          ? { destination_key: dkey, dish_key: todo[i].key, status: "ok", place_id: p.id, name: p.displayName.text, rating: p.rating, review_count: p.userRatingCount || 0, maps_uri: p.googleMapsUri, fetched_at: now }
          : { destination_key: dkey, dish_key: todo[i].key, status: "none", place_id: null, name: null, rating: null, review_count: null, maps_uri: null, fetched_at: now };
        upserts.push(row);
        byDish.set(todo[i].key, row);
      });
      if (upserts.length) await db.from("food_places").upsert(upserts, { onConflict: "destination_key,dish_key" });
      await recordSpend(results.filter((r) => r.billed).length);
    }
  }

  const out = {};
  for (const it of items) {
    const r = byDish.get(it.key);
    if (r && r.status === "ok" && daysAgo(r.fetched_at) <= SHOW_DAYS) {
      out[it.key] = { name: r.name, rating: Number(r.rating), count: r.review_count, url: r.maps_uri };
    }
  }
  return out;
}
