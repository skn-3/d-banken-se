
-- =========================
-- 1) REGISTER-VYER (admin only via has_role-filter)
-- =========================

CREATE OR REPLACE VIEW public.register_rader
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  p.id                              AS purchase_id,
  COALESCE(p.paid_at, p.created_at) AS datum,
  p.source                          AS kalla,
  p.source_seller                   AS source_seller,
  COALESCE(p.recipient_name, c.name)  AS mottagar_namn,
  COALESCE(p.recipient_email, c.email) AS mottagar_epost,
  p.tree_count                      AS antal_trad,
  p.total_amount_ore                AS belopp_ore,
  p.status                          AS status,
  cert.location_name                AS projekt,
  cert.verification_id              AS verification_id
FROM public.purchases p
LEFT JOIN public.customers c   ON c.id = p.customer_id
LEFT JOIN public.certificates cert ON cert.purchase_id = p.id
WHERE public.has_role(auth.uid(), 'admin'::public.app_role);

CREATE OR REPLACE VIEW public.register_kunder
WITH (security_invoker = true, security_barrier = true) AS
WITH base AS (
  SELECT
    p.id,
    COALESCE(p.paid_at, p.created_at) AS datum,
    p.tree_count,
    p.source,
    LOWER(NULLIF(TRIM(COALESCE(p.recipient_email, c.email, '')), '')) AS email_key,
    NULLIF(TRIM(COALESCE(p.recipient_name, c.name, '')), '')          AS namn_key,
    COALESCE(p.recipient_name, c.name)                                AS namn,
    COALESCE(p.recipient_email, c.email)                              AS epost
  FROM public.purchases p
  LEFT JOIN public.customers c ON c.id = p.customer_id
  WHERE p.status = 'paid'
)
SELECT
  COALESCE(email_key, 'name:' || COALESCE(namn_key, 'okand')) AS kund_nyckel,
  MAX(namn)  AS mottagar_namn,
  MAX(epost) AS mottagar_epost,
  SUM(tree_count)::int AS totalt_antal_trad,
  COUNT(*)::int        AS antal_kop,
  MIN(datum)           AS forsta_kop,
  MAX(datum)           AS senaste_kop,
  ARRAY_AGG(DISTINCT source) FILTER (WHERE source IS NOT NULL) AS kallor
FROM base
WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
GROUP BY COALESCE(email_key, 'name:' || COALESCE(namn_key, 'okand'));

-- Statistik: träd per månad senaste 24 månaderna
CREATE OR REPLACE VIEW public.stats_trad_per_manad
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  DATE_TRUNC('month', COALESCE(p.paid_at, p.created_at)) AS manad,
  SUM(p.tree_count)::int AS antal_trad,
  COUNT(*)::int          AS antal_kop
FROM public.purchases p
WHERE p.status = 'paid'
  AND COALESCE(p.paid_at, p.created_at) >= (DATE_TRUNC('month', now()) - INTERVAL '23 months')
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
GROUP BY 1
ORDER BY 1;

-- Statistik: träd per källa
CREATE OR REPLACE VIEW public.stats_trad_per_kalla
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  COALESCE(p.source, 'okand') AS kalla,
  SUM(p.tree_count)::int      AS antal_trad,
  COUNT(*)::int               AS antal_kop
FROM public.purchases p
WHERE p.status = 'paid'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
GROUP BY 1
ORDER BY 2 DESC;

-- Statistik: träd per projekt
CREATE OR REPLACE VIEW public.stats_trad_per_projekt
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  COALESCE(cert.location_name, 'okant projekt') AS projekt,
  SUM(p.tree_count)::int                        AS antal_trad,
  COUNT(*)::int                                 AS antal_bevis
FROM public.purchases p
JOIN public.certificates cert ON cert.purchase_id = p.id
WHERE p.status = 'paid'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
GROUP BY 1
ORDER BY 2 DESC;

-- Statistik: träd per säljare (source_seller)
CREATE OR REPLACE VIEW public.stats_trad_per_saljare
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  COALESCE(p.source_seller, 'okand') AS saljare,
  SUM(p.tree_count)::int             AS antal_trad,
  COUNT(*)::int                      AS antal_kop
FROM public.purchases p
WHERE p.status = 'paid'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
GROUP BY 1
ORDER BY 2 DESC;

-- Behörighet på vyerna: bara authenticated (admin filtreras i WHERE)
REVOKE ALL ON public.register_rader, public.register_kunder,
              public.stats_trad_per_manad, public.stats_trad_per_kalla,
              public.stats_trad_per_projekt, public.stats_trad_per_saljare
  FROM PUBLIC, anon;
GRANT SELECT ON public.register_rader, public.register_kunder,
                public.stats_trad_per_manad, public.stats_trad_per_kalla,
                public.stats_trad_per_projekt, public.stats_trad_per_saljare
  TO authenticated;
GRANT SELECT ON public.register_rader, public.register_kunder,
                public.stats_trad_per_manad, public.stats_trad_per_kalla,
                public.stats_trad_per_projekt, public.stats_trad_per_saljare
  TO service_role;

-- =========================
-- 3) AUDITLOGG
-- =========================
CREATE TABLE IF NOT EXISTS public.admin_activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid,
  action     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_activity TO authenticated;
GRANT ALL    ON public.admin_activity TO service_role;

ALTER TABLE public.admin_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read admin_activity"
  ON public.admin_activity
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Loggnings-RPC (SECURITY DEFINER – kontrollerar admin själv)
CREATE OR REPLACE FUNCTION public.log_admin_activity(_action text, _detail jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.admin_activity(user_id, action, detail)
  VALUES (auth.uid(), _action, COALESCE(_detail, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.log_admin_activity(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_activity(text, jsonb) TO authenticated, service_role;

-- =========================
-- 4) SUPPRESSION
-- =========================
CREATE TABLE IF NOT EXISTS public.email_suppression (
  email      text PRIMARY KEY,
  reason     text NOT NULL DEFAULT 'unsubscribed',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_suppression TO authenticated;
GRANT ALL    ON public.email_suppression TO service_role;

ALTER TABLE public.email_suppression ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read email_suppression"
  ON public.email_suppression
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
-- (Inga INSERT/UPDATE/DELETE-policyn: endast service_role skriver, den bypassar RLS.)
