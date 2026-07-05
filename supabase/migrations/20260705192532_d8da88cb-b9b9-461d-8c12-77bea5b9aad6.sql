
-- Team self-service registration: add columns, RLS for team leaders, and helper functions.

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS project_location text,
  ADD COLUMN IF NOT EXISTS certificate_template_id uuid REFERENCES public.certificate_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS show_team_name_on_certificate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS goal_trees integer,
  ADD COLUMN IF NOT EXISTS goal_end_date date,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS join_code text,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS teams_join_code_unique ON public.teams(join_code) WHERE join_code IS NOT NULL;

-- RLS: team leaders read/update their own team
CREATE POLICY "Leader reads own team"
  ON public.teams FOR SELECT
  USING (created_by_user_id = auth.uid());

CREATE POLICY "Leader updates own team"
  ON public.teams FOR UPDATE
  USING (created_by_user_id = auth.uid())
  WITH CHECK (created_by_user_id = auth.uid());

-- team_members: leader can read all members of teams they created
CREATE POLICY "Leader reads own team members"
  ON public.team_members FOR SELECT
  USING (team_id IN (SELECT id FROM public.teams WHERE created_by_user_id = auth.uid()));

-- organizations: authenticated users can search (read id/name/type)
CREATE POLICY "Authenticated read organizations for search"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (true);

