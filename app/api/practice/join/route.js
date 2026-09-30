// Lets a subscriber who is on their own join a friend's leaderboard group by typing the friend's code.
// Someone already in a group with other people can't jump to another one (so groups never get merged by accident).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLeaderboard } from "@/lib/leaderboard";
import { tripShareUrl } from "@/lib/share";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "");
  const code = String(body.code || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!UUID.test(token)) return fail("Bad token");
  if (!/^[a-z0-9]{6,16}$/.test(code)) return fail("That code doesn't look right. Codes are about 10 letters and numbers.");

  const { data: me } = await db
    .from("subscribers")
    .select("id, destination, start_date, end_date, group_code, share_code")
    .eq("token", token)
    .maybeSingle();
  if (!me) return fail("Not found", 404);

  // Find the group the code points to (a person's own code, or a group's code)
  let target = null;
  const { data: byShare } = await db
    .from("subscribers").select("id, group_code, share_code").eq("share_code", code).maybeSingle();
  if (byShare) target = byShare.group_code || byShare.share_code;
  else {
    const { data: byGroup } = await db.from("subscribers").select("id").eq("group_code", code).limit(1).maybeSingle();
    if (byGroup) target = code;
  }
  if (!target) return fail("We couldn't find a group with that code. Check it with your friend.");

  const current = me.group_code || me.share_code;
  if (target === current) return fail("You're already in that group.");

  // Is anyone else in my current group?
  const { data: others } = await db
    .from("subscribers")
    .select("id, group_code, share_code")
    .or(`group_code.eq.${current},share_code.eq.${current}`)
    .neq("id", me.id)
    .limit(20);
  if ((others || []).some((o) => (o.group_code || o.share_code) === current)) {
    return fail("You're already in a group with friends. Ask your friend to sign up or join through your link instead.");
  }

  await db.from("subscribers").update({ group_code: target }).eq("id", me.id);
  const updated = { ...me, group_code: target };
  return NextResponse.json({
    ok: true,
    groupCode: target,
    board: await getLeaderboard(updated),
    inviteUrl: tripShareUrl({
      destination: me.destination,
      startDate: me.start_date,
      endDate: me.end_date,
      group: target,
      base: process.env.NEXT_PUBLIC_SITE_URL,
    }),
  });
}
