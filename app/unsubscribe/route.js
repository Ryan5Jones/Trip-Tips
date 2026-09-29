import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (token) await db.from("subscribers").update({ unsubscribed: true }).eq("token", token);
  return NextResponse.redirect(`${base}/?status=unsubscribed`);
}
