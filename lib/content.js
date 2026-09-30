import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";

const anthropic = new Anthropic();

// One theme per email, in order, so the series reads like a mini course.
export const THEMES = [
  "greetings, basic phrases and everyday etiquette",
  "food and dining customs (tipping, meal times, table manners)",
  "getting around: public transport, taxis, walking",
  "money, payments and bargaining norms",
  "dress codes and what to wear",
  "local traditions, holidays and festivals",
  "dos and don'ts that surprise visitors",
  "hidden gems and how locals spend their time",
  "language: a few useful words and how to pronounce them",
  "history and culture worth knowing before you arrive",
];

export const destinationKey = (d) => d.trim().toLowerCase().replace(/\s+/g, " ");

export async function getContent(destination, themeIndex) {
  const key = destinationKey(destination);
  const idx = themeIndex % THEMES.length;

  const { data: cached } = await db
    .from("content_cache")
    .select("tip, fact")
    .eq("destination_key", key)
    .eq("theme_index", idx)
    .maybeSingle();
  if (cached) return cached;

  const res = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 2000, // room for the model's thinking + the answer
    system:
      "You write a short daily email for someone preparing for a trip. Respond with ONLY a JSON object " +
      '{"tip": string, "fact": string}. The tip is one practical, culturally aware tip (2-4 short sentences). ' +
      "The fact is one fun, well-established fact (1-2 sentences). Voice: friendly, snappy and conversational, " +
      "like a well-traveled friend. Lead with the most useful or surprising part, keep sentences short, and add at " +
      "most one light touch of humor (a wry aside or gentle reassurance), never forced; skip it if it doesn't fit. " +
      "Humor is about the traveler's experience, never mocking the place, its people or culture, and no stereotypes. " +
      "No emojis. Do not start the tip with \"Today's tip\" or the fact with \"Fun fact\" (the email adds those). " +
      'Example tone for Lisbon: tip "Learn three words before you land: \"bom dia\" (good morning), \"boa tarde\" ' +
      '(good afternoon) and \"obrigado\" (or \"obrigada\" if you\'re a woman). Greet staff first when you walk into ' +
      'a shop or caf\u00e9. It goes a long way, even if you switch to English right after."; fact "Portuguese is an ' +
      "official language in nine countries across four continents. Lisbon locals are known for swallowing their " +
      'vowels, so don\'t worry if it sounds nothing like the Portuguese you\'ve heard before." ' +
      "Only include things you are confident are accurate and widely documented. Do not include safety, visa or " +
      "legal claims.",
    messages: [
      {
        role: "user",
        content: `Destination: ${destination}\nTheme: ${THEMES[idx]}`,
      },
    ],
  });

  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  if (!parsed.tip || !parsed.fact) throw new Error("Bad content response");

  await db
    .from("content_cache")
    .upsert({ destination_key: key, theme_index: idx, tip: parsed.tip, fact: parsed.fact });
  return parsed;
}
