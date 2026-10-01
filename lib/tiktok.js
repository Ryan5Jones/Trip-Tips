// TikTok daily photo carousel (draft to Ryan's TikTok inbox; he adds a trending sound and taps Post).
// Slides are images our site generates (app/api/tiktok/slide/<date>/<n>), so TikTok pulls them from our verified domain.
import Anthropic from "@anthropic-ai/sdk";
import { THEMES } from "./content";
import { TWEET_DESTINATIONS, destinationHashtag } from "./tweets";

const anthropic = new Anthropic();

export const SLIDE_COUNT = 4; // hook, tip, fun fact, call to action

export function tiktokTopicFor(date) {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return {
    destination: TWEET_DESTINATIONS[(day + 15) % TWEET_DESTINATIONS.length],
    theme: THEMES[(day + 4) % THEMES.length],
  };
}

// Returns { hook, tip, fact, title, description }
export async function writeTikTok({ destination, theme }) {
  const tag = destinationHashtag(destination);
  const res = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 3000,
    system:
      "You write one TikTok photo carousel a day for Destinations Daily, a free service that emails travelers a daily tip and fun fact " +
      "about where they're headed. Voice: very funny and meme-literate, like a well-traveled friend who lives on TikTok. Use text-only meme formats, " +
      'for example: "POV: you just landed in X and...", "Nobody: / Me in X:", "Expectation: ... Reality: ...", "Tell me you\'re going to X without telling me", ' +
      '"Me pretending I\'ll only eat one...", "Normalize...", "The X locals when you...". Pick a different format each day. Humor is about the TRAVELER\'s ' +
      "experience (jet lag, overpacking, over-ordering, getting lost, trying the language), never mocking the place, its people or culture; no stereotypes. " +
      "The tip and fun fact must still be genuinely true and useful: a joke wrapper around a real tip or well-documented fact. No safety, visa, legal or price claims. " +
      "Return ONLY JSON: " +
      '{"hook": string, "tip": string, "fact": string, "title": string, "description": string}. ' +
      "hook: slide 1, a meme-format scroll-stopper that mentions the place, at most 80 characters (use a slash between meme lines if the format needs it). " +
      "tip: slide 2, the real tip delivered with a funny punchline, at most 150 characters. fact: slide 3, the real fun fact with a funny reaction, at most 150 characters. " +
      "title: at most 80 characters, funny, includes the place name. " +
      `description: a short funny caption (under 120 characters) ending with a nudge like "Heading there? Free daily tips: link in bio" (vary it), then 3 to 5 hashtags, the first being ${tag}. ` +
      "No emojis inside hook, tip or fact; at most 2 in description. No links, no @mentions.",
    messages: [{ role: "user", content: `Destination: ${destination}\nTheme: ${theme}` }],
  });
  const text = (res.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON from TikTok writer");
  const o = JSON.parse(m[0]);
  const clean = (v, max) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
  const out = {
    hook: clean(o.hook, 90),
    tip: clean(o.tip, 170),
    fact: clean(o.fact, 170),
    title: clean(o.title, 90),
    description: clean(o.description, 400),
  };
  if (!out.hook || !out.tip || !out.fact || !out.title) throw new Error("TikTok writer returned incomplete content");
  if (/https?:\/\//i.test(out.description + out.hook + out.tip + out.fact)) throw new Error("TikTok content contained a link");
  return out;
}
