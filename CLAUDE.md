# Destinations Daily: project context

Read this first. It records how everything is set up and what the owner (Ryan) prefers, so any future
session (or person) can pick up where we left off. Last updated: 2026-09-29.

## About the owner
- Ryan is not a developer. Explain things in plain, step-by-step language ("dumbed down"), with exact
  button names and where to click. Avoid jargon or define it.
- Ask before changing live data or settings in Supabase/Vercel, and before posting anything publicly.
  Ryan does not want to handle code; commit and push changes for him when he asks for a feature.
- Never ask Ryan to paste secret keys into chat. Keys go straight from the provider into Vercel.

## What the product is
- **destinationsdaily.com**: people enter their email, destination and travel dates, confirm by email,
  then get one travel tip + fun fact per day until they leave. There's a "Share this trip" feature for
  friends/groups (link pre-fills the signup form; only destination + dates are shared, never email/token).
- **X (Twitter) account** (display name "Destinations Daily", X Premium, blue check): automated tweets.

## Services and where things live
| Service | Used for | Notes |
|---|---|---|
| GoDaddy | Owns the domain + DNS | Some records (SPF, Google MX, Google verification) are hidden "Domain Connect" records managed by GoDaddy. Don't add a second SPF record. |
| GitHub | Code: `Ryan5Jones/trip-tips` (branch `main`) | Pushing to `main` auto-deploys. |
| Vercel | Hosts the live site + scheduled jobs | Live project is **trip-tips-k9df** (team "trip-tips"). An older project **trip-tips** is unused; Ryan may delete it. |
| Supabase | Database | Project id `tqdxosdobidzucxmhsxl`. |
| Resend | Sends the emails | Open/click tracking on, tracking subdomain `email.destinationsdaily.com`. Webhook -> `/api/resend-webhook`. |
| Anthropic API | Writes tips, facts and tweets | Model from `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`). |
| X API | Posting tweets | Pay-per-use, prepaid credits ($10 loaded 2026-09-29, auto-recharge off). |
| Pixabay | Tweet photos | `PIXABAY_API_KEY`. Pexels also supported (`PEXELS_API_KEY`) but Pexels key issuance was paused. |
| Google Workspace | Company email (Gmail) on destinationsdaily.com | Aliases like support@ can be added in Admin console. |

## Environment variables (in Vercel, project trip-tips-k9df), names only
`NEXT_PUBLIC_SITE_URL` (must include `https://`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY`, `EMAIL_FROM`, `MAILING_ADDRESS`, `RESEND_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`,
`CRON_SECRET`, `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, `PIXABAY_API_KEY`.

## Scheduled jobs (vercel.json, times in UTC)
- `/api/cron/daily` 15:00: daily tip emails
- `/api/cron/tweet` 16:00 (~9 AM Pacific, "morning") and 01:00 (~6 PM Pacific, "evening")
- `/api/cron/social` 18:00, 22:00, 03:00: mention replies + quote tweets
- `/api/cron/stats` 14:00 (~7 AM Pacific): saves views (impressions), likes, reposts, replies, quotes,
  bookmarks and profile clicks for posts from the last 14 days into `tweets` / `social_posts`.
  X reports impressions (times shown), not unique viewers.
Manual test: Vercel -> trip-tips-k9df -> Settings -> Cron Jobs -> Run.

## On/off switches (Supabase table `social_state`, keys `setting:*`)
Change these with SQL; no redeploy needed. Env vars of the same meaning are fallbacks only.
| Key | Current | Meaning |
|---|---|---|
| `setting:tweets_enabled` | true | Daily morning + evening tweets post for real |
| `setting:social_mode` | "preview" | Mention replies + quote tweets: "preview" = drafts only (table `social_posts`), "auto" = post |
| `setting:quotes_per_day` | 3 | Max quote tweets per day (also max 1 per account per day) |
| `setting:x_monthly_budget` | 5 | USD/month cap on estimated X API spend |
| `setting:long_tweets` | false | Keep OFF: Ryan does not want posts long enough to trigger "Show more" |
Estimated spend per month is tracked in `social_state` key `spend:YYYY-MM`.

## Tweet style (Ryan's preferences)
- Snappy, with a hook first, light humor, one emoji, and exactly one hashtag: the destination's name
  (e.g. #NewOrleans, #Tokyo) on daily tweets and quote tweets. Hashtags barely affect reach on X now; never use 3+. Humor is about the traveler's experience, never mocking a place,
  its people or culture.
- Always a "link in bio" nudge (vary the wording). No links in tweets (links cost $0.20 per post vs $0.015).
- Short enough to never show "Show more" (under ~280 characters including the photo credit line).
- Daily tweets attach a destination photo with a credit line like "📷 name / Pixabay".
- Destinations rotate through a list of 41 in `lib/tweets.js`; morning and evening use different places.

## Key database tables
`subscribers`, `content_cache` (tips/facts per destination+theme), `email_sends` + `email_events`
(open/click tracking; reports: views `tip_dropoff`, `days_left_dropoff`, `subscriber_engagement`),
`tweets` (one row per date+slot, status preview/posted/failed), `watched_accounts` (quote-tweet sources:
lonelyplanet, CNTraveler, TravelLeisure, NatGeoTravel), `social_posts` (reply/quote drafts + posts),
`social_state` (switches, spend, cursors).

## Code map
- `lib/email.js`, `lib/content.js`: emails and tip/fact generation
- `lib/tweets.js`: daily tweet topic + writer (backup: builds a tweet from `getContent`)
- `lib/social.js`: reply and quote-tweet writers
- `lib/twitter.js`: X API (OAuth 1.0a signing, posting, media upload, reads)
- `lib/photos.js`: Pexels/Pixabay photo lookup
- `lib/budget.js`, `lib/settings.js`: spend guard and Supabase switches
- Project is JavaScript (no TypeScript). Don't add `.ts` files; the build will fail.

## Lessons learned / gotchas
- The AI model "thinks" before answering: keep `max_tokens` generous (2000+) or it returns no text.
- X API 401 = wrong/mismatched keys. Use Consumer Keys (API Key/Secret) + Access Token/Secret with
  Read and Write, not OAuth 2.0 Client ID/Secret or Bearer Token. Redeploy after changing env vars.
- X API only allows automated replies when the author @mentions or quotes us (since Feb 2026).
- Emails landed in spam at first on the new Google Workspace inbox; DKIM for Google was suggested.
- `NEXT_PUBLIC_SITE_URL` without `https://` broke the confirm redirect (500) and email links.

## Open items / ideas
- Replies and quote tweets are in preview; Ryan to review drafts before switching `social_mode` to "auto".
- Consider marking the X_* env vars as Sensitive in Vercel.
- Google Workspace: finish DKIM and add aliases (support@, etc.).
- **Instagram automation (to do):** 1 photo post/day with a snappy, funny caption (tip + fun fact, hook
  first, "link in bio", 3-5 hashtags), stats saved to Supabase, preview mode first. Instagram's API is free;
  only cost is the AI caption (~1-2 cents/post). No quote/comment on other accounts (API doesn't allow it).
  Ryan's setup steps: (1) switch Instagram to a Professional account, (2) create a Meta developer app and
  connect Instagram ("Instagram API with Instagram Login", permission instagram_business_content_publish),
  (3) add the access token to Vercel. Build auto-refresh for the 60-day token. Images must be JPEG at a public
  URL, so serve Pixabay photos through our own domain (Pixabay doesn't allow hotlinking). Ask Ryan for his
  Instagram handle.
