// Returns the friends leaderboard for the subscriber whose private token is given.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLeaderboard } from "@/lib/leaderboard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!UUID.test(token)) return NextResponse.json({ error: "Bad token" }, { status: 400 });
  const { data: sub } = await db
    .from("subscribers").select("id, group_code, share_code").eq("token", token).maybeSingle();
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ board: await getLeaderboard(sub) });
}
