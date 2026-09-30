// First names for email greetings. A wrong name is worse than none, so only guess from the email
// address when it's clearly "first.last" / "first_last" / "first-last". Otherwise return null ("Hey!").
const NOT_NAMES = new Set([
  "info", "hello", "hi", "contact", "admin", "support", "team", "mail", "email", "the", "my", "me", "mr", "mrs",
  "ms", "dr", "travel", "trips", "office", "sales", "noreply", "test", "user", "account", "family", "home", "work",
]);

// Tidy a name someone typed into the form: letters, spaces, apostrophes, hyphens; max 40 chars
export function cleanFirstName(raw) {
  const s = String(raw || "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!s || !/^[\p{L}][\p{L}' -]*$/u.test(s)) return null;
  const first = s.split(" ")[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function guessFirstName(email) {
  const local = String(email || "").split("@")[0].toLowerCase().replace(/\+.*$/, "");
  const parts = local.split(/[._]+/).filter(Boolean); // not "-", so "jo-ann" isn't cut to "Jo"
  if (parts.length < 2) return null; // "apickering4343", "johnsboehme": too ambiguous
  const first = parts[0];
  if (!/^[a-z]{2,15}$/.test(first) || NOT_NAMES.has(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function firstNameFor(subscriber) {
  return cleanFirstName(subscriber?.first_name) || guessFirstName(subscriber?.email);
}
