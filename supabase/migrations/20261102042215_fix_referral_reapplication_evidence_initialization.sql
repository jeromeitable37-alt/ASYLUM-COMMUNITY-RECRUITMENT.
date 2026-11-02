-- Fix: referral applicant submission must not invoke recruiter-only evidence review.
-- Referral stage 2 proofs are initialized in uploadable (not_submitted) state.
-- They remain gated by the application workflow step in the evidence Edge Function.
-- Do not weaken authorization for editing or approving existing evidence.

create or replace function private.seed_recruitment_evidence()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_complete boolean := new.status = 'accepted';
  v_stage2_status text;
begin
  v_stage2_status := case
    when v_complete then 'approved'
    when new.application_type = 'referral' then 'not_submitted'
    else 'locked'
  end;

  insert into public.asy_recruitment_evidence
    (application_id, requirement_key, requirement_label, stage_number, status)
  values
    (new.id, 'codm_tag_screenshot',
      'Screenshot of main CODM account with ASY tag after IGN', 1,
      case when v_complete then 'approved' else 'not_submitted' end),
    (new.id, 'tiktok_tag_screenshot',
      'Screenshot of TikTok account with ASY tag after IGN', 2, v_stage2_status),
    (new.id, 'tiktok_follow_screenshot',
      'Screenshot confirming follow of official ASY Community TikTok', 2, v_stage2_status),
    (new.id, 'discord_nickname_screenshot',
      'Proof of Discord server nickname in the format IGN ASY', 2, v_stage2_status),
    (new.id, 'roster_photo',
      'Roster photo for welcome banner (include Facebook name in caption when submitting)', 2, v_stage2_status)
  on conflict (application_id, requirement_key) do nothing;

  if new.application_type = 'referral' then
    insert into public.asy_recruitment_evidence
      (application_id, requirement_key, requirement_label, stage_number, status)
    values
      (new.id, 'referral_conversation_screenshot',
       'Screenshot of conversation with the member who referred you', 2, v_stage2_status),
      (new.id, 'membership_form_screenshot',
       'Screenshot of completed Referral Membership Form showing IGN', 2, v_stage2_status)
    on conflict (application_id, requirement_key) do nothing;
  end if;

  if v_complete then
    update public.asy_clan_applications
    set workflow_step='complete'
    where id=new.id and workflow_step<>'complete';
  end if;
  return new;
end;
$function$;

-- Old trigger was immediately updating referral evidence under an anonymous
-- applicant's JWT. That correctly failed the secure reviewer-only guard.
-- Initialization above supersedes it, without changing reviewer authorization.
drop trigger if exists unlock_referral_evidence_after_insert on public.asy_clan_applications;
