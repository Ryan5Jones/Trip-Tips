// Replies to @mentions and quote-tweets big travel accounts. Runs on the schedules in vercel.json.
//
// SOCIAL_MODE (Vercel env var):
//   unset / "preview"  -> only writes drafts to the social_posts table (nothing is posted)
//   "auto"             -> posts replies and quote tweets automatically
// QUOTES_PER_DAY (optional, default 3): max quote tweets per day.
//
// Manual run in a browser: https://www.destinationsdaily.com/api/cron/social?secret=YOUR_CRON_SECRET
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { xConfigured, getMe, getMentions, getUserByUsername, getUserTweets, postTweet } from "@/lib/twitter";
import { draftMentionReply, draftQuote } from "@/lib/social";
import { getSetting } from "@/lib/settings";
import { COST, canSpend, recordSpend } from "@/lib/budget";

export const maxDuration = 120;

const MAX_AGE_HOURS = 12; // only quote fresh tweets
const MAX_MENTION_REPLIES_PER_RUN = 10;

async function getState(key) {
  const { data } = await db.from("social_state").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setState(key, value) {
  await db.from("social_state").upsert({ key, value, updated_at: new Date().toISOString() });
}

// Save a draft; returns false if we've already handled this source tweet
async function saveDraft(row) {
  const { error } = await db.from("social_posts").insert(row);
  if (error) {
    if (error.code === "23505") return false; // duplicate: already drafted/posted
    throw new Error(error.message);
  }
  return true;
}

async function publish(kind, sourceTweetId, text, auto) {
  if (!auto) return;
  if (!(await canSpend(COST.post))) {
    await db.from("social_posts").update({ status: "skipped_budget" })
      .eq("kind", kind).eq("source_tweet_id", sourceTweetId);
    return;
  }
  try {
    const id = await postTweet(text, kind === "reply" ? { replyTo: sourceTweetId } : { quote: sourceTweetId });
    await recordSpend(COST.post);
    await db.from("social_posts")
      .update({ status: "posted", posted_tweet_id: id, posted_at: new Date().toISOString() })
      .eq("kind", kind).eq("source_tweet_id", sourceTweetId);
  } catch (e) {
    await db.from("social_posts")
      .update({ status: "failed", error: String(e.message || e).slice(0, 500) })
      .eq("kind", kind).eq("source_tweet_id", sourceTweetId);
  }
}

export async function GET(req) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const authorized =
    secret &&
    (req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!xConfigured()) return NextResponse.json({ error: "X keys missing in Vercel environment variables" }, { status: 500 });

  // Switches live in Supabase (social_state "setting:social_mode" / "setting:quotes_per_day"); env vars are fallbacks
  const auto = (await getSetting("social_mode", process.env.SOCIAL_MODE)) === "auto";
  const summary = { mode: auto ? "auto" : "preview (drafts only)", replies: [], quotes: [], errors: [] };

  // ---------- 1) Reply to @mentions ----------
  try {
    let me = await getState("me");
    if (!me) {
      me = await getMe();
      await recordSpend(COST.ownedRead);
      await setState("me", me);
    }
    const initialized = await getState("mentions_initialized");
    const sinceId = await getState("mentions_since_id");
    // Worst case a mentions check returns 20 posts
    if (!(await canSpend(20 * COST.read))) throw new Error("monthly X budget reached; skipping mentions");
    const mentions = await getMentions(me.id, sinceId);
    await recordSpend(mentions.length * COST.read);

    if (!initialized) {
      // First run: start from now, don't reply to old mentions
      if (mentions[0]) await setState("mentions_since_id", mentions[0].id);
      await setState("mentions_initialized", true);
      summary.replies.push("first run: starting from now, older mentions ignored");
    } else {
      if (mentions[0]) await setState("mentions_since_id", mentions[0].id);
      for (const m of mentions.slice(0, MAX_MENTION_REPLIES_PER_RUN)) {
        if (m.author_id === me.id) continue;
        const draft = await draftMentionReply(m.text);
        if (draft.skip) continue;
        const fresh = await saveDraft({
          kind: "reply", source_tweet_id: m.id, source_author: m.username, source_text: m.text,
          destination: draft.destination, draft_text: draft.reply, status: auto ? "posting" : "pending",
        });
        if (!fresh) continue;
        await publish("reply", m.id, draft.reply, auto);
        summary.replies.push({ to: `@${m.username}`, text: draft.reply });
      }
    }
  } catch (e) {
    console.error("Mentions step failed:", e);
    summary.errors.push(`mentions: ${String(e.message || e)}`);
  }

  // ---------- 2) Quote tweets of big travel accounts ----------
  try {
    const perDay = Number(await getSetting("quotes_per_day", process.env.QUOTES_PER_DAY || 3));
    const today = new Date().toISOString().slice(0, 10);
    const { count: quotedToday } = await db.from("social_posts")
      .select("id", { count: "exact", head: true })
      .eq("kind", "quote").gte("created_at", `${today}T00:00:00Z`);
    let remaining = Math.max(0, perDay - (quotedToday || 0));

    const { data: accounts } = await db.from("watched_accounts").select("*").eq("enabled", true);
    for (const acct of accounts || []) {
      if (remaining <= 0) break;
      try {

      // Look up the account's id once
      // Worst case: 1 user lookup + 5 posts returned
      if (!(await canSpend(6 * COST.read))) {
        summary.errors.push("monthly X budget reached; skipping quote checks");
        break;
      }

      let userId = acct.user_id;
      if (!userId) {
        const u = await getUserByUsername(acct.username);
        await recordSpend(COST.read);
        if (!u) continue;
        userId = u.id;
        await db.from("watched_accounts")
          .update({ user_id: u.id, followers: u.public_metrics?.followers_count ?? null })
          .eq("username", acct.username);
      }

      const tweets = await getUserTweets(userId, acct.last_seen_id);
      await recordSpend(tweets.length * COST.read);
      if (tweets[0]) {
        await db.from("watched_accounts").update({ last_seen_id: tweets[0].id }).eq("username", acct.username);
      }
      if (!acct.last_seen_id) continue; // first run for this account: just mark where we are

      // Max one quote per account per day
      const { count: acctToday } = await db.from("social_posts")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quote").eq("source_author", acct.username).gte("created_at", `${today}T00:00:00Z`);
      if (acctToday) continue;

      for (const t of tweets) {
        const ageHours = (Date.now() - Date.parse(t.created_at)) / 3600000;
        if (ageHours > MAX_AGE_HOURS) continue;
        const draft = await draftQuote(t.text);
        if (draft.skip) continue;
        const fresh = await saveDraft({
          kind: "quote", source_tweet_id: t.id, source_author: acct.username, source_text: t.text,
          destination: draft.destination, draft_text: draft.quote, status: auto ? "posting" : "pending",
        });
        if (!fresh) continue;
        await publish("quote", t.id, draft.quote, auto);
        summary.quotes.push({ of: `@${acct.username}`, text: draft.quote });
        remaining--;
        break; // one per account per run
      }
      } catch (e) {
        // One bad account (typo, suspended, private) shouldn't stop the others
        summary.errors.push(`@${acct.username}: ${String(e.message || e).slice(0, 200)}`);
      }
    }
  } catch (e) {
    console.error("Quotes step failed:", e);
    summary.errors.push(`quotes: ${String(e.message || e)}`);
  }

  return NextResponse.json(summary);
}
