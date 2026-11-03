-- Shared Screening Admin contact for manual Messenger GC admission.
-- The existing intake settings table already has public SELECT and
-- authorized-recruiter-only UPDATE policies; reuse those security boundaries.
alter table public.asy_recruitment_settings
  add column if not exists screening_admin_url text
  not null default 'https://www.facebook.com/Shallow.Laren/';

alter table public.asy_recruitment_settings
  drop constraint if exists asy_screening_admin_url_valid;

alter table public.asy_recruitment_settings
  add constraint asy_screening_admin_url_valid
  check (
    length(screening_admin_url) between 25 and 500
    and screening_admin_url ~* '^https://((www|m)\.)?(facebook\.com|fb\.com)/[^[:space:]?#]+/?(\?[^[:space:]#]*)?$'
  );

comment on column public.asy_recruitment_settings.screening_admin_url is
  'Shared HTTPS Facebook profile link for manual screening group chat support; staff-editable via existing recruiter RLS policy.';
