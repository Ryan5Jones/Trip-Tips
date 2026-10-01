// Resend calls this URL every time an email is delivered, opened, clicked, or bounces,
// and this saves the event into the email_events table in Supabase.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { handleInboundReply } from "@/lib/replies";

const TRACKED_EVENTS = new Set(["email.delivered", "email.opened", "email.clicked", "email.bounced"]);

// Checks that the request really came from Resend (using the whsec_ signing secret)
function isFromResend(payload, id, timestamp, signatureHeader) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !id || !timestamp || !signatureHeader) return false;

  // Reject anything older than 5 minutes
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");

  // Header looks like "v1,abc123 v1,def456"
  return signatureHeader.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export async function POST(req) {
  const payload = await req.text();
  const id = req.headers.get("svix-id") ?? "";
  const timestamp = req.headers.get("svix-timestamp") ?? "";
  const signature = req.headers.get("svix-signature") ?? "";

  if (!isFromResend(payload, id, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(payload);
  // A copy of an email sent to tips@ (replies from subscribers) -> shape that subscriber's future tips
  if (event.type === "email.received") {
    try {
      const outcome = await handleInboundReply(event.data);
      console.log("INBOUND_REPLY", JSON.stringify(outcome));
      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error("INBOUND_REPLY failed:", e);
      return NextResponse.json({ error: "Could not process reply" }, { status: 500 }); // Resend will retry
    }
  }
  if (!TRACKED_EVENTS.has(event.type)) return NextResponse.json({ ok: true });

  const to = event.data?.to;
  const { error } = await db.from("email_events").upsert(
    {
      svix_id: id,
      resend_email_id: event.data?.email_id,
      event_type: String(event.type).replace("email.", ""),
      recipient: Array.isArray(to) ? to[0] : to ?? null,
      link: event.data?.click?.link ?? null,
      occurred_at: event.created_at ?? new Date().toISOString(),
    },
    { onConflict: "svix_id", ignoreDuplicates: true }
  );

  if (error) {
    console.error("Failed to save Resend event:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 }); // Resend will retry
  }
  return NextResponse.json({ ok: true });
}
