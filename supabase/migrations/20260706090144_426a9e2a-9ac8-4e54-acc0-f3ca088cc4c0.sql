
-- Fix Sverige leaderboard: views were security_invoker=true so profile RLS
-- hid every row except the caller's own. Switch to definer-mode (default),
-- and broaden the seller include-filter to any seller with paid trees or a
-- team membership. Also expose trees_total on the seller view so we can rank
-- fairly when points_total is 0.

DROP VIEW IF EXISTS public.v_public_seller_profile;
CREATE VIEW public.v_public_seller_profile
WITH (security_invoker=off) AS
SELECT
  p.user_id,
  split_part(COALESCE(p.name,''), ' ', 1) AS first_name,
  p.photo_path,
  p.avatar_key,
  tm.team_id,
  t.name AS team_name,
  o.name AS organization_name,
  t.city AS team_city,
  (SELECT COALESCE(SUM(pu.tree_count),0)::int
     FROM public.purchases pu
     WHERE pu.registered_by_user_id = p.user_id AND pu.status = 'paid') AS trees_total,
  (SELECT COALESCE(SUM(pt.delta),0)::int
     FROM public.point_transactions pt
     WHERE pt.seller_user_id = p.user_id) AS points_total,
  (SELECT COALESCE(SUM(pt.delta),0)::int
     FROM public.point_transactions pt
     WHERE pt.seller_user_id = p.user_id
       AND to_char((pt.created_at AT TIME ZONE 'Europe/Stockholm'), 'IYYY"-W"IW')
         = to_char((now() AT TIME ZONE 'Europe/Stockholm'), 'IYYY"-W"IW')) AS points_week
FROM public.profiles p
LEFT JOIN public.team_members tm ON tm.user_id = p.user_id
LEFT JOIN public.teams t ON t.id = tm.team_id
LEFT JOIN public.organizations o ON o.id = t.organization_id
WHERE EXISTS (SELECT 1 FROM public.team_members m WHERE m.user_id = p.user_id)
   OR EXISTS (SELECT 1 FROM public.purchases pu
              WHERE pu.registered_by_user_id = p.user_id AND pu.status = 'paid');

GRANT SELECT ON public.v_public_seller_profile TO anon, authenticated;

DROP VIEW IF EXISTS public.v_public_team_ranking;
CREATE VIEW public.v_public_team_ranking
WITH (security_invoker=off) AS
SELECT
  t.id AS team_id,
  t.name AS team_name,
  o.name AS organization_name,
  t.city,
  (SELECT COUNT(*) FROM public.team_members tm WHERE tm.team_id = t.id)::int AS members,
  (SELECT COALESCE(SUM(pu.tree_count),0)::int
     FROM public.purchases pu
     JOIN public.team_members tm ON tm.user_id = pu.registered_by_user_id
     WHERE tm.team_id = t.id AND pu.status = 'paid') AS trees_total,
  (SELECT COALESCE(SUM(pt.delta),0)::int
     FROM public.point_transactions pt
     JOIN public.team_members tm ON tm.user_id = pt.seller_user_id
     WHERE tm.team_id = t.id) AS points_total,
  (SELECT COALESCE(SUM(pt.delta),0)::int
     FROM public.point_transactions pt
     JOIN public.team_members tm ON tm.user_id = pt.seller_user_id
     WHERE tm.team_id = t.id
       AND to_char((pt.created_at AT TIME ZONE 'Europe/Stockholm'), 'IYYY"-W"IW')
         = to_char((now() AT TIME ZONE 'Europe/Stockholm'), 'IYYY"-W"IW')) AS points_week
FROM public.teams t
LEFT JOIN public.organizations o ON o.id = t.organization_id;

GRANT SELECT ON public.v_public_team_ranking TO anon, authenticated;
