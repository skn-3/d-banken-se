
-- 1) Purchases
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS admin_note text;
ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
ALTER TABLE public.purchases ADD CONSTRAINT purchases_status_check
  CHECK (status = ANY (ARRAY['pending','paid','failed','refunded','cancelled']));

-- 2) Certificates: allow reissue
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.certificates(id) ON DELETE SET NULL;
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_verification_id_key;
-- purchase_id currently has unique constraint; multiple cert rows per purchase => drop it too
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_purchase_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS certificates_verification_id_active_uniq
  ON public.certificates (verification_id) WHERE superseded_by IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS certificates_purchase_id_active_uniq
  ON public.certificates (purchase_id) WHERE superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS certificates_superseded_by_idx ON public.certificates (superseded_by);

-- 3) get_certificate_public: return only latest active row
CREATE OR REPLACE FUNCTION public.get_certificate_public(p_verification_id text)
RETURNS TABLE(verification_id text, recipient_name text, tree_count integer,
              location_name text, latitude numeric, longitude numeric,
              issued_date timestamp with time zone, template_snapshot jsonb,
              greeting text, theme_slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.verification_id, c.recipient_name, c.tree_count,
         c.location_name, c.latitude, c.longitude,
         c.issued_date, c.template_snapshot, c.greeting, gt.slug
  FROM public.certificates c
  LEFT JOIN public.purchases p ON p.id = c.purchase_id
  LEFT JOIN public.greeting_themes gt ON gt.id = p.theme_id
  WHERE c.verification_id = p_verification_id
    AND c.superseded_by IS NULL
  LIMIT 1;
$$;

-- 4) Point transactions: allow adjustment
ALTER TABLE public.point_transactions DROP CONSTRAINT IF EXISTS point_transactions_type_check;
ALTER TABLE public.point_transactions ADD CONSTRAINT point_transactions_type_check
  CHECK (type = ANY (ARRAY['sale','spend','bonus_milestone','bonus_weekend','bonus_double','bonus_team','bonus_streak','bonus_other','adjustment']));

-- 5) admin_activity index for queries
CREATE INDEX IF NOT EXISTS admin_activity_created_at_idx ON public.admin_activity (created_at DESC);
