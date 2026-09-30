-- Mention replies + quote tweets. Run once in the Supabase SQL editor.

-- Big travel accounts to watch for quote tweets. Add/remove rows to change the list.
create table if not exists watched_accounts (
  username text primary key,          -- without the @
  enabled boolean not null default true,
  user_id text,                       -- filled in automatically
  followers int,                      -- filled in automatically
  last_seen_id text,                  -- newest tweet already checked
  created_at timestamptz not null default now()
);

-- Every reply/quote drafted or posted
create table if not exists social_posts (
  id bigint generated always as identity primary key,
  kind text not null,                 -- 'reply' | 'quote'
  source_tweet_id text not null,
  source_author text,
  source_text text,
  destination text,
  draft_text text not null,
  status text not null,               -- 'pending' (preview) | 'posting' | 'posted' | 'failed'
  posted_tweet_id text,
  error text,
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  unique (kind, source_tweet_id)
);

-- Small key/value store (e.g. which mention we last replied to)
create table if not exists social_state (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

alter table watched_accounts enable row level security;
alter table social_posts enable row level security;
alter table social_state enable row level security;
