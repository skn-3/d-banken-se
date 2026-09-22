-- ============ A1: greeting_blocklist admin-only read + server-side validation RPC ============
DROP POLICY IF EXISTS "Auth read blocklist" ON public.greeting_blocklist;
CREATE POLICY "Admins read blocklist" ON public.greeting_blocklist
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.check_greeting_allowed(_text text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.greeting_blocklist b
      WHERE b.word <> '' AND position(lower(b.word) in lower(coalesce(_text, ''))) > 0
    ) THEN jsonb_build_object('ok', false, 'reason', 'Innehåller olämpligt ord.')
    ELSE jsonb_build_object('ok', true)
  END
$$;
GRANT EXECUTE ON FUNCTION public.check_greeting_allowed(text) TO anon, authenticated, service_role;

-- ============ A2: point_events — non-admins see only running campaigns ============
DROP POLICY IF EXISTS "Anyone authenticated can read events" ON public.point_events;
CREATE POLICY "Read running events" ON public.point_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (active = true AND now() >= start_at AND now() < end_at)
  );

-- ============ B: Mockfjärds claim flow ============
CREATE TABLE IF NOT EXISTS public.mockfjards_cases (
  case_id text PRIMARY KEY,
  claim_code text NOT NULL UNIQUE,
  purchase_id uuid NOT NULL REFERENCES public.purchases(id),
  certificate_id uuid NOT NULL REFERENCES public.certificates(id),
  verification_id text NOT NULL,
  total_trees integer NOT NULL DEFAULT 0,
  seller text,
  claimed_at timestamptz,
  claim_name text,
  claim_email text,
  updates_opt_in boolean NOT NULL DEFAULT false,
  revoke_token text NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mockfjards_cases TO service_role;
GRANT SELECT ON public.mockfjards_cases TO authenticated;
ALTER TABLE public.mockfjards_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read cases" ON public.mockfjards_cases
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.mockfjards_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL,
  event_type text NOT NULL,
  event_ref text NOT NULL,
  tree_count integer NOT NULL,
  seller text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, event_type, event_ref)
);
GRANT ALL ON public.mockfjards_events TO service_role;
GRANT SELECT ON public.mockfjards_events TO authenticated;
ALTER TABLE public.mockfjards_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read events log" ON public.mockfjards_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_code text NOT NULL,
  case_id text,
  email text NOT NULL,
  name text NOT NULL,
  text_version text NOT NULL,
  consent_certificate boolean NOT NULL DEFAULT true,
  consent_updates boolean NOT NULL DEFAULT false,
  action text NOT NULL DEFAULT 'granted',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.consent_log TO service_role;
GRANT SELECT ON public.consent_log TO authenticated;
ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read consent log" ON public.consent_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_mockfjards_events_case ON public.mockfjards_events(case_id);
CREATE INDEX IF NOT EXISTS idx_consent_log_code ON public.consent_log(claim_code);