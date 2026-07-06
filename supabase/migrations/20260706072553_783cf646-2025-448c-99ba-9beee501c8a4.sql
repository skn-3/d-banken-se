
REVOKE EXECUTE ON FUNCTION public.admin_insights_kpis() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_insights_weekly_series() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_insights_channel_mix_30d() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_insights_sales_engine() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_insights_recipients() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_insights_risk_queues() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_insights_top_teams_week() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refresh_insights_daily_trees() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._assert_admin() FROM PUBLIC, anon, authenticated;
