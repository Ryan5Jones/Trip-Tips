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
  The homepage shows a static sample email (`components/SampleEmail.js`); keep it matching the real email style.
- **X (Twitter) account** (display name "Destinations Daily", X Premium, blue check): automated tweets.

## Services and where things live
| Service | Used for | Notes |
|---|---|---|
| GoDaddy | Owns the domain + DNS | Some records (SPF, Google MX, Google verification) are hidden "Domain Connect" records managed by GoDaddy. Don't add a second SPF record. |
| GitHub | Code: `Ryan5Jones/trip-tips` (branch `main`) | Pushing to `main` auto-deploys. |
| Vercel | Hosts the live site + scheduled jobs | Live project is **trip-tips-k9df** (team "trip-tips"). An older project **trip-tips** is unused; Ryan may delete it. |
| Supabase | Database | Project id `tqdxosdobidzucxmhsxl`. |
| Resend | Sends the emails | Open tracking ON, click tracking OFF (never enabled; keep it off to help land in Gmail Primary). Tracking subdomain `email.destinationsdaily.com`. Webhook -> `/api/resend-webhook`. |
| Anthropic API | Writes tips, facts and tweets | Model from `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`). |
| X API | Posting tweets | Pay-per-use, prepaid credits ($10 loaded 2026-09-29, auto-recharge off). |
| Vercel Web Analytics | Unique website visitors, page views, referrers | `<Analytics />` in `app/layout.js` (package `@vercel/analytics`), added 2026-09-30. Needs the Analytics tab "Enable" click in Vercel; counts only from then on. Read via Vercel connector `count_pageviews` / `aggregate_pageviews`. |
| Pixabay | Tweet photos | `PIXABAY_API_KEY`. Pexels also supported (`PEXELS_API_KEY`) but Pexels key issuance was paused. |
| Google Workspace | Company email (Gmail) on destinationsdaily.com | Emails are sent From `tips@destinationsdaily.com` (EMAIL_FROM); `tips@` is an alias of Ryan's Workspace user, so subscriber replies land in his Gmail (set up + tested 2026-09-30). More aliases: Admin console -> Directory -> Users -> Ryan -> Alternate email addresses. |

