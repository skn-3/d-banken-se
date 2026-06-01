
-- 1) Fix has_role permission so RLS policies can call it for anon/authenticated/service_role
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

-- 2) Customers: the central identity is email. One row per unique email.
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  account_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all customers" ON public.customers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users view own customer by email" ON public.customers
  FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce(auth.jwt()->>'email','')));

-- 3) Purchases: relax user_id, add customer/recipient fields
ALTER TABLE public.purchases ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.purchases
  ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN recipient_name text,
  ADD COLUMN recipient_email text,
  ADD COLUMN registered_by_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_purchases_customer ON public.purchases(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_recipient_email ON public.purchases(lower(recipient_email));

-- Allow logged-in users to view their own purchases by email match too
CREATE POLICY "Users view own purchases by email" ON public.purchases
  FOR SELECT TO authenticated
  USING (lower(coalesce(recipient_email,'')) = lower(coalesce(auth.jwt()->>'email','')));

-- 4) Certificates: link directly to customer for cleaner lookups
ALTER TABLE public.certificates
  ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_certificates_customer ON public.certificates(customer_id);

-- 5) Rewrite generate_certificate: works with service-role calls (auth.uid() may be NULL),
--    uses purchase.recipient_name when present, and populates customer_id.
CREATE OR REPLACE FUNCTION public.generate_certificate(_purchase_id uuid)
RETURNS public.certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_purchase public.purchases%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_template public.certificate_templates%ROWTYPE;
  v_settings public.app_settings%ROWTYPE;
  v_existing public.certificates%ROWTYPE;
  v_verification TEXT;
  v_year TEXT;
  v_snapshot JSONB;
  v_result public.certificates%ROWTYPE;
  v_recipient TEXT;
BEGIN
  SELECT * INTO v_purchase FROM public.purchases WHERE id = _purchase_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;

  -- Authorize: allow service-role (auth.uid() IS NULL), the buyer (legacy user_id),
  -- the customer's linked account, or an admin.
  IF auth.uid() IS NOT NULL THEN
    IF NOT (
      v_purchase.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = v_purchase.customer_id AND c.account_user_id = auth.uid())
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    ) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  IF v_purchase.status <> 'paid' THEN
    RAISE EXCEPTION 'Purchase not paid';
  END IF;

  SELECT * INTO v_existing FROM public.certificates WHERE purchase_id = _purchase_id;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT * INTO v_customer FROM public.customers WHERE id = v_purchase.customer_id;

  -- Template selection: default for now
  SELECT * INTO v_template FROM public.certificate_templates WHERE is_default = true LIMIT 1;
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

  v_recipient := COALESCE(v_purchase.recipient_name, v_customer.name, 'Privatperson');

  INSERT INTO public.certificates (
    purchase_id, user_id, customer_id, verification_id, recipient_name, tree_count,
    location_name, latitude, longitude, template_snapshot
  ) VALUES (
    v_purchase.id, v_purchase.user_id, v_purchase.customer_id, v_verification,
    v_recipient, v_purchase.tree_count,
    v_settings.planting_location_name, v_settings.planting_latitude, v_settings.planting_longitude,
    v_snapshot
  ) RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.generate_certificate(uuid) TO service_role;
