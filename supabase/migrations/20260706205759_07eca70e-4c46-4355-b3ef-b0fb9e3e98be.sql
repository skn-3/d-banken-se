
DROP POLICY IF EXISTS "Public read certificates" ON public.certificates;
REVOKE ALL ON public.certificates FROM anon;

CREATE OR REPLACE FUNCTION public.get_certificate_public(p_verification_id text)
RETURNS TABLE (
  verification_id text, recipient_name text, tree_count integer,
  location_name text, latitude numeric, longitude numeric,
  issued_date timestamptz, template_snapshot jsonb, greeting text, theme_slug text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.verification_id, c.recipient_name, c.tree_count,
         c.location_name, c.latitude, c.longitude,
         c.issued_date, c.template_snapshot, c.greeting, gt.slug
  FROM public.certificates c
  LEFT JOIN public.purchases p ON p.id = c.purchase_id
  LEFT JOIN public.greeting_themes gt ON gt.id = p.theme_id
  WHERE c.verification_id = p_verification_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_certificate_public(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_certificate_public(text) TO anon, authenticated;
DROP FUNCTION IF EXISTS public.get_public_certificate(text);

ALTER TABLE public.cert_templates
  ALTER COLUMN bg_url DROP NOT NULL,
  ALTER COLUMN bg_url SET DEFAULT NULL;

ALTER TABLE public.cert_templates
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#1E9E6A',
  ADD COLUMN IF NOT EXISTS heading_text text NOT NULL DEFAULT 'VÄRDEBEVIS',
  ADD COLUMN IF NOT EXISTS body_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_key text NOT NULL DEFAULT 'mint',
  ADD COLUMN IF NOT EXISTS show_coordinates boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_social boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS social_handles text NOT NULL DEFAULT '@smartklimat',
  ADD COLUMN IF NOT EXISTS company_user_id uuid,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS cert_templates_one_default
  ON public.cert_templates (is_default) WHERE is_default = true;

INSERT INTO public.cert_templates (
  id, slug, namn, sort, aktiv, bg_url, kort_url, falt, allows_greeting, canvas,
  name, logo_url, accent_color, heading_text, body_text, background_key,
  show_coordinates, show_social, social_handles, company_user_id,
  is_default, category, config, org_id, thumbnail_url, created_at, updated_at
)
SELECT
  ct.id,
  'legacy-' || regexp_replace(lower(ct.name), '[^a-z0-9]+', '-', 'g'),
  ct.name, ct.sort, false, NULL, NULL, '{}'::jsonb, false,
  '{"w":1240,"h":1754}'::jsonb,
  ct.name, ct.logo_url, ct.accent_color, ct.heading_text, ct.body_text,
  ct.background_key, ct.show_coordinates, ct.show_social, ct.social_handles,
  ct.company_user_id, ct.is_default, ct.category, ct.config, ct.org_id,
  ct.thumbnail_url, ct.created_at, ct.updated_at
FROM public.certificate_templates ct
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.certificates
  DROP CONSTRAINT IF EXISTS certificates_template_id_fkey,
  ADD CONSTRAINT certificates_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES public.cert_templates(id) ON DELETE SET NULL;

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_certificate_template_id_fkey,
  ADD CONSTRAINT purchases_certificate_template_id_fkey
    FOREIGN KEY (certificate_template_id) REFERENCES public.cert_templates(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_company_template_id_fkey,
  ADD CONSTRAINT profiles_company_template_id_fkey
    FOREIGN KEY (company_template_id) REFERENCES public.cert_templates(id) ON DELETE SET NULL;

ALTER TABLE public.teams DROP COLUMN IF EXISTS certificate_template_id;

DROP FUNCTION IF EXISTS public.generate_certificate(uuid);
CREATE FUNCTION public.generate_certificate(_purchase_id uuid)
RETURNS TABLE (id uuid, verification_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_purchase public.purchases%ROWTYPE;
  v_profile  public.profiles%ROWTYPE;
  v_team     public.teams%ROWTYPE;
  v_template public.cert_templates%ROWTYPE;
  v_team_template public.cert_templates%ROWTYPE;
  v_settings public.app_settings%ROWTYPE;
  v_verif text; v_cert_id uuid; v_snapshot jsonb;
BEGIN
  SELECT * INTO v_purchase FROM public.purchases WHERE id = _purchase_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase % not found', _purchase_id; END IF;

  IF v_purchase.certificate_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM public.cert_templates WHERE id = v_purchase.certificate_template_id;
  END IF;

  IF v_template.id IS NULL AND v_purchase.registered_by_user_id IS NOT NULL THEN
    SELECT t.* INTO v_team
      FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
     WHERE tm.user_id = v_purchase.registered_by_user_id
     ORDER BY tm.joined_at ASC NULLS LAST LIMIT 1;
    IF v_team.id IS NOT NULL AND v_team.cert_template_id IS NOT NULL THEN
      SELECT * INTO v_team_template FROM public.cert_templates WHERE id = v_team.cert_template_id;
      IF FOUND THEN v_template := v_team_template; END IF;
    END IF;
  END IF;

  IF v_template.id IS NULL AND v_purchase.customer_id IS NOT NULL THEN
    SELECT p.* INTO v_profile
      FROM public.customers c
      JOIN public.profiles p ON p.user_id = c.account_user_id
     WHERE c.id = v_purchase.customer_id;
    IF v_profile.user_id IS NOT NULL AND v_profile.company_template_id IS NOT NULL THEN
      SELECT * INTO v_template FROM public.cert_templates WHERE id = v_profile.company_template_id;
    END IF;
  END IF;

  IF v_template.id IS NULL THEN
    SELECT * INTO v_template FROM public.cert_templates WHERE is_default = true LIMIT 1;
  END IF;
  IF v_template.id IS NULL THEN
    SELECT * INTO v_template FROM public.cert_templates ORDER BY sort ASC LIMIT 1;
  END IF;
  IF v_template.id IS NULL THEN
    RAISE EXCEPTION 'No certificate template available';
  END IF;

  SELECT * INTO v_settings FROM public.app_settings WHERE id = 1;

  v_verif := 'SK-' || to_char(now(), 'YYYY') || '-' ||
             upper(substr(md5(random()::text || _purchase_id::text), 1, 6));

  v_snapshot := jsonb_build_object(
    'template_id', v_template.id,
    'template_slug', v_template.slug,
    'template_name', COALESCE(v_template.name, v_template.namn),
    'category', v_template.category,
    'logo_url', v_template.logo_url,
    'accent_color', v_template.accent_color,
    'heading_text', v_template.heading_text,
    'body_text', v_template.body_text,
    'background_key', v_template.background_key,
    'show_coordinates', v_template.show_coordinates,
    'show_social', v_template.show_social,
    'social_handles', v_template.social_handles,
    'config', v_template.config,
    'bg_url', v_template.bg_url,
    'kort_url', v_template.kort_url,
    'falt', v_template.falt,
    'canvas', v_template.canvas
  );

  INSERT INTO public.certificates (
    purchase_id, user_id, customer_id, template_id,
    verification_id, recipient_name, tree_count,
    location_name, latitude, longitude,
    template_snapshot, greeting, issued_date
  ) VALUES (
    v_purchase.id, v_purchase.user_id, v_purchase.customer_id, v_template.id,
    v_verif, v_purchase.recipient_name, v_purchase.tree_count,
    COALESCE(v_settings.planting_location_name, 'Luanshya, Copperbelt, Zambia'),
    COALESCE(v_settings.planting_latitude, -13.1367),
    COALESCE(v_settings.planting_longitude, 28.4183),
    v_snapshot, v_purchase.greeting, now()
  ) RETURNING certificates.id INTO v_cert_id;

  RETURN QUERY SELECT v_cert_id, v_verif;
END $$;

DROP TABLE IF EXISTS public.certificate_templates CASCADE;

CREATE TABLE public.team_join_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_join_attempts_user_time_idx
  ON public.team_join_attempts (user_id, attempted_at DESC);
GRANT SELECT, INSERT ON public.team_join_attempts TO authenticated;
GRANT ALL ON public.team_join_attempts TO service_role;
ALTER TABLE public.team_join_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own attempts" ON public.team_join_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own attempts" ON public.team_join_attempts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
