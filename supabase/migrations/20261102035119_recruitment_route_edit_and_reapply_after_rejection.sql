-- Allow a new application after rejection without deleting the previous record.
-- A partial unique index protects against duplicate simultaneously-active applications.
create unique index if not exists asy_one_active_application_per_email
on public.asy_clan_applications (lower(btrim(contact_email)))
where status <> 'rejected';

create or replace function private.enforce_one_application_per_email()
returns trigger language plpgsql set search_path to '' as $$
declare normalized_email text;
begin
  normalized_email := lower(btrim(coalesce(new.contact_email,'')));
  if normalized_email = '' then
    raise exception 'A valid contact email is required.' using errcode='23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(normalized_email,917203));
  if new.status <> 'rejected' and exists(
    select 1 from public.asy_clan_applications a
    where lower(btrim(a.contact_email))=normalized_email
      and a.status <> 'rejected'
      and (tg_op='INSERT' or a.id<>new.id)
  ) then
    raise exception 'There is already an active application for this email. Submit again only when that application is rejected.'
      using errcode='23505', constraint='one_active_recruitment_application_per_email';
  end if;
  new.contact_email := normalized_email;
  return new;
end; $$;

drop trigger if exists enforce_one_application_per_email on public.asy_clan_applications;
create trigger enforce_one_application_per_email
before insert or update of contact_email,status on public.asy_clan_applications
for each row execute function private.enforce_one_application_per_email();

-- Only an authorized staff member may change the route; preserve application ID/code.
create or replace function private.asy_guard_application_route_change()
returns trigger language plpgsql security definer set search_path to '' as $$
declare actor_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
  if new.application_type is not distinct from old.application_type then return new; end if;
  if coalesce(auth.jwt()->>'role','') <> 'service_role'
     and not exists(select 1 from public.asy_recruitment_admins a
       where lower(a.email)=actor_email) then
    raise exception 'Only authorized recruitment staff can change application type.';
  end if;
  if old.status in ('rejected','accepted') or old.workflow_step not in
       ('eligibility_review','tag_proofs','membership_proofs','discord_roster') then
    raise exception 'Application type may only be changed during early or evidence review, before final review or a final decision.';
  end if;
  if new.application_type = 'referral' then
    if nullif(btrim(new.referrer_name),'') is null or
       nullif(btrim(new.referrer_facebook_url),'') is null then
      raise exception 'A referring member name and Facebook link are required for Referral Application.';
    end if;
    if new.referrer_facebook_url !~* '^https?://([[:alnum:]-]+\.)*(facebook\.com|fb\.com)(/|[?#]|$)' then
      raise exception 'Enter a valid referrer Facebook profile link.';
    end if;
  elsif new.application_type='casual' then
    new.referrer_name := null;
    new.referrer_facebook_url := null;
  else
    raise exception 'Choose Direct or Referral Application.';
  end if;
  -- Changing route also invalidates previous eligibility and final management checks.
  new.application_details_verified:=false;
  new.application_details_verified_by_email:=null;
  new.application_details_verified_at:=null;
  new.membership_form_response_verified:=false;
  new.membership_form_response_verified_by_email:=null;
  new.membership_form_response_verified_at:=null;
  new.mgc_verification_status:='not_checked';
  new.mgc_applicant_contacted:=false;
  new.mgc_checked_by_email:=null;
  new.mgc_checked_at:=null;
  new.mgc_verification_notes:=null;
  new.updated_at:=now();
  return new;
end; $$;
revoke all on function private.asy_guard_application_route_change() from public,anon,authenticated;
drop trigger if exists asy_guard_application_route_change on public.asy_clan_applications;
create trigger asy_guard_application_route_change
before update of application_type on public.asy_clan_applications
for each row execute function private.asy_guard_application_route_change();

-- Keep uploaded files as history. Only add/disable referral-specific required proofs.
create or replace function private.asy_sync_application_route_evidence()
returns trigger language plpgsql security definer set search_path to '' as $$
declare initial_status text;
begin
  if new.application_type is not distinct from old.application_type then return new; end if;
  if new.application_type='referral' then
    initial_status:=case when new.workflow_step='eligibility_review'
      then 'locked' else 'not_submitted' end;
    insert into public.asy_recruitment_evidence
      (application_id,requirement_key,requirement_label,stage_number,status,is_required)
    values
      (new.id,'referral_conversation_screenshot',
       'Screenshot of conversation with the referring member',2,initial_status,true),
      (new.id,'membership_form_screenshot',
       'Screenshot of completed Referral Membership Form showing IGN',2,initial_status,true)
    on conflict(application_id,requirement_key) do update
      set is_required=true,updated_at=now();
    if new.workflow_step in ('tag_proofs','membership_proofs','discord_roster') then
      update public.asy_recruitment_evidence set status='not_submitted',updated_at=now()
      where application_id=new.id and stage_number=2 and status='locked';
    end if;
  else
    update public.asy_recruitment_evidence set is_required=false,updated_at=now()
    where application_id=new.id and requirement_key in
      ('referral_conversation_screenshot','membership_form_screenshot');
  end if;
  insert into public.asy_recruitment_audit_logs
    (actor_email,action,entity_type,entity_id,summary)
  values
    (coalesce(nullif(auth.jwt()->>'email',''),'staff'),
     'application.route_changed','application',new.id::text,
     'Application type changed from '||old.application_type||' to '||new.application_type||'.');
  return new;
end; $$;
revoke all on function private.asy_sync_application_route_evidence() from public,anon,authenticated;
drop trigger if exists asy_sync_application_route_evidence on public.asy_clan_applications;
create trigger asy_sync_application_route_evidence
after update of application_type on public.asy_clan_applications
for each row execute function private.asy_sync_application_route_evidence();

-- Rejections free an active intake slot; old rejected records stay archived.
create or replace function private.asy_sync_recruitment_active_count()
returns trigger language plpgsql security definer set search_path to '' as $$
declare current_cycle timestamptz;
begin
  if old.status is not distinct from new.status then return new; end if;
  select cycle_started_at into current_cycle
    from public.asy_recruitment_settings where id=1 for update;
  if new.submitted_at < current_cycle then return new; end if;
  if old.status <> 'rejected' and new.status='rejected' then
    update public.asy_recruitment_settings set
      application_count=greatest(0,application_count-1),updated_at=now() where id=1;
  elsif old.status='rejected' and new.status <> 'rejected' then
    update public.asy_recruitment_settings set
      application_count=application_count+1,updated_at=now() where id=1;
  end if;
  return new;
end; $$;
revoke all on function private.asy_sync_recruitment_active_count() from public,anon,authenticated;
drop trigger if exists asy_sync_recruitment_active_count on public.asy_clan_applications;
create trigger asy_sync_recruitment_active_count
after update of status on public.asy_clan_applications
for each row execute function private.asy_sync_recruitment_active_count();

-- Correct the previous count that included rejected applications.
update public.asy_recruitment_settings s
set application_count = (
  select count(*)::integer from public.asy_clan_applications a
  where a.submitted_at >= s.cycle_started_at and a.status <> 'rejected'
), updated_at=now() where s.id=1;

-- Backfill legacy rejected rows missing archive timestamp without deleting history.
update public.asy_clan_applications
set archived_at=coalesce(archived_at,updated_at,now())
where status='rejected' and archived_at is null;