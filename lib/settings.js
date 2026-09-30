import { db } from "./db";

// On/off switches, stored in the social_state table in Supabase so they can be
// changed without touching Vercel or redeploying. Falls back to the Vercel env
// var if the switch hasn't been set in Supabase.
//
//   tweets_enabled  true/false          daily morning/evening tweets
//   social_mode     "preview" | "auto"  mention replies + quote tweets
//   quotes_per_day  number              cap on quote tweets per day
export async function getSetting(key, envFallback) {
  const { data } = await db.from("social_state").select("value").eq("key", `setting:${key}`).maybeSingle();
  if (data && data.value !== null && data.value !== undefined) return data.value;
  return envFallback;
}
