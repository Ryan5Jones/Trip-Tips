import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!token) return NextResponse.redirect(`${base}/?status=invalid`);

  const { data } = await db
    .from("subscribers")
    .update({ confirmed: true, unsubscribed: false })
    .eq("token", token)
    .select("id")
    .maybeSingle();

  return NextResponse.redirect(`${base}/?status=${data ? "confirmed" : "invalid"}`);
}
