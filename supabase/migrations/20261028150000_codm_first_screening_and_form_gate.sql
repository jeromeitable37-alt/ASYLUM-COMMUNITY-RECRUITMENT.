-- CODM-first recruitment screening: one CODM proof, then all remaining proofs together.
create or replace function private.seed_recruitment_evidence()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  v_status := case when new.status = 'accepted' then 'approved' else 'not_submitted' end;
  insert into public.asy_recruitment_evidence (application_id, requirement_key, requirement_label, stage_number, status)
  values
    (new.id, 'codm_tag_screenshot', 'Screenshot of main CODM account with ASY tag after IGN', 1, v_status),
    (new.id, 'tiktok_tag_screenshot', 'Screenshot of TikTok account with ASY tag after IGN', 2, case when v_status='approved' then 'approved' else 'locked' end),
    (new.id, 'tiktok_follow_screenshot', 'Screenshot confirming follow of official ASY Community TikTok', 2, case when v_status='approved' then 'approved' else 'locked' end),
    (new.id, 'discord_nickname_screenshot', 'Proof of Discord server nickname in the format IGN ASY', 2, case when v_status='approved' then 'approved' else 'locked' end),
    (new.id, 'roster_photo', 'Roster photo for welcome banner (include Facebook name in caption when submitting)', 2, case when v_status='approved' then 'approved' else 'locked' end)
  on conflict (application_id, requirement_key) do nothing;
  if new.application_type = 'referral' then
    insert into public.asy_recruitment_evidence (application_id, requirement_key, requirement_label, stage_number, status)
    values (new.id, 'referral_conversation_screenshot', 'Screenshot of conversation with the member who referred you', 2, case when v_status='approved' then 'approved' else 'locked' end)
    on conflict (application_id, requirement_key) do nothing;
  end if;
  if new.status = 'accepted' then
    update public.asy_clan_applications set workflow_step = 'complete' where id = new.id and workflow_step <> 'complete';
  end if;
  return new;
end;
$$;

create or replace function private.advance_recruitment_workflow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_step integer; v_all_approved boolean;
begin
  if new.status <> 'approved' or old.status = 'approved' then return new; end if;
  v_step := new.stage_number;
  select not exists (
    select 1 from public.asy_recruitment_evidence e
    where e.application_id = new.application_id and e.stage_number = v_step
      and e.is_required and e.status <> 'approved'
  ) into v_all_approved;
  if not v_all_approved then return new; end if;
  if v_step = 1 then
    update public.asy_recruitment_evidence set status = 'not_submitted', updated_at=now()
    where application_id = new.application_id and stage_number = 2 and status = 'locked';
    update public.asy_clan_applications set workflow_step = 'membership_proofs'
    where id = new.application_id and workflow_step = 'tag_proofs';
  elsif v_step = 2 then
    update public.asy_clan_applications set workflow_step = 'final_review'
    where id = new.application_id and workflow_step in ('membership_proofs','discord_roster');
  end if;
  return new;
end;
$$;

create or replace function private.guard_recruitment_workflow_step()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_email text; v_all_approved boolean;
begin
  if new.workflow_step is not distinct from old.workflow_step then return new; end if;
  v_email := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  if old.workflow_step = 'eligibility_review' and new.workflow_step = 'tag_proofs' then
    if not exists (select 1 from public.asy_recruitment_admins a where lower(a.email) = v_email) then
      raise exception 'Only an authorized recruiter can approve eligibility.';
    end if;
    return new;
  end if;
  if old.workflow_step = 'tag_proofs' and new.workflow_step = 'membership_proofs' then
    select not exists (select 1 from public.asy_recruitment_evidence e where e.application_id = new.id and e.stage_number = 1 and e.is_required and e.status <> 'approved') into v_all_approved;
    if not v_all_approved then raise exception 'The CODM screenshot must be approved first.'; end if;
    return new;
  end if;
  if old.workflow_step in ('membership_proofs','discord_roster') and new.workflow_step = 'final_review' then
    select not exists (select 1 from public.asy_recruitment_evidence e where e.application_id = new.id and e.stage_number = 2 and e.is_required and e.status <> 'approved') into v_all_approved;
    if not v_all_approved then raise exception 'All remaining requirements must be approved before final review.'; end if;
    return new;
  end if;
  if old.workflow_step = 'final_review' and new.workflow_step = 'screening_gc_ready' then
    if not exists (select 1 from public.asy_recruitment_admins a where lower(a.email) = v_email) then raise exception 'Only an authorized recruiter can complete the final review.'; end if;
    select not exists (select 1 from public.asy_recruitment_evidence e where e.application_id = new.id and e.is_required and e.status <> 'approved') into v_all_approved;
    if not v_all_approved then raise exception 'All required evidence must be approved before final review.'; end if;
    if new.mgc_verification_status is distinct from 'verified' or new.mgc_applicant_contacted is distinct from true or nullif(btrim(new.mgc_checked_by_email), '') is null or new.mgc_checked_at is null or nullif(btrim(new.mgc_verification_notes), '') is null then
      raise exception 'Complete the MGC manual double-check and confirm applicant contact before marking Screening GC ready.';
    end if;
    return new;
  end if;
  if old.workflow_step = 'screening_gc_ready' and new.workflow_step = 'complete' then
    if new.status <> 'accepted' then raise exception 'Recruitment can only be completed with the final accepted decision.'; end if;
    return new;
  end if;
  raise exception 'Invalid recruitment workflow transition from % to %.', old.workflow_step, new.workflow_step;
end;
$$;

update public.asy_recruitment_evidence set is_required = false, updated_at = now()
where requirement_key = 'membership_form_screenshot';

update public.asy_recruitment_evidence set stage_number = 2, updated_at = now()
where requirement_key in ('tiktok_tag_screenshot','tiktok_follow_screenshot','discord_nickname_screenshot','roster_photo','referral_conversation_screenshot');

update public.asy_recruitment_evidence e set status = 'not_submitted', updated_at = now()
from public.asy_clan_applications a
where a.id = e.application_id and a.workflow_step in ('membership_proofs','discord_roster')
  and e.stage_number = 2 and e.is_required and e.status = 'locked';

update public.asy_clan_applications a set workflow_step = 'final_review', updated_at = now()
where a.workflow_step in ('membership_proofs','discord_roster')
and not exists (
  select 1 from public.asy_recruitment_evidence e
  where e.application_id = a.id and e.stage_number = 2 and e.is_required and e.status <> 'approved'
);
