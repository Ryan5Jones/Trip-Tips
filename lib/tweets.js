import Anthropic from "@anthropic-ai/sdk";
import { THEMES } from "./content";

const anthropic = new Anthropic();

// Rotating list of popular destinations for the daily tweet (41 so it lines up
// differently with the 10 themes each cycle and rarely repeats a combination).
export const TWEET_DESTINATIONS = [
  "Tokyo, Japan", "Lisbon, Portugal", "Mexico City, Mexico", "Rome, Italy", "Bangkok, Thailand",
  "Reykjavik, Iceland", "Marrakech, Morocco", "Kyoto, Japan", "Barcelona, Spain", "Cape Town, South Africa",
  "Seoul, South Korea", "Paris, France", "Buenos Aires, Argentina", "Istanbul, Turkey", "Bali, Indonesia",
  "Amsterdam, Netherlands", "Hanoi, Vietnam", "Dublin, Ireland", "Cusco, Peru", "Athens, Greece",
  "Copenhagen, Denmark", "New Orleans, USA", "Cartagena, Colombia", "Edinburgh, Scotland", "Singapore",
  "Prague, Czech Republic", "Queenstown, New Zealand", "Havana, Cuba", "Vienna, Austria", "Seville, Spain",
  "Oaxaca, Mexico", "Budapest, Hungary", "Sydney, Australia", "Cairo, Egypt", "Hong Kong",
  "Florence, Italy", "Montreal, Canada", "Taipei, Taiwan", "Porto, Portugal", "Nairobi, Kenya",
  "Honolulu, Hawaii",
];

// Deterministic pick for a date (YYYY-MM-DD) and slot ("morning" | "evening"),
// so retries get the same topic and the two daily tweets are about different places.
export function tweetTopicFor(date, slot = "morning") {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  const offset = slot === "evening" ? 20 : 0; // evening = a place about halfway around the list
  const themeOffset = slot === "evening" ? 5 : 0;
  return {
    destination: TWEET_DESTINATIONS[(day + offset) % TWEET_DESTINATIONS.length],
    theme: THEMES[(day + themeOffset) % THEMES.length],
  };
}

const tweetLength = (s) => [...s].length;

// long = account has X Premium (posts over 280 characters allowed)
export async function writeTweet({ destination, theme }, { long = false } = {}) {
  const maxLen = long ? 480 : 260;
  let shortest = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: long ? 500 : 300,
      system: long
        ? "You write one post a day for Destinations Daily, a free newsletter that sends travelers a daily tip and " +
          "fun fact about where they're headed. The account has X Premium, so posts can be longer than 280 characters, " +
          "but only the first ~250 characters show before \"Show more\". Write ONE post about the destination and " +
          "theme given, in this shape: (1) a punchy first line that works on its own as a hook, starting with the " +
          "place name; (2) a blank line, then one practical, culturally aware tip; (3) a blank line, then one " +
          "surprising fun fact; (4) a blank line, then a short nudge that mentions the link in bio, such as " +
          "\"Heading somewhere? Get a daily tip until you go. Link in bio!\" (vary the wording). End with one hashtag " +
          "such as #TravelTips. Rules: 300 to 450 characters total; friendly and specific, not generic; at most two " +
          "relevant emojis; no links, no @mentions, no quotes around the post. Only state things that are well " +
          "established and widely documented. No safety, visa, legal or price claims. Output only the post text."
        : "You write one tweet a day for Destinations Daily, a free newsletter that sends travelers a daily tip and " +
          "fun fact about where they're headed. Write ONE tweet: a surprising fun fact or a practical, culturally aware " +
          "tip about the destination and theme given, followed by a short nudge that mentions the link in bio, such as " +
          "\"Heading somewhere? Get a daily tip until you go. Link in bio!\" (vary the wording so it doesn't sound " +
          "copy-pasted). Rules: under 220 characters total (hard limit); friendly and specific, not generic; start with the place " +
          "name; at most one relevant emoji; end with one hashtag such as #TravelTips; no links, no @mentions, no " +
          "quotes around the tweet. Only state things that are well established and widely documented. No safety, " +
          "visa, legal or price claims. Output only the tweet text.",
      messages: [{ role: "user", content: `Destination: ${destination}\nTheme: ${theme}` }],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!text || /https?:\/\//i.test(text)) continue;
    if (tweetLength(text) <= maxLen) return text;
    if (!shortest || tweetLength(text) < tweetLength(shortest)) shortest = text;
  }
  // Still too long after 3 tries: trim whole sentences but keep the hashtag
  if (shortest && !long) return shortenForX(shortest);
  throw new Error("Could not generate a tweet under the length limit");
}

// Fallback if a long post is rejected: keep whole sentences up to ~260 characters, add the hashtag back.
export function shortenForX(text) {
  const tag = (text.match(/#\w+\s*$/) || ["#TravelTips"])[0].trim();
  const body = text.replace(/#\w+\s*$/, "").trim();
  const sentences = body.split(/(?<=[.!?])\s+/);
  let out = "";
  for (const sentence of sentences) {
    if ([...(out ? out + " " + sentence : sentence)].length > 255) break;
    out = out ? out + " " + sentence : sentence;
  }
  return `${out || [...body].slice(0, 250).join("")} ${tag}`.trim();
}
