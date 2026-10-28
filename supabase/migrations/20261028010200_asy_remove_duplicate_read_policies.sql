-- These SELECT policies are redundant: an existing policy already grants the same access.
-- Removing only the duplicate policies preserves the effective access rules.
DROP POLICY IF EXISTS "recruiters read roster" ON public.asy_clan_roster;
DROP POLICY IF EXISTS "Admins can read all applications" ON public.member_applications;