## Environment variables (in Vercel, project trip-tips-k9df), names only
`NEXT_PUBLIC_SITE_URL` (must include `https://`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` (optional), `MAILING_ADDRESS`, `RESEND_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`,
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
| `setting:email_photos` | (unset = off) | Daily emails include a photo matching the tip or fun fact (`lib/emailPhotos.js`: AI picks subject -> Pixabay search -> AI checks tags match -> copy hosted in Supabase storage bucket `email-photos`; cached in `content_cache.photo_*`). Turn on only if tests still land in Gmail Primary |
| `setting:daily_phrase` | true | Adds "Today's <language> phrase" (phrase, native script if non-Latin, pronunciation, meaning, when to use it) after the fun fact. Mini-course order in `lib/phrases.js` (PHRASE_TOPICS, 30, then repeats); cached in `phrase_cache`; skipped for English-speaking destinations |
| (game) | n/a | **Passport Quest** (phrase game) at `/practice/<subscriber token>` (`app/practice/[token]/page.js`, `components/PracticeGame.js`): arcade-style; audio is OPT-IN only: a small 🔊 button next to a phrase's written pronunciation plays it with the device voice, nothing ever autoplays (Ryan 2026-09-30). The question timer is one timeout plus a CSS-animated bar (no 10x/sec re-renders; Tori reported lag on taps). 3 hearts, countdown per question, speed + combo points, rounds: Warm-up, Match-up, Build it (assemble phrase from tiles), Boss round (double points); rank by phrases unlocked, passport stamp on results, then a spinning globe (`components/LanguageGlobe.js`, d3 + world-atlas loaded from jsdelivr in the browser) that turns to the destination country and fills it in more as phrases unlock (falls back to a flag card if the map can't load or the country is too small for the 110m map, e.g. Malta/Singapore). Saves {score: right answers, total} and streaks in `practice_progress` (POST `/api/practice/complete`). Uses unlocked phrases (max(3, emails_sent)); daily email links to it when a phrase is included |
| (leaderboard) | n/a | **Friends leaderboard** in Passport Quest (`components/Leaderboard.js`, `lib/leaderboard.js`, GET `/api/practice/leaderboard`). Group = people who signed up through a shared-trip link: share links carry `g=<share_code>` (subscribers.share_code is a random public-safe code, NOT the private token); a friend signing up gets `subscribers.group_code = g`; group id = `group_code ?? share_code`. Points are saved per day in `practice_progress.points` (best of the day, capped 3500). Board shows first names ("Traveler" if unknown), points (this week / all time) and streaks only: never emails or tokens. Added 2026-09-30. **Friend code:** the board shows each player's group code (uppercase) with Copy; someone who is alone can paste a friend's code in "Join their group" (POST `/api/practice/join`). People already in a group with others can't switch (no accidental merges). |
| `setting:daily_personal_line` | true | Adds a rotating personal question ("Have you booked anything yet? Hit reply…") to daily emails from tip #2 on |
Estimated spend per month is tracked in `social_state` key `spend:YYYY-MM`.

## Tweet style (Ryan's preferences)
- Tweets are intentionally a little funnier than the emails (Ryan decided 2026-09-30); keep it that way.
- Snappy, with a hook first, light humor, one emoji, and exactly one hashtag: the destination's name
  (e.g. #NewOrleans, #Tokyo) on daily tweets and quote tweets. Hashtags barely affect reach on X now; never use 3+. Humor is about the traveler's experience, never mocking a place,
  its people or culture.
- Always a "link in bio" nudge (vary the wording). No links in tweets (links cost $0.20 per post vs $0.015).
- Short enough to never show "Show more" (under ~280 characters including the photo credit line).
- Daily tweets attach a photo with a credit line like "📷 name / Pixabay": first a photo matched to what the
  tweet is about (`findMatchingPhoto` in `lib/emailPhotos.js`, same destination-specific checks as emails),
  else a general city photo (`lib/photos.js`). Logged as TWEET_PHOTO in Vercel logs.
- Destinations rotate through a list of 41 in `lib/tweets.js`; morning and evening use different places.

## Email style (for Gmail Primary tab)
- Tip/fact voice (`lib/content.js`, since 2026-09-30): friendly, snappy, like a well-traveled friend, at most one
  light touch of humor (never mocking a place/people), no emojis. Matches the homepage sample (Lisbon greetings).
- Emails look like a personal note from Ryan: plain text + minimal HTML, no buttons/colored boxes, links
  written out, signed "Ryan", plain-text version included, rotating conversational subject lines. No
  List-Unsubscribe header (removed 2026-09-30 as a Primary-tab experiment; add back if sending to 5,000+ Gmail
  users/day, which Gmail requires). Visible unsubscribe link always stays (legal requirement).
- Greeting uses the subscriber's first name ("Hey Tori!"): `subscribers.first_name` from the optional signup
  field, else a guess from a clearly "first.last"/"first_last" email (`lib/names.js`), else just "Hey!".
  Never guess from run-together addresses like "johnsboehme"; a wrong name is worse than none.
- Photos in emails were tested 2026-09-30: even a small photo sent a fresh inbox (Tori) to Promotions, so
  `setting:email_photos` stays OFF. Photo matching code is reused for social posts.
- Confirmation email and tip #1 ask the reader to reply and to drag the email to Primary (replies are a
  strong "real contact" signal). Nothing guarantees Primary; Gmail decides per person.

## Test profiles (keep)
- Tori's Lisbon test profile: a `subscribers` row for tori.tyson21@gmail.com, destination "lisbon, portugal",
  start_date 2026-09-30 (already past, so the daily email job skips it: she gets NO daily emails), first_name Tori.
  Ryan wants to keep it for testing Passport Quest and the friends leaderboard (her game link is
  /practice/<her token>). Don't delete it unless Ryan asks. Her real Maui subscription is separate.
- One-off test emails: recreate a temporary token-locked endpoint (settings `setting:diag_token` / `setting:test_email`),
  trigger it with the Vercel connector's web fetch, then delete the endpoint and the two settings.

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
- Email footer address comes from Vercel env `MAILING_ADDRESS`. Set to `tips@destinationsdaily.com` on
  2026-09-30 at Ryan's request (was his personal email). CAN-SPAM requires a physical postal address (street,
  PO box or registered private mailbox); Ryan was told and chose to keep tips@ (not a to-do item; don't remind him).
- Vercel is on the free Hobby plan: each cron runs once a day, anytime within its scheduled hour (e.g. the
  15:00 UTC email job runs 8:00-8:59 AM Pacific). Pro (~$20/mo) gives per-minute precision. Cron requests
  don't always show up in log searches; check Supabase (last_sent_on, tweets, stats_updated_at) to confirm.

## Open items / ideas
- **Replies shape each subscriber's tips (to do):** receive replies at our site
  (e.g. Resend inbound email or Google forwarding to a webhook), save them to Supabase linked to the
  subscriber, have AI extract preferences ("traveling with kids", "foodie", "first time", "budget"), and feed
  those into their future tip/fact generation (per-subscriber content instead of the shared cache for those
  people). Once live, the reply prompt can honestly say "so I can tailor your future tips". Current wording is
  "Hit reply and let me know. It helps me make these tips better." (true today).
- **SMS option at signup (parked until 100 subscribers):** "Email me" or "Text me" choice; daily tip by text
  via Twilio (~1 cent/text, ~$1.15/mo number, ~$2-10/mo + ~$20 one-time A2P 10DLC registration, 1-3 weeks
  approval). Must have: consent checkbox, "Reply YES" confirmation, STOP/HELP, daytime-only sends. The daily
  cron emails Ryan once when active subscribers reach 100 (`lib/milestones.js`, recipient =
  `setting:owner_email`, sent flag = `social_state` key `milestone:100`).
- **Instagram automation (to do):** 1 photo post/day with a snappy, funny caption (tip + fun fact, hook
  first, "link in bio", 3-5 hashtags), stats saved to Supabase, preview mode first. Instagram's API is free;
  only cost is the AI caption (~1-2 cents/post). No quote/comment on other accounts (API doesn't allow it).
  Ryan's setup steps: (1) switch Instagram to a Professional account, (2) create a Meta developer app and
  connect Instagram ("Instagram API with Instagram Login", permission instagram_business_content_publish),
  (3) add the access token to Vercel. Build auto-refresh for the 60-day token. Images must be JPEG at a public
  URL, so serve Pixabay photos through our own domain (Pixabay doesn't allow hotlinking). Ask Ryan for his
  Instagram handle.
- **Facebook Page automation (to do, set up together with Instagram):** daily photo post to a Destinations
  Daily Facebook *Page* (API can't post to personal profiles), with a clickable link to destinationsdaily.com
  (free on Facebook). Stats (reach, reactions, comments, shares) saved to Supabase. Posting is free; only
  the AI caption costs ~1-2 cents/post. Ryan's setup: create a Facebook Page, then use ONE Meta developer app
  for both, via "Instagram API with Facebook Login" (connect the Instagram Professional account to the Page),
  with permissions pages_manage_posts, pages_read_engagement, instagram_basic,
  instagram_business_content_publish. One long-lived Page token covers both.
- **TikTok automation (to do, draft mode):** public auto-posting needs TikTok's Content Posting audit (weeks,
  requires a compliant posting UI), so instead: daily photo carousel (destination photos with the tip + fun
  fact as text overlays, funny caption, hashtags) uploaded to Ryan's TikTok drafts/inbox; Ryan adds a
  trending sound and taps Post (~30 sec). TikTok API is free; only the AI caption costs ~1-2 cents/post.
  Carousel images generated by our site. Ryan's setup: TikTok developer app with Content Posting API
  (upload/draft scope) + verify destinationsdaily.com as the media URL domain. Consider video later.

## Future ideas (saved 2026-09-29, not started)
Our edge: every subscriber tells us their destination AND travel dates, so ideas should use that.
Suggested order: (1) affiliate picks in emails, (2) weather + packing email, (3) price-drop alerts.

Quick wins
- **Affiliate picks in daily emails:** on relevant days, suggest a top tour, an eSIM for the destination,
  or travel insurance, with affiliate links (commission per booking). Fastest path to revenue.
- **Weather + packing email ~1 week before departure:** real forecast for their destination/dates plus a
  tailored packing list.
- **"Happening while you're there":** festivals, concerts and local events during their exact dates.

Deals
- **Price-drop alerts for the subscriber's exact trip** (flights/hotels to their destination on their
  dates). Use official flight/hotel affiliate or data APIs, NOT scraping (Google Flights/Expedia scraping
  breaks their terms, gets blocked, breaks often). Some programs cost money or need approval.

Bigger features
- **AI itinerary builder** tailored to dates/interests (good paid-upgrade candidate).
- **Group trip planner** building on Share-this-trip: shared itinerary, polls, split-costs tracker.
- **Premium tier:** extra tips, audio pronunciation of key phrases, downloadable offline mini-guide.
- **Post-trip follow-up:** "How was it?" collect photos/reviews; feature them (with permission) on socials.

Business
- **Tourism board sponsorships** of destination emails ("brought to you by Visit Portugal").
- **White-label for hotels/travel agents:** send our daily tips to their guests before arrival, for a fee.
