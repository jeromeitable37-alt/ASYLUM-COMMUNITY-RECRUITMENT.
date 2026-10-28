ALTER TABLE public.asy_teams DROP CONSTRAINT IF EXISTS asy_teams_division_check;
ALTER TABLE public.asy_teams ADD CONSTRAINT asy_teams_division_check CHECK (division = ANY (ARRAY['Casual'::text, 'BR'::text, 'MP'::text, 'Mixed'::text, 'Academy'::text]));
