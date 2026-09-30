import { db } from "./db";
import { getSetting } from "./settings";

// Estimated X API costs (pay-per-use, USD)
export const COST = {
  post: 0.015,       // creating a post without a link
  read: 0.005,       // each post returned when reading others' timelines / mentions
  ownedRead: 0.001,  // reading your own account info
};

const monthKey = () => `spend:${new Date().toISOString().slice(0, 7)}`; // e.g. spend:2026-10

export async function monthlyBudget() {
  return Number(await getSetting("x_monthly_budget", process.env.X_MONTHLY_BUDGET || 5));
}

export async function spentThisMonth() {
  const { data } = await db.from("social_state").select("value").eq("key", monthKey()).maybeSingle();
  return Number(data?.value || 0);
}

export async function recordSpend(amount) {
  if (!amount) return;
  const current = await spentThisMonth();
  await db.from("social_state").upsert({
    key: monthKey(),
    value: Math.round((current + amount) * 10000) / 10000,
    updated_at: new Date().toISOString(),
  });
}

// Money to keep aside for the rest of this month's daily tweets (2 per day)
export function dailyTweetReserve() {
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const daysLeft = daysInMonth - now.getUTCDate() + 1;
  return daysLeft * 2 * COST.post;
}

// Can we spend `amount` now? Daily tweets pass reserveForTweets=false (they are the priority);
// replies/quotes pass true so they never eat into the daily tweets' money.
export async function canSpend(amount, { reserveForTweets = true } = {}) {
  const [budget, spent] = await Promise.all([monthlyBudget(), spentThisMonth()]);
  const reserve = reserveForTweets ? dailyTweetReserve() : 0;
  return spent + amount + reserve <= budget;
}
