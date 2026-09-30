import crypto from "crypto";

// Percent-encoding as required by OAuth 1.0a (RFC 3986)
const enc = (s) =>
  encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

// Builds the OAuth 1.0a signature. `params` = oauth params + any query/form params (not JSON bodies).
export function oauthSignature(method, url, params, consumerSecret, tokenSecret) {
  const paramStr = Object.keys(params)
    .sort()
    .map((k) => `${enc(k)}=${enc(params[k])}`)
    .join("&");
  const base = [method.toUpperCase(), enc(url), enc(paramStr)].join("&");
  const key = `${enc(consumerSecret)}&${enc(tokenSecret)}`;
  return crypto.createHmac("sha1", key).update(base).digest("base64");
}

function authHeader(method, url, query = {}) {
  const oauth = {
    oauth_consumer_key: process.env.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };
  oauth.oauth_signature = oauthSignature(
    method, url, { ...oauth, ...query }, process.env.X_API_SECRET, process.env.X_ACCESS_TOKEN_SECRET
  );
  return "OAuth " + Object.keys(oauth).sort().map((k) => `${enc(k)}="${enc(oauth[k])}"`).join(", ");
}

export function xConfigured() {
  return Boolean(
    process.env.X_API_KEY && process.env.X_API_SECRET &&
    process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET
  );
}

// Low-level signed request to the X API v2
async function xRequest(method, path, { query = {}, json } = {}) {
  const url = `https://api.x.com/2${path}`;
  const clean = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const qs = new URLSearchParams(clean).toString();
  const res = await fetch(qs ? `${url}?${qs}` : url, {
    method,
    headers: {
      Authorization: authHeader(method, url, clean),
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: json ? JSON.stringify(json) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint =
      res.status === 401 ? " (check the four X_ keys in Vercel)" :
      res.status === 402 ? " (add credits in the X developer portal)" :
      res.status === 403 ? " (app needs Read and write permission; regenerate the access token after changing it)" : "";
    throw new Error(`X API ${res.status}${hint}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

// Posts a tweet as the account the access token belongs to. Returns the new tweet's id.
// Optional: replyTo (tweet id) or quote (tweet id).
export async function postTweet(text, { replyTo, quote } = {}) {
  const json = { text };
  if (replyTo) json.reply = { in_reply_to_tweet_id: replyTo };
  if (quote) json.quote_tweet_id = quote;
  const body = await xRequest("POST", "/tweets", { json });
  return body?.data?.id;
}

export async function getMe() {
  const body = await xRequest("GET", "/users/me", { query: { "user.fields": "username" } });
  return body.data; // { id, name, username }
}

export async function getUserByUsername(username) {
  const body = await xRequest("GET", `/users/by/username/${encodeURIComponent(username)}`, {
    query: { "user.fields": "public_metrics" },
  });
  return body.data; // { id, name, username, public_metrics }
}

// Tweets that @mention the given user, newest first
export async function getMentions(userId, sinceId) {
  const body = await xRequest("GET", `/users/${userId}/mentions`, {
    query: {
      since_id: sinceId,
      max_results: "20",
      "tweet.fields": "author_id,created_at,conversation_id",
      expansions: "author_id",
      "user.fields": "username",
    },
  });
  const users = Object.fromEntries((body.includes?.users || []).map((u) => [u.id, u.username]));
  return (body.data || []).map((t) => ({ ...t, username: users[t.author_id] }));
}

// A user's own recent original tweets (no replies/retweets), newest first
export async function getUserTweets(userId, sinceId) {
  const body = await xRequest("GET", `/users/${userId}/tweets`, {
    query: {
      since_id: sinceId,
      max_results: "5",
      exclude: "replies,retweets",
      "tweet.fields": "created_at",
    },
  });
  return body.data || [];
}
