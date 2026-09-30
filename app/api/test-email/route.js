// Temporary: sends [TEST] daily emails WITH a matching photo to the addresses in
// "setting:test_email" (comma-separated). Locked by "setting:diag_token". Links are dummies.
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { getContent } from "@/lib/content";
import { getEmailPhoto } from "@/lib/emailPhotos";
import { sendDaily } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const token = params.get("token");
  const expected = await getSetting("diag_token", null);
  const to = String((await getSetting("test_email", "")) || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!expected || !token || token !== expected || !to.length) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const destination = params.get("dest") || "Tokyo, Japan";
  const themeIndex = Number(params.get("theme") ?? 1);
  try {
    const { tip, fact } = await getContent(destination, themeIndex);
    const debug = [];
    const photo = await getEmailPhoto(destination, themeIndex, tip, fact, debug);
    console.log("PHOTO_DEBUG", JSON.stringify({ destination, themeIndex, photo, debug }));
    if (!photo) return NextResponse.json({ sent: 0, note: "no matching photo found", tip, fact, debug });
    for (const email of to) {
      await sendDaily({
        email, destination, token: "00000000-0000-0000-0000-000000000000", daysLeft: 62, tipNumber: 3,
        tip, fact, startDate: new Date(Date.now() + 62 * 86400000).toISOString().slice(0, 10), endDate: "", subjectPrefix: "[TEST] ", personalLine: true, photo,
      });
    }
    return NextResponse.json({ sent: to.length, tip, fact, photo, debug });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
