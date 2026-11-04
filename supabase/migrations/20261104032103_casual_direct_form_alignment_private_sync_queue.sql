-- Casual/Direct website fields aligned with the official SCREENING form.
-- Non-destructive: legacy applications and Referral route retain their data.
alter table public.asy_clan_applications
  add column if not exists applicant_facebook_name text,
  add column if not exists applicant_birthdate date,
  add column if not exists applicant_clan_name text,
  add column if not exists legendary_requirement_confirmed boolean not null default false;

alter table public.asy_clan_applications
  drop constraint if exists asy_casual_member_details_valid;
alter table public.asy_clan_applications
  add constraint asy_casual_member_details_valid check (
    (applicant_facebook_name is null or char_length(applicant_facebook_name) between 2 and 120)
    and (applicant_clan_name is null or char_length(applicant_clan_name) between 2 and 120)
    and (applicant_birthdate is null or applicant_birthdate between date '1900-01-01' and current_date)
  );

alter table public.asy_recruitment_settings
  add column if not exists casual_sheet_live_enabled boolean not null default false;

create table if not exists public.asy_casual_sheet_sync (
  application_id uuid primary key references public.asy_clan_applications(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','synced','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  synced_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.asy_casual_sheet_sync enable row level security;
revoke all on public.asy_casual_sheet_sync from anon, authenticated;
grant all on public.asy_casual_sheet_sync to service_role;
create index if not exists asy_casual_sheet_sync_pending_idx on public.asy_casual_sheet_sync(status, created_at);

create or replace function private.seed_casual_sheet_sync()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.application_type = 'casual' and new.workflow_enabled then
    insert into public.asy_casual_sheet_sync(application_id)
    values (new.id)
    on conflict (application_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists asy_seed_casual_sheet_sync on public.asy_clan_applications;
create trigger asy_seed_casual_sheet_sync
  after insert on public.asy_clan_applications for each row
  execute function private.seed_casual_sheet_sync();

create or replace function private.guard_asy_recruitment_insert()
returns trigger language plpgsql security definer set search_path to ''
as $$
declare v_settings record;
begin
  if new.workflow_enabled then
    if coalesce(new.codm_uid, '') !~ '^[0-9]{19}$' then
      raise exception 'CODM UID must contain exactly 19 digits.';
    end if;
    if new.meets_age_requirement is distinct from true then
      raise exception 'Applicants must confirm that they are at least 16 years old.';
    end if;
    if new.application_type = 'casual' then
      if nullif(btrim(new.applicant_facebook_name), '') is null
         or char_length(btrim(new.applicant_facebook_name)) < 2
         or nullif(btrim(new.applicant_clan_name), '') is null
         or char_length(btrim(new.applicant_clan_name)) < 2
         or new.applicant_birthdate is null
         or new.applicant_birthdate > (current_date - interval '16 years')::date
         or new.applicant_birthdate < date '1900-01-01' then
        raise exception 'Direct Application requires a valid Facebook name, Clan Name and birthdate (age 16+).';
      end if;
      if new.legendary_requirement_confirmed is distinct from true then
        raise exception 'Confirm the minimum six Legendary Series requirement.';
      end if;
    elsif coalesce(new.legendary_series_count,0) < 6 then
      raise exception 'Applicants must have at least 6 Legendary Series in BR or MP.';
    end if;
    if new.facebook_name_appropriate is distinct from true then
      raise exception 'Applicants must confirm their Facebook name is appropriate.';
    end if;
    if new.willing_to_add_asy_tag is distinct from true then
      raise exception 'Applicants must agree to add the ASY tag after their IGN on CODM and TikTok.';
    end if;
    if new.willing_to_submit_roster_photo is distinct from true then
      raise exception 'Applicants must agree to submit the required roster photo.';
    end if;
  end if;
  select intake_open, application_limit, application_count into v_settings
    from public.asy_recruitment_settings where id = 1 for update;
  if not found then raise exception 'Recruitment intake settings are not configured. Please contact management.'; end if;
  if not v_settings.intake_open then raise exception 'Recruitment is temporarily closed. Please check back later.'; end if;
  if v_settings.application_limit is not null and v_settings.application_count >= v_settings.application_limit then
    raise exception 'Recruitment application limit reached. Please check back later.';
  end if;
  update public.asy_recruitment_settings
    set application_count = application_count + 1, updated_at = now() where id = 1;
  return new;
end;
$$;

create or replace function private.reset_casual_details_verification()
returns trigger language plpgsql set search_path to ''
as $$
begin
  if row(new.applicant_facebook_name, new.applicant_birthdate, new.applicant_clan_name, new.legendary_requirement_confirmed)
     is distinct from
     row(old.applicant_facebook_name, old.applicant_birthdate, old.applicant_clan_name, old.legendary_requirement_confirmed) then
    new.application_details_verified := false;
    new.application_details_verified_by_email := null;
    new.application_details_verified_at := null;
    new.membership_form_response_verified := false;
    new.membership_form_response_verified_by_email := null;
    new.membership_form_response_verified_at := null;
    new.mgc_verification_status := 'not_checked';
    new.mgc_applicant_contacted := false;
    new.mgc_checked_by_email := null;
    new.mgc_checked_at := null;
    new.mgc_verification_notes := null;
  end if;
  return new;
end;
$$;
drop trigger if exists asy_reset_casual_details_verification on public.asy_clan_applications;
create trigger asy_reset_casual_details_verification
  before update of applicant_facebook_name, applicant_birthdate, applicant_clan_name, legendary_requirement_confirmed
  on public.asy_clan_applications for each row
  execute function private.reset_casual_details_verification();
