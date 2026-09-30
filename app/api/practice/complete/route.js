// Saves a finished practice round and returns the updated streak.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { streakFrom } from "@/lib/streak";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { token, score, total, points, localDate } = body;
  if (!UUID.test(String(token || ""))) return NextResponse.json({ error: "Bad token" }, { status: 400 });

  // Use the player's local date (so streaks follow their day), but only if it's within a day of ours
  const serverToday = new Date().toISOString().slice(0, 10);
  let day = serverToday;
  if (DATE.test(String(localDate || ""))) {
    const diff = Math.abs(Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${serverToday}T00:00:00Z`));
    if (diff <= 86400000) day = localDate;
  }

  const { data: sub } = await db.from("subscribers").select("id").eq("token", token).maybeSingle();
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cleanScore = Math.max(0, Math.min(100, Number(score) || 0));
  const cleanTotal = Math.max(1, Math.min(100, Number(total) || 1));
  // A round can't realistically earn more than this, so ignore absurd numbers
  const cleanPoints = Math.max(0, Math.min(3500, Math.round(Number(points) || 0)));
  // Keep the best score and best points for the day
  const { data: existing } = await db
    .from("practice_progress").select("score, total, points").eq("subscriber_id", sub.id).eq("day", day).maybeSingle();
  if (!existing || cleanScore > existing.score || cleanPoints > existing.points) {
    await db.from("practice_progress").upsert({
      subscriber_id: sub.id,
      day,
      score: Math.max(cleanScore, existing?.score || 0),
      total: cleanTotal,
      points: Math.max(cleanPoints, existing?.points || 0),
    });
  }

  const { data: days } = await db
    .from("practice_progress").select("day").eq("subscriber_id", sub.id).order("day", { ascending: false }).limit(400);
  return NextResponse.json({ ok: true, streak: streakFrom((days || []).map((d) => d.day), day) });
}
