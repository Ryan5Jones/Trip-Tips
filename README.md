# Trip Tips

Enter your email, destination and travel dates. Get a daily travel tip and fun fact about the place until you leave.

**Stack:** Next.js (App Router) · Supabase (Postgres) · Resend (email) · Claude API (content) · Vercel Cron (daily send)

## How it works

1. `POST /api/subscribe` validates the form, stores the subscriber, and sends a confirmation email (double opt-in).
2. `GET /confirm?token=...` marks the subscriber confirmed.
3. `GET /api/cron/daily` runs every day at 15:00 UTC (see `vercel.json`). For each confirmed subscriber whose trip hasn't started, it sends one email and stops automatically on the departure date.
4. Each email follows a themed sequence (`lib/content.js`: etiquette, food, transport, money, ...). Generated content is cached per destination + theme, so popular destinations cost one API call, not one per subscriber.
5. Every email has an unsubscribe link and your mailing address.

## Setup

1. `npm install`
2. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
3. Create a Resend account and verify a sending domain.
4. Copy `.env.example` to `.env.local` and fill it in.
5. `npm run dev` and open http://localhost:3000

## Deploy (Vercel)

Import the repo, add the same environment variables, and set `NEXT_PUBLIC_SITE_URL` to your production URL. Vercel Cron reads `vercel.json` and calls the cron route with `CRON_SECRET` automatically.

Test the cron locally:

```
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily
```

## Before you go public

- Add rate limiting to `/api/subscribe` (e.g. Upstash Ratelimit) and consider a CAPTCHA. A honeypot field is included but is only a first line of defense.
- Set `MAILING_ADDRESS`. CAN-SPAM requires a physical address in every email.
- If you have EU users, add a privacy policy and consent wording (GDPR).
- The cron sends in one batch at 15:00 UTC and handles up to 500 subscribers per run. For more, paginate or send in batches with a queue.
- LLM content can be wrong. Prompts avoid safety/visa/legal claims, and emails carry an "official advisories" footer. Consider spot-checking the `content_cache` table. 
