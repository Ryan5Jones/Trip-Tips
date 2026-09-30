import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendConfirmation } from "@/lib/email";
import { cleanFirstName, firstNameFor } from "@/lib/names";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { email, destination, startDate, endDate, website, firstName, group } = body;

  if (website) return NextResponse.json({ ok: true }); // honeypot: bots fill this in

  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanDest = String(destination || "").trim().slice(0, 80);
  const today = new Date().toISOString().slice(0, 10);

  if (!EMAIL_RE.test(cleanEmail)) return err("Enter a valid email address.");
  if (cleanDest.length < 2) return err("Enter where you're traveling.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") || startDate <= today)
    return err("Pick a departure date in the future.");
  if (endDate && endDate < startDate) return err("Your return date is before your departure.");

  const { data, error } = await db
    .from("subscribers")
    .upsert(
      {
        email: cleanEmail, destination: cleanDest, start_date: startDate, end_date: endDate || null,
        // Only set a name when one was typed, so a blank re-signup never erases it
        ...(cleanFirstName(firstName) ? { first_name: cleanFirstName(firstName) } : {}),
      },
      { onConflict: "email,destination,start_date" }
    )
    .select("id, token, confirmed, first_name, group_code, share_code")
    .single();

  if (error) return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });

  // Joined through a friend's link: put them in that friend's leaderboard group (only if the code is real,
  // and never move someone who already has a group)
  let groupOut = data.group_code || data.share_code;
  const g = String(group || "");
  if (/^[a-z0-9]{6,16}$/.test(g) && !data.group_code && g !== data.share_code) {
    const { data: root } = await db.from("subscribers").select("id").eq("share_code", g).maybeSingle();
    const { data: sibling } = root ? { data: null } : await db.from("subscribers").select("id").eq("group_code", g).limit(1).maybeSingle();
    if (root || sibling) {
      await db.from("subscribers").update({ group_code: g }).eq("id", data.id).is("group_code", null);
      groupOut = g;
    }
  }

  if (!data.confirmed) {
    await sendConfirmation({
      email: cleanEmail, destination: cleanDest, token: data.token,
      firstName: firstNameFor({ first_name: data.first_name, email: cleanEmail }),
    });
  }
  return NextResponse.json({ ok: true, group: groupOut });
}

const err = (message) => NextResponse.json({ error: message }, { status: 400 });
