-- Fix admin_insights_weekly_series: date - date yields integer, extract(days from integer) does not exist.
-- Also wrong week bucketing; use date_trunc('week', day) for ISO Monday weeks.
CREATE OR REPLACE FUNCTION public.admin_insights_weekly_series()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Stockholm')::date;
  v_week_start date := v_today - ((EXTRACT(ISODOW FROM v_today)::int) - 1);
  v_from date := v_week_start - 7*11;
  v_data jsonb;
BEGIN
  PERFORM public._assert_admin();
  SELECT jsonb_agg(row_to_json(x) ORDER BY x.week_start) INTO v_data FROM (
    SELECT
      date_trunc('week', day)::date AS week_start,
      source,
      SUM(trees)::int AS trees
    FROM public.insights_daily_trees
    WHERE day >= v_from
    GROUP BY 1, 2
  ) x;
  RETURN COALESCE(v_data,'[]'::jsonb);
END $function$;

-- Keep authenticated access, deny anon
GRANT EXECUTE ON FUNCTION public.admin_insights_weekly_series() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_insights_weekly_series() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_insights_weekly_series() TO service_role;
