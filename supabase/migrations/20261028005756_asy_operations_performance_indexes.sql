-- Add indexes to foreign-key columns used by moderation, recruitment, and scrim lookups.
-- These improve joins and deletes without changing any existing member data or access rules.
CREATE INDEX IF NOT EXISTS asy_community_reports_message_id_idx
  ON public.asy_community_reports (message_id);
CREATE INDEX IF NOT EXISTS asy_recruitment_interviews_application_id_idx
  ON public.asy_recruitment_interviews (application_id);
CREATE INDEX IF NOT EXISTS asy_recruitment_tryouts_application_id_idx
  ON public.asy_recruitment_tryouts (application_id);
CREATE INDEX IF NOT EXISTS asy_scrim_attendance_roster_id_idx
  ON public.asy_scrim_attendance (roster_id);
CREATE INDEX IF NOT EXISTS asy_teams_captain_roster_id_idx
  ON public.asy_teams (captain_roster_id);
CREATE INDEX IF NOT EXISTS member_applications_reviewed_by_idx
  ON public.member_applications (reviewed_by);
