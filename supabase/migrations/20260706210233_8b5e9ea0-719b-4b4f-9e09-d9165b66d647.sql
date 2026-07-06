
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- trigram indexes
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON public.customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_email_trgm ON public.customers USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_purchases_recipient_name_trgm ON public.purchases USING gin (recipient_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_purchases_recipient_email_trgm ON public.purchases USING gin (recipient_email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_certificates_recipient_name_trgm ON public.certificates USING gin (recipient_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_certificates_verification_id_trgm ON public.certificates USING gin (verification_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_teams_name_trgm ON public.teams USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_teams_city_trgm ON public.teams USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_teams_join_code_trgm ON public.teams USING gin (join_code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm ON public.profiles USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm ON public.profiles USING gin (email gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.admin_search(q text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needle text;
  pat text;
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  needle := coalesce(btrim(q), '');
  IF length(needle) < 1 THEN
    RETURN jsonb_build_object(
      'customers','[]'::jsonb,'purchases','[]'::jsonb,
      'certificates','[]'::jsonb,'teams','[]'::jsonb,'sellers','[]'::jsonb);
  END IF;
  pat := '%' || needle || '%';

  SELECT jsonb_build_object(
    'customers', COALESCE((
      SELECT jsonb_agg(row_to_json(x)) FROM (
        SELECT id, name, email, created_at
        FROM public.customers
        WHERE name ILIKE pat OR email ILIKE pat
        ORDER BY created_at DESC
        LIMIT 8
      ) x
    ), '[]'::jsonb),
    'purchases', COALESCE((
      SELECT jsonb_agg(row_to_json(x)) FROM (
        SELECT id, recipient_name, recipient_email, tree_count, total_amount_ore, status, created_at, customer_id, team_id
        FROM public.purchases
        WHERE id::text ILIKE pat
           OR recipient_name ILIKE pat
           OR recipient_email ILIKE pat
        ORDER BY created_at DESC
        LIMIT 8
      ) x
    ), '[]'::jsonb),
    'certificates', COALESCE((
      SELECT jsonb_agg(row_to_json(x)) FROM (
        SELECT id, verification_id, recipient_name, tree_count, location_name, issued_date, purchase_id, customer_id
        FROM public.certificates
        WHERE verification_id ILIKE pat
           OR recipient_name ILIKE pat
        ORDER BY issued_date DESC
        LIMIT 8
      ) x
    ), '[]'::jsonb),
    'teams', COALESCE((
      SELECT jsonb_agg(row_to_json(x)) FROM (
        SELECT id, name, join_code, city, organization_id, created_at
        FROM public.teams
        WHERE name ILIKE pat
           OR coalesce(city,'') ILIKE pat
           OR coalesce(join_code,'') ILIKE pat
        ORDER BY created_at DESC
        LIMIT 8
      ) x
    ), '[]'::jsonb),
    'sellers', COALESCE((
      SELECT jsonb_agg(row_to_json(x)) FROM (
        SELECT p.user_id, p.name, p.email, tm.team_id, t.name AS team_name
        FROM public.profiles p
        JOIN public.team_members tm ON tm.user_id = p.user_id
        LEFT JOIN public.teams t ON t.id = tm.team_id
        WHERE p.name ILIKE pat OR p.email ILIKE pat
        ORDER BY p.created_at DESC
        LIMIT 8
      ) x
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_search(text) TO authenticated;
