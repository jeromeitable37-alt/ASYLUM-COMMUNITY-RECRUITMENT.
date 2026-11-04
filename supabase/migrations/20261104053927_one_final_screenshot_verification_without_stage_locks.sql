-- One recruiter approval for the full collection of screenshot proofs.
-- Applications are never accepted automatically. The later MGC check remains.
create or replace function private.seed_recruitment_evidence()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_complete boolean := new.status = 'accepted';
begin
  insert into public.asy_recruitment_evidence
    (application_id, requirement_key, requirement_label, stage_number, status)
  values
    (new.id, 'codm_tag_screenshot',
      'Screenshot of main CODM account with ASY tag after IGN',1,
      case when v_complete then 'approved' else 'not_submitted' end),
    (new.id, 'tiktok_tag_screenshot',
      'Screenshot of TikTok account with ASY tag after IGN',2,
      case when v_complete then 'approved' else 'not_submitted' end),
    (new.id, 'tiktok_follow_screenshot',
      'Screenshot confirming follow of official ASY Community TikTok',2,
      case when v_complete then 'approved' else 'not_submitted' end),
    (new.id, 'discord_nickname_screenshot',
      'Proof of Discord server nickname in the format IGN ASY',2,
      case when v_complete then 'approved' else 'not_submitted' end),
    (new.id, 'roster_photo',
      'Roster photo for welcome banner (include Facebook name in caption when submitting)',2,
      case when v_complete then 'approved' else 'not_submitted' end)
  on conflict (application_id, requirement_key) do nothing;

  if new.application_type = 'referral' then
    insert into public.asy_recruitment_evidence
      (application_id,requirement_key,requirement_label,stage_number,status)
    values
      (new.id,'referral_conversation_screenshot',
       'Screenshot of conversation with the member who referred you',2,
       case when v_complete then 'approved' else 'not_submitted' end),
      (new.id,'membership_form_screenshot',
       'Screenshot of completed Referral Membership Form showing IGN',2,
       case when v_complete then 'approved' else 'not_submitted' end)
    on conflict (application_id,requirement_key) do nothing;
  end if;
  if v_complete then
    update public.asy_clan_applications
    set workflow_step='complete'
    where id=new.id and workflow_step<>'complete';
  end if;
  return new;
end;
$$;

-- Changing Direct <-> Referral should not re-introduce Stage 2 locks.
create or replace function private.asy_sync_application_route_evidence()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.application_type is not distinct from old.application_type then return new; end if;
  if new.application_type='referral' then
    insert into public.asy_recruitment_evidence
      (application_id,requirement_key,requirement_label,stage_number,status,is_required)
    values
      (new.id,'referral_conversation_screenshot',
       'Screenshot of conversation with the referring member',2,'not_submitted',true),
      (new.id,'membership_form_screenshot',
       'Screenshot of completed Referral Membership Form showing IGN',2,'not_submitted',true)
    on conflict(application_id,requirement_key) do update
      set is_required=true,updated_at=now();
    update public.asy_recruitment_evidence
    set status='not_submitted',updated_at=now()
    where application_id=new.id and stage_number=2 and status='locked';
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
end;
$$;

-- Existing applicants may upload any required screenshot without advancing
-- through staged approvals. Keep recruiter-only correction/approval protection.
create or replace function private.guard_recruitment_evidence_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_jwt_role text;
  v_email text;
begin
  v_jwt_role := (select auth.jwt() ->> 'role');
  v_email := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  if (new.status is distinct from old.status or
      new.reviewer_notes is distinct from old.reviewer_notes)
     and v_jwt_role <> 'service_role'
     and not exists (select 1 from public.asy_recruitment_admins a where lower(a.email)=v_email) then
    raise exception 'Only authorized recruiters can review submitted requirements.';
  end if;
  new.updated_at:=now();
  if new.status in ('approved','needs_correction') and new.reviewed_at is null then
    new.reviewed_at:=now();
  end if;
  return new;
end;
$$;

