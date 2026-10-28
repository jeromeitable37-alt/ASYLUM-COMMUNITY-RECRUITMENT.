-- Operations dashboard support: audit trail, staff/applicant notifications,
-- community reports, teams, team membership, scrim events, and attendance.
CREATE TABLE IF NOT EXISTS public.asy_recruitment_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email text NOT NULL DEFAULT 'system',
  action text NOT NULL CHECK (char_length(btrim(action)) BETWEEN 1 AND 80),
  entity_type text NOT NULL CHECK (char_length(btrim(entity_type)) BETWEEN 1 AND 50),
  entity_id text,
  summary text NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asy_audit_created_idx ON public.asy_recruitment_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS asy_audit_entity_idx ON public.asy_recruitment_audit_logs (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.asy_recruitment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES public.asy_clan_applications(id) ON DELETE CASCADE,
  recipient_role text NOT NULL CHECK (recipient_role IN ('applicant','recruiter')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  notification_type text NOT NULL DEFAULT 'general' CHECK (char_length(notification_type) BETWEEN 1 AND 50),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asy_notifications_inbox_idx ON public.asy_recruitment_notifications (recipient_role, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS asy_notifications_application_idx ON public.asy_recruitment_notifications (application_id, recipient_role, created_at DESC);

CREATE TABLE IF NOT EXISTS public.asy_community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.asy_community_chat_messages(id) ON DELETE SET NULL,
  reporter_name text NOT NULL DEFAULT 'Community member' CHECK (char_length(btrim(reporter_name)) BETWEEN 2 AND 60),
  reason text NOT NULL CHECK (reason IN ('spam','harassment','personal_information','impersonation','other')),
  details text CHECK (details IS NULL OR char_length(details) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed')),
  reviewed_by_email text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asy_community_reports_queue_idx ON public.asy_community_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.asy_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  division text NOT NULL DEFAULT 'Mixed' CHECK (division IN ('BR','MP','Mixed','Academy')),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  captain_roster_id uuid REFERENCES public.asy_clan_roster(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_email text NOT NULL DEFAULT 'system',
  updated_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asy_teams_active_idx ON public.asy_teams (is_active, division, name);

CREATE TABLE IF NOT EXISTS public.asy_team_members (
  team_id uuid NOT NULL REFERENCES public.asy_teams(id) ON DELETE CASCADE,
  roster_id uuid NOT NULL REFERENCES public.asy_clan_roster(id) ON DELETE CASCADE,
  team_position text NOT NULL DEFAULT 'Player' CHECK (team_position IN ('Captain','Player','Substitute','Coach')),
  added_by_email text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, roster_id)
);
CREATE INDEX IF NOT EXISTS asy_team_members_roster_idx ON public.asy_team_members (roster_id);

CREATE TABLE IF NOT EXISTS public.asy_scrim_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  opponent text NOT NULL DEFAULT '' CHECK (char_length(opponent) <= 100),
  game_mode text NOT NULL DEFAULT 'MP' CHECK (game_mode IN ('BR','MP','Mixed')),
  team_id uuid REFERENCES public.asy_teams(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','staff')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 1000),
  created_by_email text NOT NULL DEFAULT 'system',
  updated_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asy_scrim_upcoming_idx ON public.asy_scrim_events (status, starts_at ASC);
CREATE INDEX IF NOT EXISTS asy_scrim_team_idx ON public.asy_scrim_events (team_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS public.asy_scrim_attendance (
  event_id uuid NOT NULL REFERENCES public.asy_scrim_events(id) ON DELETE CASCADE,
  roster_id uuid NOT NULL REFERENCES public.asy_clan_roster(id) ON DELETE CASCADE,
  attendance_status text NOT NULL DEFAULT 'pending' CHECK (attendance_status IN ('pending','going','maybe','declined','attended','absent')),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  updated_by_email text NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, roster_id)
);
CREATE INDEX IF NOT EXISTS asy_scrim_attendance_event_idx ON public.asy_scrim_attendance (event_id, attendance_status);

ALTER TABLE public.asy_recruitment_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asy_recruitment_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asy_community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asy_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asy_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asy_scrim_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asy_scrim_attendance ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.asy_recruitment_audit_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.asy_recruitment_notifications FROM anon, authenticated;
REVOKE ALL ON TABLE public.asy_community_reports FROM anon, authenticated;
REVOKE ALL ON TABLE public.asy_teams FROM anon, authenticated;
REVOKE ALL ON TABLE public.asy_team_members FROM anon, authenticated;
REVOKE ALL ON TABLE public.asy_scrim_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.asy_scrim_attendance FROM anon, authenticated;
GRANT ALL ON TABLE public.asy_recruitment_audit_logs TO service_role;
GRANT ALL ON TABLE public.asy_recruitment_notifications TO service_role;
GRANT ALL ON TABLE public.asy_community_reports TO service_role;
GRANT ALL ON TABLE public.asy_teams TO service_role;
GRANT ALL ON TABLE public.asy_team_members TO service_role;
GRANT ALL ON TABLE public.asy_scrim_events TO service_role;
GRANT ALL ON TABLE public.asy_scrim_attendance TO service_role;

CREATE OR REPLACE FUNCTION public.asy_recruitment_actor_email()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.email', true), ''), 'system')
$$;
REVOKE ALL ON FUNCTION public.asy_recruitment_actor_email() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.asy_audit_application_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor text;
BEGIN
  actor := public.asy_recruitment_actor_email();
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.asy_recruitment_audit_logs(actor_email,action,entity_type,entity_id,summary)
    VALUES (actor,'application.created','application',NEW.id::text,'New recruitment application submitted.');
    INSERT INTO public.asy_recruitment_notifications(application_id,recipient_role,title,body,notification_type)
    VALUES (NEW.id,'recruiter','New recruitment application','A new application is waiting for staff review.','application_created');
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
END $$;
REVOKE ALL ON FUNCTION public.asy_audit_application_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS asy_audit_application_insert ON public.asy_clan_applications;
DROP TRIGGER IF EXISTS asy_audit_application_update ON public.asy_clan_applications;
CREATE TRIGGER asy_audit_application_insert AFTER INSERT ON public.asy_clan_applications
FOR EACH ROW EXECUTE FUNCTION public.asy_audit_application_change();
CREATE TRIGGER asy_audit_application_update AFTER UPDATE OF status, workflow_step ON public.asy_clan_applications
FOR EACH ROW EXECUTE FUNCTION public.asy_audit_application_change();

CREATE OR REPLACE FUNCTION public.asy_audit_evidence_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor text; old_status text; new_status text; app_id uuid;
BEGIN
  actor := public.asy_recruitment_actor_email();
  app_id := COALESCE(NEW.application_id, OLD.application_id);
  old_status := CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END;
  new_status := NEW.status;
  IF TG_OP='INSERT' OR old_status IS DISTINCT FROM new_status THEN
    INSERT INTO public.asy_recruitment_audit_logs(actor_email,action,entity_type,entity_id,summary)
    VALUES (actor,'evidence.status_changed','evidence',NEW.id::text,'Evidence review status: '||COALESCE(old_status,'not submitted')||' → '||COALESCE(new_status,'unknown')||'.');
    IF new_status='pending' THEN
      INSERT INTO public.asy_recruitment_notifications(application_id,recipient_role,title,body,notification_type)
      VALUES (app_id,'recruiter','Evidence ready for review','New required evidence was submitted for recruiter review.','evidence_submitted');
    ELSIF old_status='pending' AND new_status IN ('approved','needs_correction') THEN
      INSERT INTO public.asy_recruitment_notifications(application_id,recipient_role,title,body,notification_type)
      VALUES (app_id,'applicant','Evidence review completed',CASE WHEN new_status='approved' THEN 'A required item was approved.' ELSE 'A required item needs your correction.' END,'evidence_review');
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.asy_audit_evidence_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS asy_audit_evidence_change ON public.asy_recruitment_evidence;
CREATE TRIGGER asy_audit_evidence_change AFTER INSERT OR UPDATE OF status ON public.asy_recruitment_evidence
FOR EACH ROW EXECUTE FUNCTION public.asy_audit_evidence_change();

CREATE OR REPLACE FUNCTION public.asy_audit_application_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.asy_recruitment_notifications(application_id,recipient_role,title,body,notification_type)
  VALUES (NEW.application_id,CASE WHEN NEW.sender_role='applicant' THEN 'recruiter' ELSE 'applicant' END,
    CASE WHEN NEW.sender_role='applicant' THEN 'New applicant message' ELSE 'New recruiter reply' END,
    CASE WHEN NEW.sender_role='applicant' THEN 'An applicant sent a private message.' ELSE 'A recruiter replied to your application.' END,
    'application_message');
  INSERT INTO public.asy_recruitment_audit_logs(actor_email,action,entity_type,entity_id,summary)
  VALUES (COALESCE(NEW.sender_name,'system'),'message.sent','application_message',NEW.application_id::text,
    CASE WHEN NEW.sender_role='applicant' THEN 'Applicant sent a private message.' ELSE 'Recruiter sent a private reply.' END);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.asy_audit_application_message() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS asy_audit_application_message ON public.asy_application_messages;
CREATE TRIGGER asy_audit_application_message AFTER INSERT ON public.asy_application_messages
FOR EACH ROW EXECUTE FUNCTION public.asy_audit_application_message();
