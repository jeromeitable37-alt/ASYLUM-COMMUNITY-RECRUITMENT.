-- Separate MP and BR Legendary Series counts; preserve legacy total for prior applicants.
-- Existing applications have NULL in both new fields until verified by a recruiter.
alter table public.asy_clan_applications
  add column if not exists legendary_series_mp integer,
  add column if not exists legendary_series_br integer;

alter table public.asy_clan_applications
  drop constraint if exists asy_legendary_series_modes_valid;

alter table public.asy_clan_applications
  add constraint asy_legendary_series_modes_valid check (
    (legendary_series_mp is null and legendary_series_br is null)
    or (
      legendary_series_mp is not null and legendary_series_br is not null
      and legendary_series_mp between 0 and 100
      and legendary_series_br between 0 and 100
      and (legendary_series_mp + legendary_series_br) between 6 and 100
    )
  );

create or replace function private.asy_sync_legendary_series_total()
returns trigger language plpgsql set search_path = ''
as $function$
begin
  -- Keep previous applications with a single legacy total unchanged.
  if new.legendary_series_mp is null and new.legendary_series_br is null then
    return new;
  end if;
  if new.legendary_series_mp is null or new.legendary_series_br is null then
    raise exception 'Enter both MP and BR Legendary Series counts. Use 0 for none.';
  end if;
  if new.legendary_series_mp < 0 or new.legendary_series_br < 0
     or new.legendary_series_mp > 100 or new.legendary_series_br > 100
     or new.legendary_series_mp + new.legendary_series_br > 100 then
    raise exception 'Legendary Series counts must be between 0 and 100 in total.';
  end if;
  new.legendary_series_count := new.legendary_series_mp + new.legendary_series_br;
  return new;
end;
$function$;

revoke all on function private.asy_sync_legendary_series_total() from public, anon, authenticated;
drop trigger if exists asy_sync_legendary_series_total on public.asy_clan_applications;
create trigger asy_sync_legendary_series_total
before insert or update of legendary_series_mp, legendary_series_br
on public.asy_clan_applications
for each row execute function private.asy_sync_legendary_series_total();

comment on column public.asy_clan_applications.legendary_series_mp is
  'Number of Legendary Series achieved in Multiplayer; NULL means not recorded separately.';
comment on column public.asy_clan_applications.legendary_series_br is
  'Number of Legendary Series achieved in Battle Royale; NULL means not recorded separately.';
