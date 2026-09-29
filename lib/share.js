// Builds a link that opens the signup form pre-filled with someone's trip,
// so they can send it to friends traveling with them.
// Only the destination and dates are shared, never the subscriber's email or token.
export function tripShareUrl({ destination, startDate, endDate, base = process.env.NEXT_PUBLIC_SITE_URL }) {
  const params = new URLSearchParams({ trip: destination, leave: startDate });
  if (endDate) params.set("return", endDate);
  params.set("via", "friend");
  return `${base}/?${params.toString()}`;
}

// Reads a shared trip back out of the URL, ignoring anything invalid or already past.
export function parseSharedTrip(searchParams, today = new Date().toISOString().slice(0, 10)) {
  const destination = String(searchParams?.trip || "").trim().slice(0, 80);
  const startDate = String(searchParams?.leave || "");
  const endDate = String(searchParams?.return || "");
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (destination.length < 2 || !isDate(startDate) || startDate <= today) return null;
  return {
    destination,
    startDate,
    endDate: isDate(endDate) && endDate >= startDate ? endDate : "",
  };
}
