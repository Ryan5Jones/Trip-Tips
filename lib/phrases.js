// "Today's phrase": a short daily language lesson in the destination's main language.
// Phrases follow a fixed order (a mini course), cached per destination + day so everyone going
// to the same place shares them. Skipped when the destination mainly speaks English.
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { destinationKey } from "./content";

const anthropic = new Anthropic();

// Most useful first. After the list runs out it starts over as review.
export const PHRASE_TOPICS = [
  "hello / good day",
  "thank you",
  "please",
  "excuse me (to get attention or get past someone)",
  "sorry",
  "yes and no",
  "goodbye",
  "do you speak English?",
  "I don't understand",
  "how much is this?",
  "the check/bill, please",
  "a table for two, please",
  "I would like ... (ordering)",
  "water, please",
  "this is delicious",
  "cheers! (toast)",
  "where is the bathroom?",
  "where is ...? (asking directions)",
  "left, right, straight ahead",
  "one, two, three",
  "good morning / good evening",
  "nice to meet you",
  "my name is ...",
  "can you help me?",
  "a ticket to ..., please",
  "is it far?",
  "can I pay by card?",
  "no thank you",
  "have a nice day",
  "see you later",
];

async function askJSON(system, content) {
  const res = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 2000, // room for thinking + answer
    system,
    messages: [{ role: "user", content }],
  });
  const text = (res.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

// Returns { language, phrase, native, pronunciation, meaning, usage } or null (English-speaking / error)
export async function getDailyPhrase(destination, dayIndex, tip = "", fact = "") {
  const key = destinationKey(destination);
  const idx = dayIndex % PHRASE_TOPICS.length;

  const { data: cached } = await db
    .from("phrase_cache")
    .select("*")
    .eq("destination_key", key)
    .eq("idx", idx)
    .maybeSingle();
  if (cached) return cached.skip ? null : cached;

  // Keep the language decision consistent for a destination once it's been made
  const { data: prior } = await db
    .from("phrase_cache")
    .select("skip, language")
    .eq("destination_key", key)
    .limit(1)
    .maybeSingle();
  if (prior?.skip) return null;
  const knownLanguage = prior?.language || null;

  const out = await askJSON(
    "You teach travelers one useful phrase a day in the main local language of their destination. " +
      "Respond with ONLY JSON: " +
      '{"english_primary": boolean, "language": string, "phrase": string, "native": string|null, ' +
      '"pronunciation": string, "meaning": string, "usage": string}. ' +
      '"english_primary" is true if most locals at the destination speak English as their everyday language ' +
      "(then the other fields can be empty strings). Otherwise: language = the language a visitor would " +
      "most usefully use there (e.g. French for Paris, Japanese for Tokyo, Hawaiian only if truly everyday: " +
      "it is not, so Maui is english_primary). phrase = the phrase in Latin letters (romanized for non-Latin " +
      'scripts, e.g. "arigatou gozaimasu"); native = the phrase in its own script if not Latin (e.g. ' +
      '"ありがとうございます"), else null; pronunciation = a simple English-style respelling with the stressed ' +
      'syllable in CAPS (e.g. "mehr-SEE"); meaning = short English meaning; usage = one short, friendly sentence ' +
      "on when or how to use it (a light touch of humor is fine, never mocking the culture). Use the most common, " +
      "polite, widely understood form. Only give phrases you are certain are correct.",
    `Destination: ${destination}\nPhrase to teach: ${PHRASE_TOPICS[idx]}` +
      (knownLanguage ? `\nLanguage to use: ${knownLanguage} (english_primary is false)` : "") +
      (tip || fact
        ? `\nThe same email already says (don't repeat it; if it mentions this phrase, make "usage" add ` +
          `something new, like a variation, a reply you might hear, or a pronunciation trap):\nTip: ${tip}\nFact: ${fact}`
        : "")
  );
  if (!out) throw new Error("Could not generate a phrase");

  const skip = out.english_primary === true;
  if (!skip && !(out.phrase && out.pronunciation && out.meaning && out.language)) {
    throw new Error("Incomplete phrase");
  }
  const row = {
    destination_key: key,
    idx,
    skip,
    language: skip ? null : String(out.language).slice(0, 40),
    phrase: skip ? null : String(out.phrase).slice(0, 120),
    native: skip || !out.native ? null : String(out.native).slice(0, 120),
    pronunciation: skip ? null : String(out.pronunciation).slice(0, 120),
    meaning: skip ? null : String(out.meaning).slice(0, 120),
    usage: skip ? null : String(out.usage || "").slice(0, 300),
  };
  await db.from("phrase_cache").upsert(row);
  return skip ? null : row;
}
