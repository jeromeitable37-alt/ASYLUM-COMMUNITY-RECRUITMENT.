-- Private Referral Google Sheets sync queue. Existing Direct connector is unchanged.
create table if not exists public.asy_referral_sheet_sync(
  application_id uuid primary key references public.asy_clan_applications(id) on delete cascade,
  status text not null default 'pending'
    check(status in('pending','synced','failed','remove_pending','removed','incomplete')),
  attempts integer not null default 0 check(attempts>=0),
  synced_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.asy_referral_sheet_sync enable row level security;
revoke all on table public.asy_referral_sheet_sync from anon,authenticated;
grant all on table public.asy_referral_sheet_sync to service_role;
create index if not exists asy_referral_sheet_sync_status_idx
  on public.asy_referral_sheet_sync(status,updated_at);

create or replace function private.asy_track_referral_sheet_changes()
returns trigger
language plpgsql security definer set search_path=''
as $body$
declare
  needs_sync boolean:=false;
begin
  if tg_op='INSERT' then
    if new.application_type='referral' and new.status<>'rejected' then
      insert into public.asy_referral_sheet_sync(application_id,status)
      values(new.id,'pending')
      on conflict(application_id) do nothing;
    end if;
    return new;
  end if;

  -- A Referral converted to Direct must remove ONLY its website-owned
  -- Referral tracking-code row. Original Form rows have no tracking key.
  if old.application_type='referral' and new.application_type<>'referral' then
    update public.asy_referral_sheet_sync
      set status='remove_pending',updated_at=now(),last_error=null
    where application_id=new.id and status<>'removed';
    -- Existing Direct on-insert trigger does not run on a route edit.
    if new.application_type='casual' and new.status<>'rejected' then
      insert into public.asy_casual_sheet_sync(application_id,status)
      values(new.id,'pending')
      on conflict(application_id) do update
        set status='pending',updated_at=now(),last_error=null;
    end if;
    return new;
  end if;

  if new.application_type<>'referral' then return new; end if;

  if new.status='rejected' and old.status is distinct from 'rejected' then
    insert into public.asy_referral_sheet_sync(application_id,status)
    values(new.id,'remove_pending')
    on conflict(application_id) do update
      set status='remove_pending',updated_at=now(),last_error=null;
    return new;
  end if;
  if new.status='rejected' then return new; end if;

  needs_sync:=
    old.application_type is distinct from new.application_type or
    old.applicant_facebook_name is distinct from new.applicant_facebook_name or
    old.applicant_birthdate is distinct from new.applicant_birthdate or
    old.applicant_clan_name is distinct from new.applicant_clan_name or
    old.applicant_facebook_url is distinct from new.applicant_facebook_url or
    old.applicant_tiktok_url is distinct from new.applicant_tiktok_url or
    old.ign is distinct from new.ign or
    old.codm_uid is distinct from new.codm_uid or
    old.streamer_mode_id is distinct from new.streamer_mode_id or
    old.discord_username is distinct from new.discord_username or
    old.referrer_name is distinct from new.referrer_name or
    old.referrer_facebook_url is distinct from new.referrer_facebook_url;

  if needs_sync then
    insert into public.asy_referral_sheet_sync(application_id,status)
    values(new.id,'pending')
    on conflict(application_id) do update
      set status='pending',updated_at=now(),last_error=null;
  end if;
  return new;
end;
$body$;

drop trigger if exists asy_track_referral_sheet_changes on public.asy_clan_applications;
create trigger asy_track_referral_sheet_changes
after insert or update of
  status,application_type,applicant_facebook_name,applicant_birthdate,
  applicant_clan_name,applicant_facebook_url,applicant_tiktok_url,
  ign,codm_uid,streamer_mode_id,discord_username,referrer_name,
  referrer_facebook_url
on public.asy_clan_applications
for each row execute function private.asy_track_referral_sheet_changes();

-- Seed only non-rejected existing website Referral applications.
-- Missing form data stays pending, never backfilled with fake DOB/names.
insert into public.asy_referral_sheet_sync(application_id,status)
select id,'pending'
from public.asy_clan_applications
where application_type='referral' and status<>'rejected' and workflow_enabled
on conflict(application_id) do nothing;
