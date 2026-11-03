-- Make phone/desktop push and in-app notifications identify the applicant without exposing private message text, email, or UID.

CREATE OR REPLACE FUNCTION public.asy_audit_application_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE actor text;
DECLARE v_ign text;
BEGIN
  actor := public.asy_recruitment_actor_email();
  v_ign := pg_catalog.left(pg_catalog.regexp_replace(coalesce(nullif(pg_catalog.btrim(NEW.ign),''),'Applicant'),'[[:cntrl:]]',' ','g'),48);
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.asy_recruitment_audit_logs(actor_email,action,entity_type,entity_id,summary)
    VALUES (actor,'application.created','application',NEW.id::text,'New recruitment application submitted.');
    INSERT INTO public.asy_recruitment_notifications(application_id,recipient_role,title,body,notification_type)
    VALUES (NEW.id,'recruiter','New application: '||v_ign,
      v_ign||' submitted a '||CASE WHEN NEW.application_type='referral' THEN 'Referral' ELSE 'Direct' END||' Application. Open Recruiter Dashboard to review.',
      'application_created');
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.asy_recruitment_audit_logs(actor_email,action,entity_type,entity_id,summary)
    VALUES (actor,'application.status_changed','application',NEW.id::text,'Application status changed from '||OLD.status||' to '||NEW.status||'.');
    INSERT INTO public.asy_recruitment_notifications(application_id,recipient_role,title,body,notification_type)
    VALUES (NEW.id,'applicant','Application status updated','Your application status is now: '||NEW.status||'.','application_status');
  ELSIF OLD.workflow_step IS DISTINCT FROM NEW.workflow_step THEN
    INSERT INTO public.asy_recruitment_audit_logs(actor_email,action,entity_type,entity_id,summary)
    VALUES (actor,'application.step_changed','application',NEW.id::text,'Recruitment workflow step updated.');
    INSERT INTO public.asy_recruitment_notifications(application_id,recipient_role,title,body,notification_type)
    VALUES (NEW.id,'applicant','Recruitment step updated','Your application has moved to the next review step.','workflow_step');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.asy_audit_application_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ign text;
DECLARE v_sender text;
BEGIN
  SELECT pg_catalog.left(pg_catalog.regexp_replace(coalesce(nullif(pg_catalog.btrim(a.ign),''),'Applicant'),'[[:cntrl:]]',' ','g'),48)
    INTO v_ign FROM public.asy_clan_applications a WHERE a.id=NEW.application_id;
  v_ign := coalesce(v_ign,'Applicant');
  v_sender := pg_catalog.left(pg_catalog.regexp_replace(coalesce(nullif(pg_catalog.btrim(NEW.sender_name),''),'ASY Recruiter'),'[[:cntrl:]]',' ','g'),48);
  INSERT INTO public.asy_recruitment_notifications(application_id,recipient_role,title,body,notification_type)
  VALUES (NEW.application_id,CASE WHEN NEW.sender_role='applicant' THEN 'recruiter' ELSE 'applicant' END,
    CASE WHEN NEW.sender_role='applicant' THEN 'Message from '||v_ign ELSE 'Reply from ASY Recruitment' END,
    CASE WHEN NEW.sender_role='applicant' THEN v_ign||' sent a private message. Open this application to reply.' ELSE v_sender||' replied to your application. Open Private Application Chat.' END,
    'application_message');
  INSERT INTO public.asy_recruitment_audit_logs(actor_email,action,entity_type,entity_id,summary)
  VALUES (COALESCE(NEW.sender_name,'system'),'message.sent','application_message',NEW.application_id::text,
    CASE WHEN NEW.sender_role='applicant' THEN 'Applicant sent a private message.' ELSE 'Recruiter sent a private reply.' END);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.asy_audit_evidence_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE actor text;
DECLARE old_status text;
DECLARE new_status text;
DECLARE app_id uuid;
DECLARE v_ign text;
BEGIN
  actor := public.asy_recruitment_actor_email();
  app_id := COALESCE(NEW.application_id, OLD.application_id);
  SELECT pg_catalog.left(pg_catalog.regexp_replace(coalesce(nullif(pg_catalog.btrim(a.ign),''),'Applicant'),'[[:cntrl:]]',' ','g'),48)
  INTO v_ign FROM public.asy_clan_applications a WHERE a.id=app_id;
  v_ign := coalesce(v_ign,'Applicant');
  old_status := CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END;
  new_status := NEW.status;
  IF TG_OP='INSERT' OR old_status IS DISTINCT FROM new_status THEN
    INSERT INTO public.asy_recruitment_audit_logs(actor_email,action,entity_type,entity_id,summary)
    VALUES (actor,'evidence.status_changed','evidence',NEW.id::text,'Evidence review status: '||COALESCE(old_status,'not submitted')||' → '||COALESCE(new_status,'unknown')||'.');
    IF new_status='pending' THEN
      INSERT INTO public.asy_recruitment_notifications(application_id,recipient_role,title,body,notification_type)
      VALUES (app_id,'recruiter','Proof submitted: '||v_ign,
        v_ign||' uploaded a screening screenshot. Open the application to review.','evidence_submitted');
    ELSIF old_status='pending' AND new_status IN ('approved','needs_correction') THEN
      INSERT INTO public.asy_recruitment_notifications(application_id,recipient_role,title,body,notification_type)
      VALUES (app_id,'applicant','Evidence review completed',CASE WHEN new_status='approved' THEN 'A required item was approved.' ELSE 'A required item needs your correction.' END,'evidence_review');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Enrich existing generic staff inbox notices so applicants can be found immediately.
-- Do not change unread/read flags or trigger duplicate pushes; only update notice text.
update public.asy_recruitment_notifications n
set title = case n.notification_type
  when 'application_created' then 'New application: '||pg_catalog.left(pg_catalog.regexp_replace(a.ign,'[[:cntrl:]]',' ','g'),48)
  when 'application_message' then 'Message from '||pg_catalog.left(pg_catalog.regexp_replace(a.ign,'[[:cntrl:]]',' ','g'),48)
  when 'evidence_submitted' then 'Proof submitted: '||pg_catalog.left(pg_catalog.regexp_replace(a.ign,'[[:cntrl:]]',' ','g'),48)
  else n.title end,
  body = case n.notification_type
  when 'application_created' then pg_catalog.left(pg_catalog.regexp_replace(a.ign,'[[:cntrl:]]',' ','g'),48)||' submitted an application. Open Recruiter Dashboard to review.'
  when 'application_message' then pg_catalog.left(pg_catalog.regexp_replace(a.ign,'[[:cntrl:]]',' ','g'),48)||' sent a private message. Open this application to reply.'
  when 'evidence_submitted' then pg_catalog.left(pg_catalog.regexp_replace(a.ign,'[[:cntrl:]]',' ','g'),48)||' uploaded a screening screenshot. Open the application to review.'
  else n.body end
from public.asy_clan_applications a
where a.id=n.application_id and n.recipient_role='recruiter'
and n.notification_type in ('application_created','application_message','evidence_submitted')
and n.title in ('New recruitment application','New applicant message','Evidence ready for review')
and coalesce(pg_catalog.btrim(a.ign),'')<>'';