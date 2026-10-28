-- Separate public directory fields from private roster data; limit base-table access to staff.
ALTER TABLE public.asy_clan_roster ADD COLUMN IF NOT EXISTS clan_name text;
CREATE TABLE IF NOT EXISTS public.asy_member_directory_public (
  roster_id uuid PRIMARY KEY REFERENCES public.asy_clan_roster(id) ON DELETE CASCADE,
  ign text NOT NULL, main_role text NOT NULL, rank text NOT NULL,
  member_status text NOT NULL, joined_at timestamptz NOT NULL, clan_name text
);
CREATE INDEX IF NOT EXISTS asy_member_directory_public_active_idx ON public.asy_member_directory_public (member_status, clan_name, ign);
ALTER TABLE public.asy_member_directory_public ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.asy_member_directory_public FROM anon, authenticated;
GRANT SELECT ON TABLE public.asy_member_directory_public TO anon, authenticated;
DROP POLICY IF EXISTS "public directory active rows" ON public.asy_member_directory_public;
CREATE POLICY "public directory active rows" ON public.asy_member_directory_public FOR SELECT TO anon, authenticated USING (member_status = 'active');

DROP POLICY IF EXISTS "public view active roster" ON public.asy_clan_roster;
DROP POLICY IF EXISTS "recruiters read roster" ON public.asy_clan_roster;
CREATE POLICY "recruiters read roster" ON public.asy_clan_roster FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.asy_recruitment_admins a WHERE lower(a.email) = lower((SELECT auth.jwt() ->> 'email')))
);
REVOKE ALL ON TABLE public.asy_clan_roster FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.asy_clan_roster TO authenticated;

CREATE OR REPLACE FUNCTION public.asy_sync_member_directory_public()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.asy_member_directory_public(roster_id,ign,main_role,rank,member_status,joined_at,clan_name)
  VALUES (NEW.id,NEW.ign,NEW.main_role,NEW.rank,NEW.member_status,NEW.joined_at,NEW.clan_name)
  ON CONFLICT (roster_id) DO UPDATE SET ign=EXCLUDED.ign,main_role=EXCLUDED.main_role,rank=EXCLUDED.rank,
    member_status=EXCLUDED.member_status,joined_at=EXCLUDED.joined_at,clan_name=EXCLUDED.clan_name;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.asy_sync_member_directory_public() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS asy_sync_member_directory_public_trigger ON public.asy_clan_roster;
CREATE TRIGGER asy_sync_member_directory_public_trigger
AFTER INSERT OR UPDATE OF ign,main_role,rank,member_status,joined_at,clan_name ON public.asy_clan_roster
FOR EACH ROW EXECUTE FUNCTION public.asy_sync_member_directory_public();

INSERT INTO public.asy_member_directory_public(roster_id,ign,main_role,rank,member_status,joined_at,clan_name)
SELECT id,ign,main_role,rank,member_status,joined_at,clan_name FROM public.asy_clan_roster
ON CONFLICT (roster_id) DO UPDATE SET ign=EXCLUDED.ign,main_role=EXCLUDED.main_role,rank=EXCLUDED.rank,
  member_status=EXCLUDED.member_status,joined_at=EXCLUDED.joined_at,clan_name=EXCLUDED.clan_name;

CREATE OR REPLACE VIEW public.asy_clan_roster_public WITH (security_invoker = true) AS
SELECT roster_id AS id,ign,main_role,rank,member_status,joined_at,clan_name
FROM public.asy_member_directory_public WHERE member_status='active';
ALTER FUNCTION public.asy_recruitment_actor_email() SET search_path = public, pg_temp;
