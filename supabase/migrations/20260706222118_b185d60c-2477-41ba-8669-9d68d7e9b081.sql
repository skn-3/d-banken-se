
-- SEC-2: Härda RLS/policies/views/functions

-- 1) PURCHASES: droppa klient-INSERT-policies. All skapande går via serverfn (service_role).
DROP POLICY IF EXISTS "Users create own purchases" ON public.purchases;
DROP POLICY IF EXISTS "Sellers create attributed purchases" ON public.purchases;

-- 2) REWARD_ORDERS + POINT_TRANSACTIONS: default deny för klientskrivning
DROP POLICY IF EXISTS orders_insert_own_seller ON public.reward_orders;
DROP POLICY IF EXISTS orders_update_leader_deliver ON public.reward_orders;
DROP POLICY IF EXISTS orders_update_admin ON public.reward_orders;

-- 3) VYER: security_invoker + revoke där ej lämpligt för klient
ALTER VIEW public.admin_greetings_view    SET (security_invoker = true);
ALTER VIEW public.register_rader          SET (security_invoker = true);
ALTER VIEW public.register_kunder         SET (security_invoker = true);
ALTER VIEW public.stats_trad_per_manad    SET (security_invoker = true);
ALTER VIEW public.stats_trad_per_kalla    SET (security_invoker = true);
ALTER VIEW public.stats_trad_per_projekt  SET (security_invoker = true);

REVOKE SELECT ON public.admin_greetings_view FROM anon, authenticated;
REVOKE SELECT ON public.register_rader       FROM anon, authenticated;
REVOKE SELECT ON public.register_kunder      FROM anon, authenticated;
GRANT SELECT ON public.admin_greetings_view TO service_role;
GRANT SELECT ON public.register_rader       TO service_role;
GRANT SELECT ON public.register_kunder      TO service_role;

-- 4) ORG-KATALOGEN: droppa öppen policy, ersätt med RPC
DROP POLICY IF EXISTS "Authenticated read organizations for search" ON public.organizations;

CREATE OR REPLACE FUNCTION public.search_organizations(q text)
RETURNS TABLE(id uuid, name text, type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id, o.name, o.type
  FROM public.organizations o
  WHERE auth.uid() IS NOT NULL
    AND (
      COALESCE(NULLIF(btrim(q), ''), '') = ''
      OR o.name ILIKE '%' || q || '%'
    )
  ORDER BY o.name
  LIMIT 20;
$$;
REVOKE EXECUTE ON FUNCTION public.search_organizations(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.search_organizations(text) TO authenticated;

-- 6) MATERIALIZED VIEW: dölj för Data API
REVOKE SELECT ON public.insights_daily_trees FROM anon, authenticated;
GRANT  SELECT ON public.insights_daily_trees TO service_role;

-- 7) EXECUTE-städning
-- 7a) REVOKE FROM authenticated på admin_insights_* (defense in depth — de gatar internt)
REVOKE EXECUTE ON FUNCTION public.admin_insights_channel_mix_30d()   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_insights_kpis()              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_insights_recipients()        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_insights_risk_queues()       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_insights_sales_engine()      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_insights_top_teams_week()    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_insights_treebank()          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_insights_weekly_series()     FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_insights_channel_mix_30d()   TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_insights_kpis()              TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_insights_recipients()        TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_insights_risk_queues()       TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_insights_sales_engine()      TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_insights_top_teams_week()    TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_insights_treebank()          TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_insights_weekly_series()     TO service_role;

-- 7b) REVOKE FROM anon på övriga SECURITY DEFINER RPCs (utom get_certificate_public,
--     RLS-hjälpare has_role/is_team_leader/_user_team_id/_assert_admin, och
--     lookup_team_by_code som används av anon-onboarding)
REVOKE EXECUTE ON FUNCTION public.admin_replace_greeting(uuid, text)             FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_search(text)                             FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_bump_ai_usage(text, integer)             FROM anon;
REVOKE EXECUTE ON FUNCTION public.activate_seller_boost(uuid)                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_achievement(uuid, text, jsonb)           FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_lov(uuid, integer, text, text)           FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_seller_boost(uuid, text, text, integer, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_deal(uuid)                               FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_team_self_service(text, uuid, text, text, text, text, uuid, boolean, integer, date, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_team_self_service(uuid, text, text, text, uuid, boolean, integer, date, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_certificate(uuid)                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_internal_secret(text)                      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_club()                                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_national_activity_feed(integer)            FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_team_activity_feed(integer)                FROM anon;
REVOKE EXECUTE ON FUNCTION public.join_team_by_code(text)                        FROM anon;
REVOKE EXECUTE ON FUNCTION public.leader_reset_member_photo(uuid)                FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_admin_activity(text, jsonb)                FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_seller_weekly_streaks()                FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_weekly_achievements()                  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purchase_reward(uuid)                          FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_insights_daily_trees()                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seller_points_balance(uuid)                    FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_internal_secret(text)                      TO service_role;
GRANT  EXECUTE ON FUNCTION public.process_seller_weekly_streaks()                TO service_role;
GRANT  EXECUTE ON FUNCTION public.process_weekly_achievements()                  TO service_role;
GRANT  EXECUTE ON FUNCTION public.refresh_insights_daily_trees()                 TO service_role;
