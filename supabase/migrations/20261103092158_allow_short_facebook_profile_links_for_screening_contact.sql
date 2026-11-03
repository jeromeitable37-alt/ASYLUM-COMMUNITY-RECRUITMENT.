-- Support valid shorter fb.com profile links as well as facebook.com links.
-- Keep the shared admin contact strictly HTTPS and under Facebook domains.
alter table public.asy_recruitment_settings
  drop constraint if exists asy_screening_admin_url_valid;
alter table public.asy_recruitment_settings
  add constraint asy_screening_admin_url_valid
  check (
    length(screening_admin_url) between 16 and 500
    and screening_admin_url ~* '^https://((www|m)\.)?(facebook\.com|fb\.com)/[^[:space:]?#]+/?(\?[^[:space:]#]*)?$'
  );
