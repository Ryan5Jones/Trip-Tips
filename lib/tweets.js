import Anthropic from "@anthropic-ai/sdk";
import { THEMES, getContent } from "./content";

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

// About 4 in 10 posts (tweets, Facebook, Instagram captions) use a text-only meme format; the rest keep the usual style.
export const MEME_CHANCE = 0.4;
export const MEME_STYLE =
  " For THIS post, write it as a text-only meme format instead of a plain tip, such as: \"POV: you just landed in X and...\", " +
  "\"Nobody: / Me in X:\", \"Expectation: ... Reality: ...\", \"Tell me you're going to X without telling me\", or \"Normalize...\". " +
  "Pick one format that fits. The joke is about the traveler's experience, never the place or its people, and the tip or fact inside it must still be true. " +
  "Keep every other rule (length, hashtag, link in bio nudge).";
export const maybeMeme = () => (Math.random() < MEME_CHANCE ? MEME_STYLE : "");

const tweetLength = (s) => [...s].length;

export async function callTweetWriter({ destination, theme }, { long = false } = {}) {
  return anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: long ? 3000 : 2000, // room for the model's thinking + the tweet
      system: long
        ? "You write one post a day for Destinations Daily, a free newsletter that sends travelers a daily tip and " +
          "fun fact about where they're headed. " +
          "Voice: snappy and funny. Open with a hook, and use light, witty humor (playful exaggeration, a wry " +
          "aside, a relatable traveler moment). Joke about the traveler's experience, never mock the place, its " +
          "people, or their culture, and avoid stereotypes. The fact itself must still be accurate. " +
          "The account has X Premium, so posts can be longer than 280 characters, " +
          "but only the first ~250 characters show before \"Show more\". Write ONE post about the destination and " +
          "theme given, in this shape: (1) a punchy first line that works on its own as a hook, starting with the " +
          "place name; (2) a blank line, then one practical, culturally aware tip; (3) a blank line, then one " +
          "surprising fun fact; (4) a blank line, then a short nudge that mentions the link in bio, such as " +
          "\"Heading somewhere? Get a daily tip until you go. Link in bio!\" (vary the wording). End with exactly one hashtag: " +
          "the destination's name as a hashtag (e.g. #NewOrleans, #Tokyo, #Lisbon). Rules: 300 to 450 characters total; friendly and specific, not generic; at most two " +
          "relevant emojis; no links, no @mentions, no quotes around the post. Only state things that are well " +
          "established and widely documented. No safety, visa, legal or price claims. Output only the post text."
        : "You write one tweet a day for Destinations Daily, a free newsletter that sends travelers a daily tip and " +
          "fun fact about where they're headed. " +
          "Voice: snappy and funny. Open with a hook, and use light, witty humor (playful exaggeration, a wry " +
          "aside, a relatable traveler moment). Joke about the traveler's experience, never mock the place, its " +
          "people, or their culture, and avoid stereotypes. The fact itself must still be accurate. " +
          "Write ONE tweet: a surprising fun fact or a practical, culturally aware " +
          "tip about the destination and theme given, followed by a short nudge that mentions the link in bio, such as " +
          "\"Heading somewhere? Get a daily tip until you go. Link in bio!\" (vary the wording so it doesn't sound " +
          "copy-pasted). Rules: under 220 characters total (hard limit); friendly and specific, not generic; start with the place " +
          "name; at most one relevant emoji; end with exactly one hashtag: the destination's name as a hashtag (e.g. #NewOrleans, #Tokyo, #Lisbon); no links, no @mentions, no " +
          "quotes around the tweet. Only state things that are well established and widely documented. No safety, " +
          "visa, legal or price claims. Output only the tweet text.",
      messages: [{ role: "user", content: `Destination: ${destination}\nTheme: ${theme}${maybeMeme()}` }],
    });
}

// long = account has X Premium (posts over 280 characters allowed)
export async function writeTweet({ destination, theme }, { long = false } = {}) {
  const maxLen = long ? 480 : 260;
  let shortest = null;
  const problems = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await callTweetWriter({ destination, theme }, { long });
    const text = (res.content || [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!text) {
      problems.push(`empty (stop_reason=${res.stop_reason}, blocks=${(res.content || []).map((b) => b.type).join("|")})`);
      continue;
    }
    if (/https?:\/\//i.test(text)) {
      problems.push("contained a link");
      continue;
    }
    if (tweetLength(text) <= maxLen) return text;
    if (!shortest || tweetLength(text) < tweetLength(shortest)) shortest = text;
  }
  // Still too long after 3 tries: trim whole sentences but keep the hashtag
  if (shortest && !long) return shortenForX(shortest);

  // Backup: build the tweet from the same tip/fact generator the emails use
  try {
    const themeIndex = Math.max(0, THEMES.indexOf(theme));
    const { tip, fact } = await getContent(destination, themeIndex);
    const place = destination.split(",")[0].trim();
    const tag = destinationHashtag(destination);
    const nudge = "Traveling soon? A tip a day until you go, link in bio!";
    for (const line of [fact, tip]) {
      const candidate = `${place}: ${line} ${nudge} ${tag}`;
      if (tweetLength(candidate) <= 275) return candidate;
    }
    return shortenForX(`${place}: ${fact} ${tag}`);
  } catch (e) {
    problems.push(`backup failed: ${String(e.message || e).slice(0, 120)}`);
  }
  throw new Error(`Could not generate a tweet: ${problems.join("; ").slice(0, 400)}`);
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

// "New Orleans, USA" -> "#NewOrleans"
export function destinationHashtag(destination) {
  const place = destination.split(",")[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return "#" + place.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}
