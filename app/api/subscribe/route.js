import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendConfirmation } from "@/lib/email";
import { cleanFirstName, firstNameFor } from "@/lib/names";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { email, destination, startDate, endDate, website, firstName } = body;

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
    .select("token, confirmed, first_name")
    .single();

  if (error) return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });

  if (!data.confirmed) {
    await sendConfirmation({
      email: cleanEmail, destination: cleanDest, token: data.token,
      firstName: firstNameFor({ first_name: data.first_name, email: cleanEmail }),
    });
  }
  return NextResponse.json({ ok: true });
}

const err = (message) => NextResponse.json({ error: message }, { status: 400 });
