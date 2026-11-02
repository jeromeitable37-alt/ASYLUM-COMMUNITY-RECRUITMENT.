-- Codm first for both Direct and Referral, no new stage 2 uploads before approval.
CREATE OR REPLACE FUNCTION private.seed_recruitment_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_complete boolean := new.status = 'accepted';
  v_stage2_status text;
begin
  v_stage2_status := case
    when v_complete then 'approved'
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
CREATE OR REPLACE FUNCTION private.asy_sync_application_route_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare initial_status text;
begin
  if new.application_type is not distinct from old.application_type then return new; end if;
  if new.application_type='referral' then
    initial_status:=case when new.workflow_step in ('eligibility_review','tag_proofs')
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
    if new.workflow_step in ('membership_proofs','discord_roster') then
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
end; $function$;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.asy_recruitment_evidence e
   set status='locked', updated_at=now()
  from public.asy_clan_applications a
 where a.id=e.application_id
   and a.workflow_step in ('eligibility_review','tag_proofs')
   and a.status not in ('rejected','accepted')
   and e.stage_number=2 and e.status='not_submitted' and e.storage_path is null;
select set_config('request.jwt.claims','{}',true);