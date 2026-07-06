
-- 1) Backfill purchases.source
UPDATE public.purchases
SET source = CASE
  WHEN source IS NOT NULL AND source <> '' THEN source
  WHEN registered_by_user_id IS NOT NULL THEN 'smaarty'
  WHEN source_order_ref LIKE 'stripe:invoice:%' THEN 'monthly'
  WHEN source_order_ref LIKE 'stripe:%' THEN 'web'
  ELSE 'web'
END
WHERE source IS NULL OR source = '' OR source LIKE 'stripe:%';

-- Also normalize older 'stripe:engang' / 'stripe:manad' / 'stripe:gava' / 'stripe-manad'
UPDATE public.purchases SET source = 'web'     WHERE source IN ('stripe:engang');
UPDATE public.purchases SET source = 'monthly' WHERE source IN ('stripe:manad','stripe-manad');
UPDATE public.purchases SET source = 'gift'    WHERE source IN ('stripe:gava');

CREATE INDEX IF NOT EXISTS idx_purchases_source_paidat ON public.purchases(source, paid_at DESC);

-- 2) site_events
CREATE TABLE IF NOT EXISTS public.site_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  path  text,
  meta  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_events TO authenticated;
GRANT ALL ON public.site_events TO service_role;
ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read site_events" ON public.site_events;
CREATE POLICY "Admins read site_events" ON public.site_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX IF NOT EXISTS idx_site_events_created ON public.site_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_events_event_created ON public.site_events(event, created_at DESC);

-- 3) Materialiserad vy: träd per dag och kanal
DROP MATERIALIZED VIEW IF EXISTS public.insights_daily_trees;
CREATE MATERIALIZED VIEW public.insights_daily_trees AS
SELECT
  (COALESCE(paid_at, created_at) AT TIME ZONE 'Europe/Stockholm')::date AS day,
  COALESCE(NULLIF(source,''), 'web') AS source,
  SUM(tree_count)::int AS trees,
  SUM(total_amount_ore)::bigint AS revenue_ore
FROM public.purchases
WHERE status = 'paid'
GROUP BY 1, 2;
CREATE UNIQUE INDEX IF NOT EXISTS uq_insights_daily_trees ON public.insights_daily_trees(day, source);
GRANT SELECT ON public.insights_daily_trees TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_insights_daily_trees()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.insights_daily_trees;
END $$;

-- Schedule daily 04:15 UTC
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='insights-daily-refresh') THEN
    PERFORM cron.schedule('insights-daily-refresh','15 4 * * *', $CRON$SELECT public.refresh_insights_daily_trees();$CRON$);
  END IF;
END $$;

-- 4) RPCs (admin-only)
CREATE OR REPLACE FUNCTION public._assert_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_insights_kpis()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Stockholm')::date;
  v_week_start date := v_today - ((EXTRACT(ISODOW FROM v_today)::int) - 1);
  v_prev_week_start date := v_week_start - 7;
  v_month_start date := date_trunc('month', v_today)::date;
  v_28d date := v_today - 28;
  v_trees_total int;
  v_trees_week int;
  v_trees_prev_week int;
  v_active_planters int;
  v_active_monthly int;
  v_revenue_mtd bigint;
  v_sellers_registered int;
  v_sellers_active int;
  v_payout_count int;
  v_payout_amount bigint;
  v_payout_oldest timestamptz;
