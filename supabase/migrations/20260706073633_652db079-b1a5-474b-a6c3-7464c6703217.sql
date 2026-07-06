
-- ============ certificate_templates: add columns ============
ALTER TABLE public.certificate_templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort int NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allows_greeting boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'certificate_templates_category_check') THEN
    ALTER TABLE public.certificate_templates
      ADD CONSTRAINT certificate_templates_category_check
      CHECK (category IN ('standard','tillval','org'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS certificate_templates_active_sort_idx
  ON public.certificate_templates(active, category, sort);

-- ============ purchases + certificates: template + greeting ============
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS certificate_template_id uuid REFERENCES public.certificate_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS greeting text;

ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.certificate_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS greeting text;

-- Length guard for greeting (via trigger, not CHECK)
CREATE OR REPLACE FUNCTION public._validate_greeting()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.greeting IS NOT NULL AND length(NEW.greeting) > 120 THEN
    RAISE EXCEPTION 'Greeting exceeds 120 characters';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_greeting_purchases ON public.purchases;
CREATE TRIGGER validate_greeting_purchases BEFORE INSERT OR UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public._validate_greeting();

DROP TRIGGER IF EXISTS validate_greeting_certificates ON public.certificates;
CREATE TRIGGER validate_greeting_certificates BEFORE INSERT OR UPDATE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public._validate_greeting();

-- ============ greeting_blocklist ============
CREATE TABLE IF NOT EXISTS public.greeting_blocklist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  word text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.greeting_blocklist TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.greeting_blocklist TO authenticated;
GRANT ALL ON public.greeting_blocklist TO service_role;

ALTER TABLE public.greeting_blocklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read blocklist" ON public.greeting_blocklist;
CREATE POLICY "Auth read blocklist" ON public.greeting_blocklist
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin write blocklist" ON public.greeting_blocklist;
CREATE POLICY "Admin write blocklist" ON public.greeting_blocklist
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

INSERT INTO public.greeting_blocklist(word) VALUES
  ('fuck'),('shit'),('kuk'),('fitta'),('hora'),('jävla'),('idiot'),('bitch'),('nigger'),('bög')
ON CONFLICT (word) DO NOTHING;

-- ============ Admin view for greetings ============
CREATE OR REPLACE VIEW public.admin_greetings_view
WITH (security_invoker = true)
AS
SELECT
  p.id AS purchase_id,
  p.greeting AS purchase_greeting,
  p.created_at AS purchase_created_at,
  p.user_id,
  p.recipient_email,
  p.certificate_template_id,
  t.name AS template_name,
  c.id AS certificate_id,
  c.greeting AS certificate_greeting,
  c.verification_id,
  c.recipient_name,
  c.tree_count
FROM public.purchases p
LEFT JOIN public.certificate_templates t ON t.id = p.certificate_template_id
LEFT JOIN public.certificates c ON c.purchase_id = p.id
WHERE p.greeting IS NOT NULL OR c.greeting IS NOT NULL;

GRANT SELECT ON public.admin_greetings_view TO authenticated;

-- ============ Update generate_certificate to include config + greeting + template_id ============
CREATE OR REPLACE FUNCTION public.generate_certificate(_purchase_id uuid)
RETURNS public.certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.purchases%ROWTYPE;
  v_profile  public.profiles%ROWTYPE;
  v_team     public.teams%ROWTYPE;
  v_team_template public.certificate_templates%ROWTYPE;
  v_template public.certificate_templates%ROWTYPE;
  v_settings public.app_settings%ROWTYPE;
  v_existing public.certificates%ROWTYPE;
  v_verification text;
  v_year text;
  v_snapshot jsonb;
  v_result public.certificates%ROWTYPE;
BEGIN
  SELECT * INTO v_purchase FROM public.purchases WHERE id = _purchase_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;

  IF v_purchase.user_id IS NOT NULL
     AND v_purchase.user_id <> auth.uid()
     AND NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_purchase.status <> 'paid' THEN
    RAISE EXCEPTION 'Purchase not paid';
  END IF;

  SELECT * INTO v_existing FROM public.certificates WHERE purchase_id = _purchase_id;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_purchase.user_id;

  -- Explicit template on purchase wins
  IF v_purchase.certificate_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM public.certificate_templates
      WHERE id = v_purchase.certificate_template_id;
  END IF;

  -- Team template
  IF v_template.id IS NULL AND v_purchase.registered_by_user_id IS NOT NULL THEN
    SELECT t.* INTO v_team FROM public.teams t
      JOIN public.team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = v_purchase.registered_by_user_id LIMIT 1;
    IF v_team.id IS NOT NULL AND v_team.certificate_template_id IS NOT NULL THEN
      SELECT * INTO v_team_template FROM public.certificate_templates
        WHERE id = v_team.certificate_template_id;
      IF FOUND THEN v_template := v_team_template; END IF;
    END IF;
  END IF;

  -- Company template
  IF v_template.id IS NULL AND v_profile.company_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM public.certificate_templates
      WHERE id = v_profile.company_template_id;
  END IF;

  -- Default
  IF v_template.id IS NULL THEN
    SELECT * INTO v_template FROM public.certificate_templates
      WHERE is_default = true AND active = true LIMIT 1;
  END IF;
  IF v_template.id IS NULL THEN
    SELECT * INTO v_template FROM public.certificate_templates
      WHERE active = true ORDER BY sort ASC, created_at ASC LIMIT 1;
  END IF;
  IF v_template.id IS NULL THEN
    RAISE EXCEPTION 'No certificate template available';
  END IF;

  SELECT * INTO v_settings FROM public.app_settings WHERE id = 1;

  v_year := to_char(now(),'YYYY');
  v_verification := 'SK-' || v_year || '-' || lpad(nextval('public.certificate_seq')::text, 4, '0');

  v_snapshot := jsonb_build_object(
    'template_id', v_template.id,
    'template_name', v_template.name,
    'category', v_template.category,
    'logo_url', v_template.logo_url,
    'accent_color', v_template.accent_color,
    'heading_text', v_template.heading_text,
    'body_text', v_template.body_text,
    'background_key', v_template.background_key,
    'show_coordinates', v_template.show_coordinates,
    'show_social', v_template.show_social,
    'social_handles', v_template.social_handles,
    'config', COALESCE(v_template.config, '{}'::jsonb),
    'allows_greeting', v_template.allows_greeting
  );

  INSERT INTO public.certificates (
    purchase_id, user_id, verification_id, recipient_name, tree_count,
    location_name, latitude, longitude, template_snapshot,
    template_id, greeting
  ) VALUES (
    v_purchase.id, v_purchase.user_id, v_verification,
    COALESCE(v_profile.name,'Privatperson'),
    v_purchase.tree_count,
    v_settings.planting_location_name, v_settings.planting_latitude, v_settings.planting_longitude,
    v_snapshot,
    v_template.id,
    CASE WHEN v_template.allows_greeting THEN v_purchase.greeting ELSE NULL END
  ) RETURNING * INTO v_result;

  RETURN v_result;
END $$;

-- ============ Admin: replace greeting + regenerate certificate ============
CREATE OR REPLACE FUNCTION public.admin_replace_greeting(_certificate_id uuid, _new_greeting text)
RETURNS public.certificates
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_cert public.certificates%ROWTYPE;
BEGIN
  PERFORM public._assert_admin();
  IF _new_greeting IS NOT NULL AND length(_new_greeting) > 120 THEN
    RAISE EXCEPTION 'Greeting exceeds 120 characters';
  END IF;
  UPDATE public.certificates SET greeting = _new_greeting
    WHERE id = _certificate_id
    RETURNING * INTO v_cert;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificate not found'; END IF;
  INSERT INTO public.admin_activity(user_id, action, detail)
    VALUES (auth.uid(), 'greeting_replaced',
      jsonb_build_object('certificate_id', _certificate_id, 'new_greeting', _new_greeting));
  RETURN v_cert;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_replace_greeting(uuid, text) TO authenticated;

-- ============ Seed 4 tillval templates ============
INSERT INTO public.certificate_templates
  (name, category, accent_color, heading_text, background_key, allows_greeting, active, sort, config, is_default)
VALUES
  ('KALASET','tillval','#E94A6B','VÄRDEBEVIS','kalas', true, true, 200,
    jsonb_build_object('tema','kalas','motiv','konfetti_ballonger','ram','ingen','highlight','trad_stort',
      'visa_falt', jsonb_build_object('co2',true,'plats',true,'datum',true,'karta',false),
      'badge_position','top-right'), false),
  ('MIDNATTSSKOGEN','tillval','#7BA3D9','VÄRDEBEVIS','midnatt', true, true, 210,
    jsonb_build_object('tema','midnatt','motiv','stjarnhimmel','ram','guldlinje','highlight','trad_stort',
      'visa_falt', jsonb_build_object('co2',true,'plats',true,'datum',true,'karta',true),
      'badge_position','top-right'), false),
  ('DJURFADDERN','tillval','#C48A3B','VÄRDEBEVIS','papper_guld', true, true, 220,
    jsonb_build_object('tema','papper_guld','motiv','projektdjur','ram','dubbel','highlight','plats_stort',
      'visa_falt', jsonb_build_object('co2',true,'plats',true,'datum',true,'karta',true),
      'badge_position','bottom-right'), false),
  ('VINTERGÅVAN','tillval','#4E7A5C','VÄRDEBEVIS','vinter', true, true, 230,
    jsonb_build_object('tema','vinter','motiv','snoflingor_granar','ram','guldlinje','highlight','co2_stort',
      'visa_falt', jsonb_build_object('co2',true,'plats',true,'datum',true,'karta',false),
      'badge_position','top-right'), false)
ON CONFLICT DO NOTHING;

-- Backfill defaults on existing standard template
UPDATE public.certificate_templates
  SET category = 'standard', active = true, sort = 100
  WHERE category IS NULL OR category = '';
