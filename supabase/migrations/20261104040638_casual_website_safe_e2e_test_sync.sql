-- Keep the production queue pending while recording privacy-safe website-to-Sheets tests.
-- Only the Edge Function service-role can inspect/update this queue (existing RLS).
alter table public.asy_casual_sheet_sync
  add column if not exists test_synced_at timestamptz,
  add column if not exists test_last_attempt_at timestamptz,
  add column if not exists test_sheet_row integer,
  add column if not exists test_attempts integer not null default 0,
  add column if not exists test_last_error text;
alter table public.asy_casual_sheet_sync
  drop constraint if exists asy_casual_sheet_test_row_valid;
alter table public.asy_casual_sheet_sync
  add constraint asy_casual_sheet_test_row_valid
  check (test_sheet_row is null or test_sheet_row >= 2);
