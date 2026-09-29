// Put this file at:  app/api/resend-webhook/route.ts
// Resend calls this URL every time an email is delivered, opened, clicked, or bounces,
// and this saves the event into the email_events table in Supabase.
// No extra packages needed.

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// Connect to Supabase only when a request comes in (so a missing key can't break the build)
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only key, never expose to the browser
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const TRACKED_EVENTS = new Set([
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.bounced',
]);

// Checks that the request really came from Resend (using your whsec_ signing secret)
function isFromResend(payload: string, id: string, timestamp: string, signatureHeader: string) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !id || !timestamp || !signatureHeader) return false;

  // Reject anything older than 5 minutes
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');

  // Header looks like "v1,abc123 v1,def456"
  return signatureHeader.split(' ').some((part) => {
    const sig = part.split(',')[1];
    if (!sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export async function POST(request: Request) {
  const payload = await request.text();
  const id = request.headers.get('svix-id') ?? '';
  const timestamp = request.headers.get('svix-timestamp') ?? '';
  const signature = request.headers.get('svix-signature') ?? '';

  // 1) Make sure the request really came from Resend
  if (!isFromResend(payload, id, timestamp, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const event = JSON.parse(payload);

  // 2) Ignore event types we don't care about
  if (!TRACKED_EVENTS.has(event.type)) {
    return NextResponse.json({ ok: true });
  }

  // 3) Save it
  const supabase = getSupabase();
  if (!supabase) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel');
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const to = event.data?.to;
  const { error } = await supabase.from('email_events').upsert(
    {
      svix_id: id,
      resend_email_id: event.data?.email_id,
      event_type: String(event.type).replace('email.', ''),
      recipient: Array.isArray(to) ? to[0] : to ?? null,
      link: event.data?.click?.link ?? null,
      occurred_at: event.created_at ?? new Date().toISOString(),
    },
    { onConflict: 'svix_id', ignoreDuplicates: true }
  );

  if (error) {
    console.error('Failed to save Resend event:', error);
    // A 500 tells Resend to retry later
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