-- Self-service team creation (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.create_team_self_service(
  _team_name text,
  _organization_id uuid,
  _new_organization_name text,
  _new_organization_type text,
  _city text,
  _project_location text,
  _certificate_template_id uuid,
  _show_team_name boolean,
  _goal_trees integer,
  _goal_end_date date,
  _weekly_goal_trees integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid := _organization_id;
  v_team_id uuid;
  v_code text;
  v_attempt int := 0;
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_ok boolean := false;
  i int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Inte inloggad';
  END IF;

  IF _team_name IS NULL OR length(trim(_team_name)) = 0 THEN
    RAISE EXCEPTION 'Lagnamn krävs';
  END IF;

  IF v_org_id IS NULL THEN
    IF _new_organization_name IS NULL OR length(trim(_new_organization_name)) = 0 THEN
      RAISE EXCEPTION 'Organisation krävs';
    END IF;
    INSERT INTO public.organizations(name, type)
    VALUES (trim(_new_organization_name), COALESCE(NULLIF(_new_organization_type,''), 'company'))
    RETURNING id INTO v_org_id;
  END IF;

  -- Generate unique 6-char join_code
  WHILE NOT v_ok AND v_attempt < 20 LOOP
    v_attempt := v_attempt + 1;
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, (floor(random() * length(v_alphabet))::int) + 1, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.teams WHERE join_code = v_code) THEN
      v_ok := true;
    END IF;
  END LOOP;
  IF NOT v_ok THEN RAISE EXCEPTION 'Kunde inte generera lagkod'; END IF;

  INSERT INTO public.teams(
    organization_id, name, city, project_location, certificate_template_id,
    show_team_name_on_certificate, goal_trees, goal_end_date,
    weekly_goal_trees, join_code, created_by_user_id
  ) VALUES (
    v_org_id, trim(_team_name), NULLIF(trim(COALESCE(_city,'')),''),
    NULLIF(trim(COALESCE(_project_location,'')),''),
    _certificate_template_id,
    COALESCE(_show_team_name, false),
    _goal_trees, _goal_end_date,
    COALESCE(_weekly_goal_trees, 0),
    v_code, v_user_id
  ) RETURNING id INTO v_team_id;

  -- Add creator as team member and grant team_leader role
  INSERT INTO public.team_members(team_id, user_id, role)
  VALUES (v_team_id, v_user_id, 'leader')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles(user_id, role)
  VALUES (v_user_id, 'team_leader'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object(
    'team_id', v_team_id,
    'organization_id', v_org_id,
    'join_code', v_code
  );
END $$;

GRANT EXECUTE ON FUNCTION public.create_team_self_service(text,uuid,text,text,text,text,uuid,boolean,integer,date,integer) TO authenticated;

-- Update team by leader (RPC to bypass column restrictions safely)
CREATE OR REPLACE FUNCTION public.update_team_self_service(
  _team_id uuid,
  _team_name text,
  _city text,
  _project_location text,
  _certificate_template_id uuid,
  _show_team_name boolean,
  _goal_trees integer,
  _goal_end_date date,
  _weekly_goal_trees integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Inte inloggad'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = _team_id AND created_by_user_id = v_uid) THEN
    RAISE EXCEPTION 'Inte auktoriserad';
  END IF;
  UPDATE public.teams SET
    name = COALESCE(NULLIF(trim(_team_name),''), name),
    city = NULLIF(trim(COALESCE(_city,'')),''),
    project_location = NULLIF(trim(COALESCE(_project_location,'')),''),
    certificate_template_id = _certificate_template_id,
    show_team_name_on_certificate = COALESCE(_show_team_name, show_team_name_on_certificate),
    goal_trees = _goal_trees,
    goal_end_date = _goal_end_date,
    weekly_goal_trees = COALESCE(_weekly_goal_trees, weekly_goal_trees)
  WHERE id = _team_id;
END $$;

GRANT EXECUTE ON FUNCTION public.update_team_self_service(uuid,text,text,text,uuid,boolean,integer,date,integer) TO authenticated;

-- Extend generate_certificate to honor team.project_location and team name in snapshot
CREATE OR REPLACE FUNCTION public.generate_certificate(_purchase_id uuid)
 RETURNS certificates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  v_team public.teams%ROWTYPE;
  v_team_template public.certificate_templates%ROWTYPE;
  v_location TEXT;
  v_seller_name TEXT;
BEGIN
  SELECT * INTO v_purchase FROM public.purchases WHERE id = _purchase_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;

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

  -- Look up seller's team (if any) via team_members
  IF v_purchase.registered_by_user_id IS NOT NULL THEN
    SELECT t.* INTO v_team
    FROM public.teams t
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = v_purchase.registered_by_user_id
    LIMIT 1;
  END IF;

  -- Template selection: team override, else default
  IF v_team.id IS NOT NULL AND v_team.certificate_template_id IS NOT NULL THEN
    SELECT * INTO v_team_template FROM public.certificate_templates WHERE id = v_team.certificate_template_id;
    IF FOUND THEN v_template := v_team_template; END IF;
  END IF;

  IF v_template.id IS NULL THEN
    SELECT * INTO v_template FROM public.certificate_templates WHERE is_default = true LIMIT 1;
  END IF;
  IF v_template.id IS NULL THEN
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

  -- Team name line
  IF v_team.id IS NOT NULL AND COALESCE(v_team.show_team_name_on_certificate, false) THEN
    SELECT COALESCE(p.name, 'säljare') INTO v_seller_name
    FROM public.profiles p WHERE p.user_id = v_purchase.registered_by_user_id;
    v_snapshot := v_snapshot || jsonb_build_object(
      'team_name', v_team.name,
      'seller_name', v_seller_name,
      'sold_by_text', 'Såld av ' || COALESCE(v_seller_name, 'säljare') || ', ' || v_team.name
    );
  END IF;

  v_recipient := COALESCE(v_purchase.recipient_name, v_customer.name, 'Privatperson');

  -- Location: team.project_location wins over app_settings
  v_location := COALESCE(NULLIF(v_team.project_location, ''), v_settings.planting_location_name);

  INSERT INTO public.certificates (
    purchase_id, user_id, customer_id, verification_id, recipient_name, tree_count,
    location_name, latitude, longitude, template_snapshot
  ) VALUES (
    v_purchase.id, v_purchase.user_id, v_purchase.customer_id, v_verification,
    v_recipient, v_purchase.tree_count,
    v_location, v_settings.planting_latitude, v_settings.planting_longitude,
    v_snapshot
  ) RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;
