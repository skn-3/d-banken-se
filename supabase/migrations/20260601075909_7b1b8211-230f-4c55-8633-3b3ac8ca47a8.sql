-- =========================================================
-- Certificate templates
-- =========================================================
CREATE TABLE public.certificate_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  accent_color TEXT NOT NULL DEFAULT '#1E9E6A',
  heading_text TEXT NOT NULL DEFAULT 'VÄRDEBEVIS',
  body_text TEXT NOT NULL DEFAULT 'Detta värdebevis intygar att ovanstående person har bidragit till plantering av träd genom SmartKlimat. Träden planteras på riktigt och växer i många decennier framåt — för klimatet, för den biologiska mångfalden och för människorna som lever av skogen.',
  background_key TEXT NOT NULL DEFAULT 'mint',
  show_coordinates BOOLEAN NOT NULL DEFAULT true,
  show_social BOOLEAN NOT NULL DEFAULT true,
  social_handles TEXT NOT NULL DEFAULT '@smartklimat',
  company_user_id UUID,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.certificate_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.certificate_templates TO authenticated;
GRANT ALL ON public.certificate_templates TO service_role;

ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read templates"
ON public.certificate_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins insert templates"
ON public.certificate_templates FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update templates"
ON public.certificate_templates FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete templates"
ON public.certificate_templates FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Only one default template enforced via partial unique index
CREATE UNIQUE INDEX certificate_templates_one_default
  ON public.certificate_templates ((is_default)) WHERE is_default = true;

-- =========================================================
-- App settings (single row, current planting location)
-- =========================================================
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  planting_location_name TEXT NOT NULL DEFAULT 'Luanshya, Copperbelt, Zambia',
  planting_latitude NUMERIC(9,6) NOT NULL DEFAULT -13.136700,
  planting_longitude NUMERIC(9,6) NOT NULL DEFAULT 28.418300,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone read settings"
ON public.app_settings FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins insert settings"
ON public.app_settings FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update settings"
ON public.app_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.app_settings (id) VALUES (1);

-- =========================================================
-- profiles: link to a company template
-- =========================================================
ALTER TABLE public.profiles
  ADD COLUMN company_template_id UUID REFERENCES public.certificate_templates(id) ON DELETE SET NULL;

-- =========================================================
-- Certificates
-- =========================================================
CREATE SEQUENCE public.certificate_seq;

CREATE TABLE public.certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  verification_id TEXT NOT NULL UNIQUE,
  recipient_name TEXT NOT NULL,
  tree_count INTEGER NOT NULL,
  location_name TEXT NOT NULL,
  latitude NUMERIC(9,6) NOT NULL,
  longitude NUMERIC(9,6) NOT NULL,
  issued_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  template_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX certificates_user_id_idx ON public.certificates(user_id);
CREATE INDEX certificates_verification_id_idx ON public.certificates(verification_id);

GRANT SELECT ON public.certificates TO anon, authenticated;
GRANT INSERT ON public.certificates TO authenticated;
GRANT ALL ON public.certificates TO service_role;

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Public verification: anyone can SELECT (the snapshot only holds non-sensitive content)
CREATE POLICY "Public read certificates"
ON public.certificates FOR SELECT TO anon, authenticated USING (true);

-- Inserts happen via SECURITY DEFINER function; deny direct
CREATE POLICY "Admins insert certificates"
ON public.certificates FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- generate_certificate function
-- =========================================================
CREATE OR REPLACE FUNCTION public.generate_certificate(_purchase_id UUID)
RETURNS public.certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.purchases%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_template public.certificate_templates%ROWTYPE;
  v_settings public.app_settings%ROWTYPE;
  v_existing public.certificates%ROWTYPE;
  v_verification TEXT;
  v_year TEXT;
  v_snapshot JSONB;
  v_result public.certificates%ROWTYPE;
BEGIN
  SELECT * INTO v_purchase FROM public.purchases WHERE id = _purchase_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;

  -- Auth: caller must be owner of purchase or admin
  IF v_purchase.user_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_purchase.status <> 'paid' THEN
    RAISE EXCEPTION 'Purchase not paid';
  END IF;

  -- Return existing if already generated
  SELECT * INTO v_existing FROM public.certificates WHERE purchase_id = _purchase_id;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_purchase.user_id;

  -- Pick template: company match or default
  IF v_profile.company_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM public.certificate_templates WHERE id = v_profile.company_template_id;
  END IF;
  IF NOT FOUND OR v_template.id IS NULL THEN
    SELECT * INTO v_template FROM public.certificate_templates WHERE is_default = true LIMIT 1;
  END IF;
  IF NOT FOUND OR v_template.id IS NULL THEN
    SELECT * INTO v_template FROM public.certificate_templates ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF v_template.id IS NULL THEN
    RAISE EXCEPTION 'No certificate template available';
  END IF;

  SELECT * INTO v_settings FROM public.app_settings WHERE id = 1;

  v_year := to_char(now(), 'YYYY');
  v_verification := 'SK-' || v_year || '-' || lpad(nextval('public.certificate_seq')::text, 4, '0');

  v_snapshot := jsonb_build_object(
    'template_id', v_template.id,
    'template_name', v_template.name,
    'logo_url', v_template.logo_url,
    'accent_color', v_template.accent_color,
    'heading_text', v_template.heading_text,
    'body_text', v_template.body_text,
    'background_key', v_template.background_key,
    'show_coordinates', v_template.show_coordinates,
    'show_social', v_template.show_social,
    'social_handles', v_template.social_handles
  );

  INSERT INTO public.certificates (
    purchase_id, user_id, verification_id, recipient_name, tree_count,
    location_name, latitude, longitude, template_snapshot
  ) VALUES (
    v_purchase.id, v_purchase.user_id, v_verification,
    COALESCE(v_profile.name, 'Privatperson'),
    v_purchase.tree_count,
    v_settings.planting_location_name, v_settings.planting_latitude, v_settings.planting_longitude,
    v_snapshot
  ) RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_certificate(UUID) TO authenticated;

-- =========================================================
-- Seed default template
-- =========================================================
INSERT INTO public.certificate_templates (name, accent_color, heading_text, background_key, is_default)
VALUES ('Standard', '#1E9E6A', 'VÄRDEBEVIS', 'mint', true);
