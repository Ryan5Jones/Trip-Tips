-- Tweet performance columns. Run once in the Supabase SQL editor.
alter table tweets add column if not exists impressions int, add column if not exists likes int,
  add column if not exists reposts int, add column if not exists replies int, add column if not exists quotes int,
  add column if not exists bookmarks int, add column if not exists profile_clicks int,
  add column if not exists stats_updated_at timestamptz;
alter table social_posts add column if not exists impressions int, add column if not exists likes int,
  add column if not exists reposts int, add column if not exists replies int, add column if not exists quotes int,
  add column if not exists bookmarks int, add column if not exists profile_clicks int,
  add column if not exists stats_updated_at timestamptz;
