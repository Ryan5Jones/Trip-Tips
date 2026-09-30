// Finds a free-to-use destination photo. Tries Pexels (PEXELS_API_KEY) first, then
// Pixabay (PIXABAY_API_KEY). Returns null if neither is available, so tweets post as text.
//   Pexels license:  https://www.pexels.com/license/
//   Pixabay license: https://pixabay.com/service/license-summary/
const pick = (list) => list[Math.floor(Math.random() * Math.min(list.length, 8))]; // vary photos

async function fromPexels(destination) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const place = destination.split(",")[0].trim();
  for (const query of [`${place} city`, place, destination]) {
    const res = await fetch(
      `https://api.pexels.com/v1/search?${new URLSearchParams({ query, orientation: "landscape", per_page: "15" })}`,
      { headers: { Authorization: key } }
    );
    if (!res.ok) return null;
    const photos = (await res.json().catch(() => ({}))).photos || [];
    if (photos.length) {
      const p = pick(photos);
      return {
        url: p.src?.large2x || p.src?.large || p.src?.original,
        credit: `📷 ${String(p.photographer || "Pexels").slice(0, 24)} / Pexels`,
        sourceUrl: p.url,
      };
    }
  }
  return null;
}

async function fromPixabay(destination) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  const place = destination.split(",")[0].trim();
  for (const q of [`${place} city`, place, destination]) {
    const res = await fetch(
      `https://pixabay.com/api/?${new URLSearchParams({
        key, q, image_type: "photo", orientation: "horizontal", safesearch: "true", per_page: "20", order: "popular",
      })}`
    );
    if (!res.ok) return null;
    const hits = (await res.json().catch(() => ({}))).hits || [];
    if (hits.length) {
      const h = pick(hits);
      return {
        url: h.largeImageURL || h.webformatURL, // downloaded and re-uploaded to X (Pixabay asks not to hotlink)
        credit: `📷 ${String(h.user || "Pixabay").slice(0, 24)} / Pixabay`,
        sourceUrl: h.pageURL,
      };
    }
  }
  return null;
}

export async function findDestinationPhoto(destination) {
  return (await fromPexels(destination).catch(() => null)) || (await fromPixabay(destination).catch(() => null));
}
