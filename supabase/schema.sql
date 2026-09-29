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
