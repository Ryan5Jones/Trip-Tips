// Temporary diagnostic: runs ONLY the tweet writer (no posting to X) and returns the raw AI response.
// Locked by a one-time token stored in Supabase (social_state key "setting:diag_token").
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { callTweetWriter, tweetTopicFor } from "@/lib/tweets";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  const expected = await getSetting("diag_token", null);
  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const topic = tweetTopicFor(new Date().toISOString().slice(0, 10), "morning");
  try {
    const res = await callTweetWriter(topic);
    return NextResponse.json({
      topic,
      model: res.model,
      stop_reason: res.stop_reason,
      blocks: (res.content || []).map((b) => ({ type: b.type, text: b.text ?? null })),
      usage: res.usage,
    });
  } catch (e) {
    return NextResponse.json({ topic, error: String(e.message || e), status: e.status ?? null }, { status: 500 });
  }
}
