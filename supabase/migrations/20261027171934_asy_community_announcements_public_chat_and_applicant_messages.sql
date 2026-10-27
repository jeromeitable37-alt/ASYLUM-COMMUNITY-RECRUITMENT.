-- ASY Community chat, public announcements, and private applicant/recruiter messages.
-- All direct access is revoked; the messaging Edge Function uses the server-only Supabase key.
CREATE TABLE IF NOT EXISTS public.asy_community_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 3000),
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general','recruitment','event','maintenance')),
  is_published boolean NOT NULL DEFAULT false,
  created_by_email text NOT NULL,
  updated_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS asy_community_announcements_published_idx
  ON public.asy_community_announcements (is_published, published_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.asy_community_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 32),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  hidden_at timestamptz,
  hidden_by_email text,
  moderation_note text
);

CREATE INDEX IF NOT EXISTS asy_community_chat_visible_idx
  ON public.asy_community_chat_messages (hidden_at, created_at DESC);

CREATE TABLE IF NOT EXISTS public.asy_application_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.asy_clan_applications(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('applicant','recruiter')),
  sender_name text NOT NULL CHECK (char_length(btrim(sender_name)) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  applicant_read_at timestamptz,
  recruiter_read_at timestamptz
);

CREATE INDEX IF NOT EXISTS asy_application_messages_thread_idx
  ON public.asy_application_messages (application_id, created_at ASC);

ALTER TABLE public.asy_community_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asy_community_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asy_application_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.asy_community_announcements FROM anon, authenticated;
REVOKE ALL ON TABLE public.asy_community_chat_messages FROM anon, authenticated;
REVOKE ALL ON TABLE public.asy_application_messages FROM anon, authenticated;
GRANT ALL ON TABLE public.asy_community_announcements TO service_role;
GRANT ALL ON TABLE public.asy_community_chat_messages TO service_role;
GRANT ALL ON TABLE public.asy_application_messages TO service_role;
