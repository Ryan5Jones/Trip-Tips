// Chooses the 6 dishes shown on the Food to try page (4 entrees, 1 dessert, 1 drink). Ryan 2026-09-30: every
// dish must have BOTH a good photo AND a verified restaurant that serves it ("or change the dish"). So we walk
// down each kind's photo-ranked list, look up + verify restaurants in small waves, and replace any dish that
// fails with the next one of the same kind (then, if a kind runs out, with leftovers from other kinds).
import { SHOWN, rankedByKind } from "./food";
import { getPlaces, placesEnabled } from "./places";

const KINDS = ["entree", "dessert", "drink"];
const MAX_WAVES = 5;

// all: every candidate dish; fallback: the plain photo-only picks (used if restaurants can't be looked up at all)
export async function chooseDishes(destination, all, fallback, setIndex = 0) {
  if (!(await placesEnabled())) return { items: fallback, places: {} };

  const queues = rankedByKind(all);
  const tried = new Set();
  const verified = []; // [{ item, kind }]
  const sets = Math.max(0, Math.floor(setIndex)); // set 0 = best dishes, set 1 = the next ones, ... (wraps if we run out)
  const places = {};
  const total = KINDS.reduce((n, k) => n + SHOWN[k], 0);

  for (let wave = 0; wave < MAX_WAVES; wave++) {
    const batch = [];
    const batchKind = new Map();
    let missing = 0;
    for (const k of KINDS) {
      const need = SHOWN[k] * (sets + 1) - verified.filter((v) => v.kind === k).length; // enough verified dishes to reach this set
      if (need <= 0) continue;
      missing += need;
      for (const it of queues[k].filter((x) => !tried.has(x.key)).slice(0, need)) {
        batch.push(it);
        batchKind.set(it.key, k);
      }
    }
    if (!missing) break;
    if (batch.length < missing) {
      // A kind ran out of dishes: top up from any other leftovers
      const spare = KINDS.flatMap((k) => queues[k].map((x) => ({ x, k }))).filter(({ x }) => !tried.has(x.key) && !batch.includes(x));
      for (const { x, k } of spare.slice(0, missing - batch.length)) {
        batch.push(x);
        batchKind.set(x.key, k);
      }
    }
    if (!batch.length) break;

    const found = await getPlaces(destination, batch); // verified restaurants only (and caches "none" so we don't ask again)
    for (const it of batch) {
      tried.add(it.key);
      if (found[it.key]) {
        verified.push({ item: it, kind: batchKind.get(it.key) });
        places[it.key] = found[it.key];
      }
    }
  }

  // If nothing at all could be verified (spending cap reached or Google down), degrade to the photo-only list
  if (!verified.length) return { items: fallback, places: {} };
  // Take this set's slice of each kind (best-first order); if we ran out, wrap around to the start
  const items = [];
  for (const k of KINDS) {
    const mine = verified.filter((v) => v.kind === k);
    if (!mine.length) continue;
    for (let j = 0; j < SHOWN[k] && j < mine.length; j++) items.push(mine[(sets * SHOWN[k] + j) % mine.length].item);
  }
  // A kind with nothing verified: top up from leftovers so the page isn't short
  for (const v of verified) if (items.length < total && !items.includes(v.item)) items.push(v.item);
  const final = items.slice(0, total);
  return { items: final, places: Object.fromEntries(final.map((x) => [x.key, places[x.key]])) };
}
