ALTER TABLE public.asy_clan_roster ADD COLUMN IF NOT EXISTS clan_name text;
CREATE OR REPLACE VIEW public.asy_clan_roster_public AS
SELECT id, ign, main_role, rank, member_status, joined_at, clan_name
FROM public.asy_clan_roster
WHERE member_status = 'active';
