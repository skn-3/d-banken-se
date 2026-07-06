
DROP FUNCTION IF EXISTS public.get_public_certificate(text);

CREATE FUNCTION public.get_public_certificate(_verification_id text)
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
         c.location_name, c.latitude, c.longitude, c.issued_date, c.template_snapshot,
         c.greeting,
         gt.slug AS theme_slug
  FROM public.certificates c
  LEFT JOIN public.purchases pu ON pu.id = c.purchase_id
  LEFT JOIN public.greeting_themes gt ON gt.id = pu.theme_id
  WHERE c.verification_id = _verification_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_certificate(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_certificate(text) TO anon, authenticated;
