CREATE OR REPLACE FUNCTION public.generate_certificate(_purchase_id uuid)
 RETURNS TABLE(id uuid, verification_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_purchase public.purchases%ROWTYPE;
  v_profile  public.profiles%ROWTYPE;
  v_team     public.teams%ROWTYPE;
  v_template public.cert_templates%ROWTYPE;
  v_team_template public.cert_templates%ROWTYPE;
  v_settings public.app_settings%ROWTYPE;
  v_verif text; v_cert_id uuid; v_snapshot jsonb;
BEGIN
  SELECT * INTO v_purchase FROM public.purchases WHERE public.purchases.id = _purchase_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase % not found', _purchase_id; END IF;

  IF v_purchase.certificate_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM public.cert_templates WHERE public.cert_templates.id = v_purchase.certificate_template_id;
  END IF;

  IF v_template.id IS NULL AND v_purchase.registered_by_user_id IS NOT NULL THEN
    SELECT t.* INTO v_team
      FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
     WHERE tm.user_id = v_purchase.registered_by_user_id
     ORDER BY tm.created_at ASC NULLS LAST LIMIT 1;
    IF v_team.id IS NOT NULL AND v_team.cert_template_id IS NOT NULL THEN
      SELECT * INTO v_team_template FROM public.cert_templates WHERE public.cert_templates.id = v_team.cert_template_id;
      IF FOUND THEN v_template := v_team_template; END IF;
    END IF;
  END IF;

  IF v_template.id IS NULL AND v_purchase.customer_id IS NOT NULL THEN
    SELECT p.* INTO v_profile
      FROM public.customers c
      JOIN public.profiles p ON p.user_id = c.account_user_id
     WHERE c.id = v_purchase.customer_id;
    IF v_profile.user_id IS NOT NULL AND v_profile.company_template_id IS NOT NULL THEN
      SELECT * INTO v_template FROM public.cert_templates WHERE public.cert_templates.id = v_profile.company_template_id;
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

  SELECT * INTO v_settings FROM public.app_settings WHERE public.app_settings.id = 1;

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
END $function$;