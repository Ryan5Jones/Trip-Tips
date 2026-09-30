import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const len = (s) => [...s].length;

async function askJSON(system, content, maxTokens = 2000) { // room for thinking + answer
  const res = await anthropic.messages.create({
    model: MODEL(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

const FACT_RULES =
  "Voice: snappy and lightly funny (a witty hook or wry aside), friendly, never snarky toward the person or " +
  "account you're replying to. Joke about the traveler's experience, never mock a place, its people, or their " +
  "culture, and avoid stereotypes. " +
  "Only state things that are well established and widely documented. No safety, visa, legal or price claims. " +
  "No links. Friendly, specific, never salesy or spammy. At most one emoji.";

// Reply to someone who @mentioned us. Returns { reply } or { skip: true }.
export async function draftMentionReply(mentionText) {
  for (let i = 0; i < 3; i++) {
    const out = await askJSON(
      "You run the X account for Destinations Daily, a free newsletter that emails travelers a daily tip and fun " +
        "fact about where they're headed until their trip. Someone @mentioned the account. Respond with ONLY JSON: " +
        '{"skip": true} if the tweet is spam, abusive, off-topic, or not about travel or a place; otherwise ' +
        '{"destination": string, "reply": string}. The reply: one genuinely useful tip or fun fact about the ' +
        "destination they mention (or a warm, helpful answer if no specific place), then a short nudge like " +
        '"Want one every day until you go? Link in bio!". Under 250 characters. Do not @mention anyone. ' +
        FACT_RULES,
      `Tweet: ${mentionText}`
    );
    if (out.skip) return { skip: true };
    if (out.reply && len(out.reply) <= 270 && !/https?:\/\//i.test(out.reply)) return out;
  }
  return { skip: true };
}

// Quote tweet for a big travel account's post. Returns { destination, quote } or { skip: true }.
export async function draftQuote(tweetText) {
  for (let i = 0; i < 3; i++) {
    const out = await askJSON(
      "You run the X account for Destinations Daily, a free newsletter that emails travelers a daily tip and fun " +
        "fact about where they're headed. A large travel account posted the tweet below. Respond with ONLY JSON. " +
        'If the tweet is NOT clearly about one specific destination (a city, region, country, or landmark), or is ' +
        'about a tragedy, disaster, politics, or anything sensitive, respond {"skip": true}. Otherwise respond ' +
        '{"destination": string, "quote": string}. The quote tweet: one surprising fun fact or practical tip about ' +
        'that destination that adds to the conversation, then "Link in bio!" (or a close variant), then one hashtag ' +
        "for the destination (e.g. #Lisbon, #Japan). Under 250 characters. Do not @mention anyone. " +
        FACT_RULES,
      `Tweet: ${tweetText}`
    );
    if (out.skip) return { skip: true };
    if (out.quote && len(out.quote) <= 270 && !/https?:\/\//i.test(out.quote) && /#\w/.test(out.quote)) return out;
  }
  return { skip: true };
}
