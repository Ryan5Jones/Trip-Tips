-- One row per tweet slot (morning/evening) per day. Run once in the Supabase SQL editor.
create table if not exists tweets (
  id bigint generated always as identity primary key,
  tweet_date date not null,
  slot text not null default 'morning',     -- 'morning' | 'evening'
  destination text,
  theme text,
  text text not null,
  status text not null default 'preview',  -- 'preview' | 'posted' | 'failed'
  tweet_id text,
  error text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tweet_date, slot)
);
alter table tweets enable row level security;
-- No policies: only the service role key (server-side) can access this table.
