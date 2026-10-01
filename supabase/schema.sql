create table subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  destination text not null,
  start_date date not null,
  end_date date,
  token uuid not null unique default gen_random_uuid(), -- used for confirm + unsubscribe links
  confirmed boolean not null default false,
  unsubscribed boolean not null default false,
  emails_sent int not null default 0,
  last_sent_on date,
  created_at timestamptz not null default now(),
  unique (email, destination, start_date)
);

-- Shared content so 50 people going to Lisbon cost one generation, not 50
create table content_cache (
  destination_key text not null,
  theme_index int not null,
  tip text not null,
  fact text not null,
  primary key (destination_key, theme_index)
);

alter table subscribers enable row level security;
alter table content_cache enable row level security;
-- No policies: only the service role key (server-side) can access these tables.

-- Friends leaderboard (added 2026-09-30)
alter table subscribers add column if not exists share_code text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
alter table subscribers add column if not exists group_code text;
create unique index if not exists subscribers_share_code_key on subscribers (share_code);
create index if not exists subscribers_group_code_idx on subscribers (group_code);
alter table practice_progress add column if not exists points int not null default 0;

-- Replies shape each subscriber's tips (added 2026-09-30)
alter table subscribers add column if not exists preferences jsonb not null default '{}'::jsonb;
create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references subscribers(id) on delete cascade,
  resend_email_id text unique,
  received_at timestamptz not null default now(),
  subject text,
  body text,
  extracted jsonb,
  processed boolean not null default false
);
create index if not exists replies_subscriber_idx on replies (subscriber_id, received_at desc);
alter table replies enable row level security;
create table if not exists personal_content_cache (
  destination_key text not null,
  theme_index int not null,
  profile_sig text not null,
  tip text not null,
  fact text not null,
  primary key (destination_key, theme_index, profile_sig)
);
alter table personal_content_cache enable row level security;

-- Food to try (added 2026-09-30)
create table if not exists food_cache (
  destination_key text primary key,
  cuisine text,
  items jsonb not null,
  created_at timestamptz not null default now()
);
alter table food_cache enable row level security;
create table if not exists food_tried (
  subscriber_id uuid not null references subscribers(id) on delete cascade,
  dish_key text not null,
  tried_at timestamptz not null default now(),
  primary key (subscriber_id, dish_key)
);
alter table food_tried enable row level security;

-- Best-rated place per dish, from Google Places (added 2026-09-30)
create table if not exists food_places (
  destination_key text not null,
  dish_key text not null,
  status text not null default 'ok',
  place_id text,
  name text,
  rating numeric,
  review_count int,
  maps_uri text,
  fetched_at timestamptz not null default now(),
  primary key (destination_key, dish_key)
);
alter table food_places enable row level security;
