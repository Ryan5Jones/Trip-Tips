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

// Deterministic pick for a given date (YYYY-MM-DD), so retries on the same day get the same topic.
export function tweetTopicFor(date) {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return {
    destination: TWEET_DESTINATIONS[day % TWEET_DESTINATIONS.length],
    theme: THEMES[day % THEMES.length],
  };
}

const tweetLength = (s) => [...s].length;

export async function writeTweet({ destination, theme }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 300,
      system:
        "You write one tweet a day for Destinations Daily, a free newsletter that sends travelers a daily tip and " +
        "fun fact about where they're headed. Write ONE tweet: a surprising fun fact or a practical, culturally aware " +
        "tip about the destination and theme given. Rules: under 240 characters total; friendly and specific, not " +
        "generic; start with the place name; at most one relevant emoji; end with one hashtag such as #TravelTips; " +
        "no links, no @mentions, no quotes around the tweet. Only state things that are well established and widely " +
        "documented. No safety, visa, legal or price claims. Output only the tweet text.",
      messages: [{ role: "user", content: `Destination: ${destination}\nTheme: ${theme}` }],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^["']|["']$/g, "");
    if (text && tweetLength(text) <= 270 && !/https?:\/\//i.test(text)) return text;
  }
  throw new Error("Could not generate a tweet under the length limit");
}
