// Ticks or unticks a dish on a subscriber's "Food to try" list.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { destinationKey } from "@/lib/content";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req) {
  const { token, key, tried } = await req.json().catch(() => ({}));
  if (!UUID.test(String(token || "")) || !/^[a-z0-9-]{1,60}$/.test(String(key || ""))) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { data: sub } = await db.from("subscribers").select("id, destination").eq("token", token).maybeSingle();
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only dishes that are really on this destination's list
  const { data: list } = await db.from("food_cache").select("items").eq("destination_key", destinationKey(sub.destination)).maybeSingle();
  if (!(list?.items || []).some((x) => x.key === key)) return NextResponse.json({ error: "Unknown dish" }, { status: 400 });

  if (tried) await db.from("food_tried").upsert({ subscriber_id: sub.id, dish_key: key });
  else await db.from("food_tried").delete().eq("subscriber_id", sub.id).eq("dish_key", key);
  return NextResponse.json({ ok: true });
}
