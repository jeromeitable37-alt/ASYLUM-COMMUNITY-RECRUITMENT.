alter table public.asy_clan_applications
  add column if not exists membership_form_response_verified boolean not null default false,
  add column if not exists membership_form_response_verified_by_email text,
  add column if not exists membership_form_response_verified_at timestamptz;

create or replace function private.reset_application_details_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    new.ign, new.codm_uid, new.contact_email, new.discord_username,
    new.applicant_facebook_url, new.applicant_tiktok_url, new.streamer_mode_id,
    new.region, new.level, new.rank, new.main_role, new.preferred_mode,
    new.availability, new.clan_experience, new.reason, new.referrer_name,
    new.referrer_facebook_url, new.age_range, new.meets_age_requirement,
    new.legendary_series_count, new.facebook_name_appropriate,
    new.willing_to_add_asy_tag, new.willing_to_submit_roster_photo
  ) is distinct from row(
    old.ign, old.codm_uid, old.contact_email, old.discord_username,
    old.applicant_facebook_url, old.applicant_tiktok_url, old.streamer_mode_id,
    old.region, old.level, old.rank, old.main_role, old.preferred_mode,
    old.availability, old.clan_experience, old.reason, old.referrer_name,
    old.referrer_facebook_url, old.age_range, old.meets_age_requirement,
    old.legendary_series_count, old.facebook_name_appropriate,
    old.willing_to_add_asy_tag, old.willing_to_submit_roster_photo
  ) then
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
       or lower(new.application_details_verified_by_email) <> v_email then
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
       or lower(new.membership_form_response_verified_by_email) <> v_email then
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
    if new.status <> 'accepted' then raise exception 'Recruitment can only be completed with the final accepted decision.'; end if;
    return new;
  end if;

  raise exception 'Invalid recruitment workflow transition from % to %.', old.workflow_step, new.workflow_step;
end;
$$;
