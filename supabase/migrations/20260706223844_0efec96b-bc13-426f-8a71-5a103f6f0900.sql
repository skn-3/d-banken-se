
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'issued',
  ADD COLUMN IF NOT EXISTS deliver_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS recipient_delivery_email text NULL,
  ADD COLUMN IF NOT EXISTS buyer_name_snapshot text NULL;

CREATE INDEX IF NOT EXISTS idx_certificates_scheduled
  ON public.certificates (deliver_at)
  WHERE status IN ('scheduled','delivering');

-- Publika verifieringssidan ska inte avslöja schemalagda gåvor innan leverans.
CREATE OR REPLACE FUNCTION public.get_certificate_public(p_verification_id text)
RETURNS TABLE (
  verification_id text,
  recipient_name text,
  tree_count integer,
  location_name text,
  latitude numeric,
  longitude numeric,
  issued_date timestamptz,
  template_snapshot jsonb,
  greeting text,
  theme_slug text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.verification_id, c.recipient_name, c.tree_count,
         c.location_name, c.latitude, c.longitude, c.issued_date,
         c.template_snapshot, c.greeting,
         (SELECT gt.slug FROM public.greeting_themes gt
            JOIN public.purchases p ON p.theme_id = gt.id
            WHERE p.id = c.purchase_id LIMIT 1) AS theme_slug
  FROM public.certificates c
  WHERE c.verification_id = p_verification_id
    AND (c.status IS NULL OR c.status <> 'scheduled')
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_certificate_public(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_certificate_public(text) TO anon, authenticated;
