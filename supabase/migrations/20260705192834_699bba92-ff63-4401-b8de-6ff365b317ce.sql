
CREATE OR REPLACE FUNCTION public.lookup_team_by_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
  v_org_name text;
BEGIN
  IF _code IS NULL OR length(trim(_code)) = 0 THEN RETURN NULL; END IF;
  SELECT * INTO v_team FROM public.teams WHERE join_code = upper(trim(_code)) LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_team.organization_id;
  RETURN jsonb_build_object(
    'id', v_team.id,
    'name', v_team.name,
    'project_location', v_team.project_location,
    'goal_trees', v_team.goal_trees,
    'goal_end_date', v_team.goal_end_date,
    'organization_name', v_org_name,
    'city', v_team.city
  );
END $$;

GRANT EXECUTE ON FUNCTION public.lookup_team_by_code(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.join_team_by_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_team public.teams%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Inte inloggad'; END IF;
  IF _code IS NULL OR length(trim(_code)) = 0 THEN RAISE EXCEPTION 'Lagkod krävs'; END IF;
  SELECT * INTO v_team FROM public.teams WHERE join_code = upper(trim(_code)) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ogiltig lagkod'; END IF;

  INSERT INTO public.team_members(team_id, user_id, role)
  VALUES (v_team.id, v_uid, 'seller')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles(user_id, role)
  VALUES (v_uid, 'seller'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object('team_id', v_team.id, 'team_name', v_team.name);
END $$;

GRANT EXECUTE ON FUNCTION public.join_team_by_code(text) TO authenticated;
