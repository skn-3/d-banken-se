
-- ============================================================
-- SECURITY HARDENING
-- ============================================================

-- (1) certificates: replace public-read-all with own+admin.
--     Add SECURITY DEFINER rpc for the public /v/:id share page
--     so anon can look up ONE row by verification_id (still safe
--     because we only expose the safe columns).
DROP POLICY IF EXISTS "Public read certificates" ON public.certificates;

CREATE POLICY "Users read own certificates"
ON public.certificates FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = certificates.customer_id AND c.account_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = certificates.customer_id AND lower(c.email) = lower(COALESCE(auth.jwt()->>'email','')))
  OR lower(COALESCE((SELECT recipient_email FROM public.purchases pu WHERE pu.id = certificates.purchase_id),'')) = lower(COALESCE(auth.jwt()->>'email',''))
  OR public.has_role(auth.uid(),'admin'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.get_public_certificate(_verification_id text)
RETURNS TABLE (
  verification_id text,
  recipient_name text,
  tree_count integer,
  location_name text,
  latitude numeric,
  longitude numeric,
  issued_date timestamptz,
  template_snapshot jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.verification_id, c.recipient_name, c.tree_count,
         c.location_name, c.latitude, c.longitude, c.issued_date, c.template_snapshot
  FROM public.certificates c
  WHERE c.verification_id = _verification_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_certificate(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_certificate(text) TO anon, authenticated;

-- (2) Tighten catalog / settings read to authenticated only (no anon).
DROP POLICY IF EXISTS "achievement_catalog readable" ON public.achievement_catalog;
CREATE POLICY "achievement_catalog readable"
ON public.achievement_catalog FOR SELECT TO authenticated USING (active);

DROP POLICY IF EXISTS "read avatars" ON public.avatar_catalog;
CREATE POLICY "read avatars"
ON public.avatar_catalog FOR SELECT TO authenticated USING (active);

DROP POLICY IF EXISTS "Anyone can read boost catalog" ON public.boost_catalog;
CREATE POLICY "Authenticated read boost catalog"
ON public.boost_catalog FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone read settings" ON public.app_settings;
CREATE POLICY "Authenticated read settings"
ON public.app_settings FOR SELECT TO authenticated USING (true);

-- (3) Internal-secret plumbing for push-notify auth.
--     Vault-store a random shared secret, expose via a
--     service-role-only RPC.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'PUSH_NOTIFY_SECRET') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32),'hex'), 'PUSH_NOTIFY_SECRET');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_internal_secret(_name text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claims', true)::jsonb->>'role';
  v text;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT decrypted_secret INTO v FROM vault.decrypted_secrets WHERE name = _name LIMIT 1;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.get_internal_secret(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_internal_secret(text) TO service_role;

-- (4) Trigger sends the shared secret as x-internal-secret so
--     push-notify can reject unsigned callers.
CREATE OR REPLACE FUNCTION public.enqueue_boost_push()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_url text := 'https://project--yakwdirpbwdtsdpxlbkp.lovable.app/api/public/push-notify';
  v_key text;
BEGIN
  IF NEW.status <> 'earned' THEN RETURN NEW; END IF;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='PUSH_NOTIFY_SECRET' LIMIT 1;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', COALESCE(v_key,'')),
    body := jsonb_build_object(
      'kind', CASE WHEN NEW.meta->>'reason' = 'lagturbo' THEN 'team_turbo'
                   WHEN NEW.boost_key = 'nivaboost' THEN 'level_up'
                   ELSE 'boost_earned' END,
      'user_id', NEW.user_id,
      'boost_key', NEW.boost_key,
      'meta', NEW.meta
    )
  );
  RETURN NEW;
END $$;