BEGIN
  PERFORM public._assert_admin();

  SELECT COALESCE(SUM(tree_count),0)::int INTO v_trees_total
    FROM public.purchases WHERE status='paid';
  SELECT COALESCE(SUM(tree_count),0)::int INTO v_trees_week
    FROM public.purchases
    WHERE status='paid'
      AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date >= v_week_start;
  SELECT COALESCE(SUM(tree_count),0)::int INTO v_trees_prev_week
    FROM public.purchases
    WHERE status='paid'
      AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date >= v_prev_week_start
      AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date < v_week_start;
  SELECT COUNT(DISTINCT registered_by_user_id)::int INTO v_active_planters
    FROM public.purchases
    WHERE status='paid' AND registered_by_user_id IS NOT NULL
      AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date >= v_28d;
  SELECT COUNT(DISTINCT customer_id)::int INTO v_active_monthly
    FROM public.purchases
    WHERE status='paid' AND source='monthly' AND customer_id IS NOT NULL
      AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date >= v_28d;
  SELECT COALESCE(SUM(total_amount_ore),0)::bigint INTO v_revenue_mtd
    FROM public.purchases WHERE status='paid'
      AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date >= v_month_start;

  SELECT COUNT(*)::int INTO v_sellers_registered FROM public.team_members WHERE role='seller';
  SELECT COUNT(DISTINCT registered_by_user_id)::int INTO v_sellers_active
    FROM public.purchases WHERE status='paid' AND registered_by_user_id IS NOT NULL;

  SELECT COUNT(*)::int, COALESCE(SUM(amount_ore),0)::bigint, MIN(created_at)
    INTO v_payout_count, v_payout_amount, v_payout_oldest
    FROM public.payout_requests WHERE status='pending';

  RETURN jsonb_build_object(
    'trees_total', v_trees_total,
    'trees_week', v_trees_week,
    'trees_prev_week', v_trees_prev_week,
    'active_planters', v_active_planters + v_active_monthly,
    'revenue_mtd_ore', v_revenue_mtd,
    'activation_rate', CASE WHEN v_sellers_registered=0 THEN 0
      ELSE round(100.0 * v_sellers_active / v_sellers_registered, 1) END,
    'sellers_registered', v_sellers_registered,
    'sellers_active', v_sellers_active,
    'payout_count', v_payout_count,
    'payout_amount_ore', v_payout_amount,
    'payout_oldest', v_payout_oldest
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_insights_weekly_series()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Stockholm')::date;
  v_week_start date := v_today - ((EXTRACT(ISODOW FROM v_today)::int) - 1);
  v_from date := v_week_start - 7*11;
  v_data jsonb;
BEGIN
  PERFORM public._assert_admin();
  SELECT jsonb_agg(row_to_json(x) ORDER BY x.week_start) INTO v_data FROM (
    SELECT
      (v_week_start - ((extract(days from (v_week_start - day))::int / 7) * 7))::date AS week_start,
      source,
      SUM(trees)::int AS trees
    FROM public.insights_daily_trees
    WHERE day >= v_from
    GROUP BY 1, 2
  ) x;
  RETURN COALESCE(v_data,'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_insights_channel_mix_30d()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from date := ((now() AT TIME ZONE 'Europe/Stockholm')::date) - 30;
  v_data jsonb;
BEGIN
  PERFORM public._assert_admin();
  SELECT jsonb_agg(jsonb_build_object('source',source,'trees',trees,'revenue_ore',revenue_ore)
                    ORDER BY trees DESC) INTO v_data
  FROM (
    SELECT COALESCE(NULLIF(source,''),'web') AS source,
      SUM(tree_count)::int AS trees,
      SUM(total_amount_ore)::bigint AS revenue_ore
    FROM public.purchases
    WHERE status='paid'
      AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date >= v_from
    GROUP BY 1
  ) x;
  RETURN COALESCE(v_data,'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_insights_sales_engine()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_median_sec numeric;
  v_streak_active int;
  v_streak_healthy int;
  v_turbo_week int;
  v_week_start date := ((now() AT TIME ZONE 'Europe/Stockholm')::date)
                        - ((EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Europe/Stockholm')::date)::int) - 1);
  v_w1_cohort int;
  v_w1_retained int;
BEGIN
  PERFORM public._assert_admin();

  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_sale - joined)))
    INTO v_median_sec
  FROM (
    SELECT tm.user_id, tm.created_at AS joined,
      (SELECT MIN(COALESCE(p.paid_at, p.created_at)) FROM public.purchases p
        WHERE p.registered_by_user_id = tm.user_id AND p.status='paid') AS first_sale
    FROM public.team_members tm WHERE tm.role='seller'
  ) s WHERE first_sale IS NOT NULL;

  SELECT COUNT(*)::int, COUNT(*) FILTER (WHERE current_weeks >= 2)::int
    INTO v_streak_active, v_streak_healthy
  FROM public.seller_streaks;

  SELECT COUNT(*)::int INTO v_turbo_week
  FROM public.seller_boosts
  WHERE boost_key='turbo' AND status IN ('active','consumed')
    AND (activated_at IS NOT NULL AND activated_at >= v_week_start);

  SELECT COUNT(*)::int INTO v_w1_cohort
  FROM public.team_members tm
  WHERE tm.role='seller' AND tm.created_at < now() - INTERVAL '7 days';

  SELECT COUNT(DISTINCT tm.user_id)::int INTO v_w1_retained
  FROM public.team_members tm
  JOIN public.purchases p ON p.registered_by_user_id = tm.user_id AND p.status='paid'
  WHERE tm.role='seller' AND tm.created_at < now() - INTERVAL '7 days'
    AND p.created_at BETWEEN tm.created_at AND tm.created_at + INTERVAL '7 days';

  RETURN jsonb_build_object(
    'median_time_to_first_tree_sec', COALESCE(v_median_sec,0),
    'streak_active', v_streak_active,
    'streak_healthy', v_streak_healthy,
    'streak_healthy_pct', CASE WHEN v_streak_active=0 THEN 0
      ELSE round(100.0 * v_streak_healthy / v_streak_active, 1) END,
    'turbo_activations_week', v_turbo_week,
    'w1_retention_pct', CASE WHEN v_w1_cohort=0 THEN 0
      ELSE round(100.0 * v_w1_retained / v_w1_cohort, 1) END,
    'w1_cohort', v_w1_cohort
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_insights_recipients()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customers_total int;
  v_customers_new30 int;
  v_certs_total int;
  v_certs_linked int;
  v_verify_views_30d int;
  v_repeat_buyers int;
  v_active_monthly int;
  v_churn_30d int;
  v_from30 date := ((now() AT TIME ZONE 'Europe/Stockholm')::date) - 30;
  v_from60 date := ((now() AT TIME ZONE 'Europe/Stockholm')::date) - 60;
BEGIN
  PERFORM public._assert_admin();
  SELECT COUNT(*)::int INTO v_customers_total FROM public.customers;
  SELECT COUNT(*)::int INTO v_customers_new30 FROM public.customers WHERE created_at >= now() - INTERVAL '30 days';
  SELECT COUNT(*)::int, COUNT(*) FILTER (WHERE user_id IS NOT NULL)::int
    INTO v_certs_total, v_certs_linked FROM public.certificates;
  SELECT COUNT(*)::int INTO v_verify_views_30d
    FROM public.site_events WHERE event='verify_view' AND created_at >= now() - INTERVAL '30 days';
  SELECT COUNT(*)::int INTO v_repeat_buyers FROM (
    SELECT customer_id FROM public.purchases WHERE status='paid' AND customer_id IS NOT NULL
    GROUP BY customer_id HAVING COUNT(*) >= 2
  ) x;
  SELECT COUNT(DISTINCT customer_id)::int INTO v_active_monthly
    FROM public.purchases WHERE status='paid' AND source='monthly' AND customer_id IS NOT NULL
      AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date >= v_from30;
  SELECT COUNT(*)::int INTO v_churn_30d FROM (
    SELECT customer_id FROM public.purchases
    WHERE status='paid' AND source='monthly' AND customer_id IS NOT NULL
      AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date BETWEEN v_from60 AND v_from30
    EXCEPT
    SELECT customer_id FROM public.purchases
    WHERE status='paid' AND source='monthly' AND customer_id IS NOT NULL
      AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date >= v_from30
  ) x;
  RETURN jsonb_build_object(
    'customers_total', v_customers_total,
    'customers_new_30d', v_customers_new30,
    'certificates_total', v_certs_total,
    'certificates_linked', v_certs_linked,
    'proof_to_account_pct', CASE WHEN v_certs_total=0 THEN 0
      ELSE round(100.0 * v_certs_linked / v_certs_total, 1) END,
    'verify_views_30d', v_verify_views_30d,
    'repeat_buyers', v_repeat_buyers,
    'active_monthly', v_active_monthly,
    'churn_30d', v_churn_30d
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_insights_risk_queues()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payout_count int; v_payout_amount bigint; v_payout_oldest timestamptz;
  v_suppressions_7d int;
  v_open_reports int;
  v_last_backup jsonb;
  v_orders_pending int; v_orders_oldest timestamptz;
BEGIN
  PERFORM public._assert_admin();
  SELECT COUNT(*)::int, COALESCE(SUM(amount_ore),0)::bigint, MIN(created_at)
    INTO v_payout_count, v_payout_amount, v_payout_oldest
    FROM public.payout_requests WHERE status='pending';
  SELECT COUNT(*)::int INTO v_suppressions_7d
    FROM public.email_suppression WHERE created_at >= now() - INTERVAL '7 days';
  SELECT COUNT(*)::int INTO v_open_reports FROM public.photo_reports WHERE status='open';
  SELECT to_jsonb(x) INTO v_last_backup FROM (
    SELECT created_at, ok, note FROM public.backup_runs ORDER BY created_at DESC LIMIT 1
  ) x;
  SELECT COUNT(*)::int, MIN(created_at) INTO v_orders_pending, v_orders_oldest
    FROM public.reward_orders WHERE status='pending';
  RETURN jsonb_build_object(
    'payout_count', v_payout_count,
    'payout_amount_ore', v_payout_amount,
    'payout_oldest', v_payout_oldest,
    'suppressions_7d', v_suppressions_7d,
    'open_photo_reports', v_open_reports,
    'last_backup', v_last_backup,
    'reward_orders_pending', v_orders_pending,
    'reward_orders_oldest', v_orders_oldest
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_insights_top_teams_week()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Stockholm')::date;
  v_week_start date := v_today - ((EXTRACT(ISODOW FROM v_today)::int) - 1);
  v_data jsonb;
BEGIN
  PERFORM public._assert_admin();
  SELECT jsonb_agg(row_to_json(x) ORDER BY x.trees DESC) INTO v_data FROM (
    SELECT t.id AS team_id, t.name AS team_name,
      SUM(p.tree_count)::int AS trees
    FROM public.purchases p
    JOIN public.team_members tm ON tm.user_id = p.registered_by_user_id
    JOIN public.teams t ON t.id = tm.team_id
    WHERE p.status='paid'
      AND (COALESCE(p.paid_at,p.created_at) AT TIME ZONE 'Europe/Stockholm')::date >= v_week_start
    GROUP BY t.id, t.name
    ORDER BY trees DESC
    LIMIT 5
  ) x;
  RETURN COALESCE(v_data,'[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_insights_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_insights_weekly_series() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_insights_channel_mix_30d() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_insights_sales_engine() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_insights_recipients() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_insights_risk_queues() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_insights_top_teams_week() TO authenticated;

-- Initial refresh (non-concurrent since view is empty)
REFRESH MATERIALIZED VIEW public.insights_daily_trees;
