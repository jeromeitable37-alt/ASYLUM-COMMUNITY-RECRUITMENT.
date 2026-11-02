CREATE OR REPLACE FUNCTION private.guard_recruitment_evidence_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_jwt_role text;
  v_email text;
begin
  v_jwt_role := (select auth.jwt() ->> 'role');
  v_email := lower(coalesce((select auth.jwt() ->> 'email'), ''));

  -- Defense in depth: no Stage 2 file submissions or approvals before CODM approval.
  if new.stage_number=2 and new.status is distinct from old.status
     and new.status in ('pending','approved','needs_correction')
     and exists (select 1 from public.asy_clan_applications a
                 where a.id=new.application_id
                 and a.workflow_step in ('eligibility_review','tag_proofs')) then
    raise exception 'Stage 2 remains locked until the CODM screenshot is approved.';
  end if;

  if (new.status is distinct from old.status or new.reviewer_notes is distinct from old.reviewer_notes)
     and v_jwt_role <> 'service_role'
     and not exists (select 1 from public.asy_recruitment_admins a where lower(a.email)=v_email) then
    raise exception 'Only authorized recruiters can review submitted requirements.';
  end if;

  new.updated_at := now();
  if new.status in ('approved','needs_correction') and new.reviewed_at is null then
    new.reviewed_at := now();
  end if;
  return new;
end;
$function$;