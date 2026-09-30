// Finds a free-to-use destination photo on Pexels (https://www.pexels.com/license/).
// Needs PEXELS_API_KEY in Vercel. Returns null if unavailable, so tweets still post as text.
export async function findDestinationPhoto(destination) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const place = destination.split(",")[0].trim();
  for (const query of [`${place} city`, place, destination]) {
    const res = await fetch(
      `https://api.pexels.com/v1/search?${new URLSearchParams({ query, orientation: "landscape", per_page: "15" })}`,
      { headers: { Authorization: key } }
    );
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({}));
    const photos = body.photos || [];
    if (photos.length) {
      // Vary the pick so the same place doesn't always get the same photo
      const photo = photos[Math.floor(Math.random() * Math.min(photos.length, 8))];
      return {
        url: photo.src?.large2x || photo.src?.large || photo.src?.original,
        photographer: String(photo.photographer || "Pexels").slice(0, 24),
        pexelsUrl: photo.url,
        alt: photo.alt || `${place}`,
      };
    }
  }
  return null;
}
