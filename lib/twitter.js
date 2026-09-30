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

function authHeader(method, url) {
  const oauth = {
    oauth_consumer_key: process.env.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };
  oauth.oauth_signature = oauthSignature(
    method, url, oauth, process.env.X_API_SECRET, process.env.X_ACCESS_TOKEN_SECRET
  );
  return "OAuth " + Object.keys(oauth).sort().map((k) => `${enc(k)}="${enc(oauth[k])}"`).join(", ");
}

export function xConfigured() {
  return Boolean(
    process.env.X_API_KEY && process.env.X_API_SECRET &&
    process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET
  );
}

// Posts a tweet as the account the access token belongs to. Returns the new tweet's id.
export async function postTweet(text) {
  const url = "https://api.x.com/2/tweets";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader("POST", url), "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint =
      res.status === 401 ? " (check the four X_ keys in Vercel)" :
      res.status === 402 ? " (add credits in the X developer portal)" :
      res.status === 403 ? " (app needs Read and write permission; regenerate the access token after changing it)" : "";
    throw new Error(`X API ${res.status}${hint}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body?.data?.id;
}
