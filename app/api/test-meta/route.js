// TEMPORARY (delete after use): runs the Meta stats job once.
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { runMetaStats } from "../cron/meta-stats/route";
export const maxDuration = 120;
export async function GET(req) {
  const want = await getSetting("diag_token", null);
  if (!want || new URL(req.url).searchParams.get("t") !== want) return NextResponse.json({ error: "no" }, { status: 401 });
  return NextResponse.json(await runMetaStats());
}
