create or replace function private.guard_recruitment_workflow_step()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_all_approved boolean;
begin
  if new.workflow_step is not distinct from old.workflow_step then
    return new;
  end if;

  v_email := lower(coalesce((select auth.jwt() ->> 'email'), ''));

  if old.workflow_step = 'eligibility_review' and new.workflow_step = 'tag_proofs' then
    if not exists (
      select 1 from public.asy_recruitment_admins a
      where lower(a.email) = v_email
    ) then
      raise exception 'Only an authorized recruiter can approve eligibility.';
    end if;
    if new.application_details_verified is not true
       or nullif(btrim(new.application_details_verified_by_email), '') is null
       or new.application_details_verified_at is null
       or not exists (
         select 1 from public.asy_recruitment_admins a
         where lower(a.email) = lower(new.application_details_verified_by_email)
       ) then
      raise exception 'Review and confirm the applicant details before unlocking the CODM screenshot step.';
    end if;
    if new.age_verification_status is distinct from 'verified' then
      raise exception 'Verify that the applicant meets the minimum age requirement before unlocking the CODM screenshot step.';
    end if;
    return new;
  end if;

  if old.workflow_step = 'tag_proofs' and new.workflow_step = 'membership_proofs' then
    select not exists (
      select 1 from public.asy_recruitment_evidence e
      where e.application_id = new.id and e.stage_number = 1
        and e.is_required and e.status <> 'approved'
    ) into v_all_approved;
    if not v_all_approved then raise exception 'The CODM screenshot must be approved first.'; end if;
    return new;
  end if;

  if old.workflow_step in ('membership_proofs','discord_roster') and new.workflow_step = 'final_review' then
    select not exists (
      select 1 from public.asy_recruitment_evidence e
      where e.application_id = new.id and e.stage_number = 2
        and e.is_required and e.status <> 'approved'
    ) into v_all_approved;
    if not v_all_approved then raise exception 'All remaining requirements must be approved before final review.'; end if;
    return new;
  end if;

  if old.workflow_step = 'final_review' and new.workflow_step = 'screening_gc_ready' then
    if not exists (
      select 1 from public.asy_recruitment_admins a
      where lower(a.email) = v_email
    ) then
      raise exception 'Only an authorized recruiter can complete the final review.';
    end if;
    select not exists (
      select 1 from public.asy_recruitment_evidence e
      where e.application_id = new.id and e.is_required and e.status <> 'approved'
    ) into v_all_approved;
    if not v_all_approved then raise exception 'All required evidence must be approved before final review.'; end if;
    if new.membership_form_response_verified is not true
       or nullif(btrim(new.membership_form_response_verified_by_email), '') is null
       or new.membership_form_response_verified_at is null
       or not exists (
         select 1 from public.asy_recruitment_admins a
         where lower(a.email) = lower(new.membership_form_response_verified_by_email)
       ) then
      raise exception 'Check and match the Membership Form response before completing final review.';
    end if;
    if new.mgc_verification_status is distinct from 'verified'
       or new.mgc_applicant_contacted is distinct from true
       or nullif(btrim(new.mgc_checked_by_email), '') is null
       or new.mgc_checked_at is null
       or nullif(btrim(new.mgc_verification_notes), '') is null then
      raise exception 'Complete the MGC manual double-check and confirm applicant contact before marking Screening GC ready.';
    end if;
    return new;
  end if;

  if old.workflow_step = 'screening_gc_ready' and new.workflow_step = 'complete' then
    if new.status <> 'accepted' then
      raise exception 'Recruitment can only be completed with the final accepted decision.';
    end if;
    return new;
  end if;

  raise exception 'Invalid recruitment workflow transition from % to %.', old.workflow_step, new.workflow_step;
end;
$$;
