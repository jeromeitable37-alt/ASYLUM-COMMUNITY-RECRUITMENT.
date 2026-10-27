create schema if not exists private;

create table if not exists public.asy_recruitment_settings (
  id integer primary key check (id = 1),
  intake_open boolean not null default true,
  application_limit integer null check (application_limit is null or application_limit >= 1),
  application_count integer not null default 0 check (application_count >= 0),
  cycle_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.asy_recruitment_settings
  (id, intake_open, application_limit, application_count, cycle_started_at, updated_at)
select 1, true, null,
  (select count(*)::integer from public.asy_clan_applications),
  now(), now()
on conflict (id) do nothing;

alter table public.asy_recruitment_settings enable row level security;
grant select on public.asy_recruitment_settings to anon, authenticated;
grant update on public.asy_recruitment_settings to authenticated;

drop policy if exists "Public can read recruitment intake status" on public.asy_recruitment_settings;
create policy "Public can read recruitment intake status"
  on public.asy_recruitment_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Recruiters manage recruitment intake settings" on public.asy_recruitment_settings;
create policy "Recruiters manage recruitment intake settings"
  on public.asy_recruitment_settings
  for update
  to authenticated
  using (
    exists (
      select 1 from public.asy_recruitment_admins a
      where lower(a.email) = lower((select auth.jwt() ->> 'email'))
    )
  )
  with check (
    exists (
      select 1 from public.asy_recruitment_admins a
      where lower(a.email) = lower((select auth.jwt() ->> 'email'))
    )
  );

create or replace function private.guard_asy_recruitment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings record;
begin
  select intake_open, application_limit, application_count
    into v_settings
    from public.asy_recruitment_settings
   where id = 1
   for update;

  if not found then
    raise exception 'Recruitment intake settings are not configured. Please contact management.';
  end if;
  if not v_settings.intake_open then
    raise exception 'Recruitment is temporarily closed. Please check back later.';
  end if;
  if v_settings.application_limit is not null
     and v_settings.application_count >= v_settings.application_limit then
    raise exception 'Recruitment application limit reached. Please check back later.';
  end if;

  update public.asy_recruitment_settings
     set application_count = application_count + 1, updated_at = now()
   where id = 1;
  return new;
end;
$$;

revoke all on function private.guard_asy_recruitment_insert() from public, anon, authenticated;

drop trigger if exists guard_asy_recruitment_insert on public.asy_clan_applications;
create trigger guard_asy_recruitment_insert
  before insert on public.asy_clan_applications
  for each row execute function private.guard_asy_recruitment_insert();