-- Preserve already-uploaded evidence and unlock only active, nonfinal apps.
update public.asy_recruitment_evidence as e
set status='not_submitted',updated_at=now()
from public.asy_clan_applications as a
where a.id=e.application_id
  and a.workflow_enabled=true
  and a.status not in ('accepted','rejected','waitlisted')
  and a.workflow_step in ('eligibility_review','tag_proofs','membership_proofs','discord_roster')
  and e.status='locked';

-- Single atomic final approval of all uploaded required proofs.
-- No approval is possible when a required file is missing or needs correction.
create or replace function public.asy_verify_all_screening_proofs(p_application_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor_email text;
  v_app public.asy_clan_applications%rowtype;
  v_step text;
begin
  if auth.uid() is null then
    raise exception 'Recruiter authentication required.';
  end if;
  select lower(u.email) into v_actor_email
  from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
  if v_actor_email is null or not exists (
    select 1 from public.asy_recruitment_admins s where lower(s.email)=v_actor_email
  ) then
    raise exception 'Only an authorized recruiter may verify screenshots.';
  end if;
  select * into v_app from public.asy_clan_applications
  where id=p_application_id for update;
  if not found or v_app.workflow_enabled is distinct from true
    or v_app.status in ('accepted','rejected','waitlisted')
    or v_app.workflow_step not in ('eligibility_review','tag_proofs','membership_proofs','discord_roster') then
    raise exception 'This application is not open for screenshot verification.';
  end if;
  if v_app.age_verification_status is distinct from 'verified'
    or v_app.application_details_verified is distinct from true then
    raise exception 'Verify applicant age and details before final screenshot approval.';
  end if;
  if not exists (
    select 1 from public.asy_recruitment_evidence e
    where e.application_id=p_application_id and e.is_required
  ) then
    raise exception 'Required screening evidence was not initialized.';
  end if;
  if exists (
    select 1 from public.asy_recruitment_evidence e
    where e.application_id=p_application_id and e.is_required
      and (e.status not in ('pending','approved')
        or nullif(btrim(e.storage_path),'') is null
        or e.submitted_at is null)
  ) then
    raise exception 'Upload every required screenshot and correct flagged proofs before verification.';
  end if;

  if v_app.workflow_step='eligibility_review' then
    update public.asy_clan_applications
    set workflow_step='tag_proofs',updated_at=now()
    where id=p_application_id;
  end if;

  update public.asy_recruitment_evidence
  set status='approved',reviewed_by_email=v_actor_email,
      reviewed_at=now(),updated_at=now()
  where application_id=p_application_id and stage_number=1
    and is_required and status='pending';

  select workflow_step into v_step from public.asy_clan_applications
  where id=p_application_id;
  if v_step='tag_proofs' and not exists (
    select 1 from public.asy_recruitment_evidence
    where application_id=p_application_id and stage_number=1
      and is_required and status<>'approved'
  ) then
    update public.asy_clan_applications set workflow_step='membership_proofs',updated_at=now()
    where id=p_application_id;
  end if;

  update public.asy_recruitment_evidence
  set status='approved',reviewed_by_email=v_actor_email,
      reviewed_at=now(),updated_at=now()
  where application_id=p_application_id and stage_number=2
    and is_required and status='pending';

  select workflow_step into v_step from public.asy_clan_applications
  where id=p_application_id;
  if v_step in ('membership_proofs','discord_roster') and not exists (
    select 1 from public.asy_recruitment_evidence
    where application_id=p_application_id and stage_number=2
      and is_required and status<>'approved'
  ) then
    update public.asy_clan_applications set workflow_step='final_review',updated_at=now()
    where id=p_application_id;
  end if;

  select workflow_step into v_step from public.asy_clan_applications
  where id=p_application_id;
  if v_step<>'final_review' then
    raise exception 'Screenshot approval could not safely reach final review.';
  end if;
  return v_step;
end;
$$;
revoke all on function public.asy_verify_all_screening_proofs(uuid) from public;
revoke all on function public.asy_verify_all_screening_proofs(uuid) from anon;
grant execute on function public.asy_verify_all_screening_proofs(uuid) to authenticated;
