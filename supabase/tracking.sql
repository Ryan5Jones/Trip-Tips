-- Email open/click tracking. Run once in Supabase: SQL Editor -> New query -> paste -> Run.

-- One row per daily tip email sent (written by app/api/cron/daily/route.js)
create table if not exists email_sends (
  id bigint generated always as identity primary key,
  resend_email_id text unique not null,
  subscriber_email text not null,
  destination text,
  tip_number int,          -- 1 = first tip after confirming, 2 = second, ...
  days_left int,           -- the "X days to go" number in the email
  sent_at timestamptz not null default now()
);

-- One row per delivered/opened/clicked/bounced event (written by app/api/resend-webhook/route.js)
create table if not exists email_events (
  id bigint generated always as identity primary key,
  svix_id text unique,
  resend_email_id text not null,
  event_type text not null,
  recipient text,
  link text,
  occurred_at timestamptz not null default now()
);

create index if not exists email_events_email_id_idx on email_events (resend_email_id);
create index if not exists email_sends_subscriber_idx on email_sends (subscriber_email);

alter table email_sends enable row level security;
alter table email_events enable row level security;
-- No policies: only the service role key (server-side) can access these tables.

-- REPORT: drop-off by tip number  ->  select * from tip_dropoff;
create or replace view tip_dropoff with (security_invoker = true) as
with per_email as (
  select s.tip_number,
    exists (select 1 from email_events e where e.resend_email_id = s.resend_email_id and e.event_type in ('opened','clicked')) as opened,
    exists (select 1 from email_events e where e.resend_email_id = s.resend_email_id and e.event_type = 'clicked') as clicked
  from email_sends s
)
select tip_number,
  count(*) as sent,
  count(*) filter (where opened) as opened,
  count(*) filter (where clicked) as clicked,
  round(100.0 * count(*) filter (where opened) / count(*), 1) as open_rate_pct
from per_email group by tip_number order by tip_number;

-- REPORT: open rate by "days to go"  ->  select * from days_left_dropoff;
create or replace view days_left_dropoff with (security_invoker = true) as
with per_email as (
  select s.days_left,
    exists (select 1 from email_events e where e.resend_email_id = s.resend_email_id and e.event_type in ('opened','clicked')) as opened
  from email_sends s
)
select days_left,
  count(*) as sent,
  count(*) filter (where opened) as opened,
  round(100.0 * count(*) filter (where opened) / count(*), 1) as open_rate_pct
from per_email group by days_left order by days_left desc;

-- REPORT: each subscriber's engagement  ->  select * from subscriber_engagement order by last_opened_at nulls first;
create or replace view subscriber_engagement with (security_invoker = true) as
select s.subscriber_email,
  count(distinct s.resend_email_id) as tips_sent,
  count(distinct e.resend_email_id) filter (where e.event_type in ('opened','clicked')) as tips_opened,
  max(s.tip_number) as latest_tip,
  max(e.occurred_at) filter (where e.event_type in ('opened','clicked')) as last_opened_at
from email_sends s
left join email_events e on e.resend_email_id = s.resend_email_id
group by s.subscriber_email;
