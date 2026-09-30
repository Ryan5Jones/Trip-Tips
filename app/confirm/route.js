import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tripShareUrl } from "@/lib/share";

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!token) return NextResponse.redirect(`${base}/?status=invalid`);

  const { data } = await db
    .from("subscribers")
    .update({ confirmed: true, unsubscribed: false })
    .eq("token", token)
    .select("destination, start_date, end_date, group_code, share_code")
    .maybeSingle();

  if (!data) return NextResponse.redirect(`${base}/?status=invalid`);

  // Include the trip so the page can show "Share this trip"
  try {
    const share = new URL(tripShareUrl({ destination: data.destination, startDate: data.start_date, endDate: data.end_date, group: data.group_code || data.share_code, base }));
    share.searchParams.delete("via");
    share.searchParams.set("status", "confirmed");
    return NextResponse.redirect(share.toString());
  } catch {
    return NextResponse.redirect(new URL("/?status=confirmed", req.url));
  }
}
