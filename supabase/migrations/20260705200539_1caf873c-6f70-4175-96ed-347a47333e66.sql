
-- Columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo_path text,
  ADD COLUMN IF NOT EXISTS avatar_key text NOT NULL DEFAULT 'kronorn';

-- Avatar catalog
CREATE TABLE public.avatar_catalog (
  key text PRIMARY KEY,
  name text NOT NULL,
  emoji text NOT NULL,
  color text NOT NULL,
  unlock_type text NOT NULL DEFAULT 'free', -- free | level | streak | badge
  unlock_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.avatar_catalog TO authenticated, anon;
GRANT ALL ON public.avatar_catalog TO service_role;
ALTER TABLE public.avatar_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read avatars" ON public.avatar_catalog FOR SELECT USING (active = true);

INSERT INTO public.avatar_catalog(key,name,emoji,color,unlock_type,unlock_config,sort_order) VALUES
  ('kronorn','Kronörn','🦅','#F6B27A','free','{}'::jsonb,10),
  ('jaguar','Jaguar','🐆','#9FD9B6','free','{}'::jsonb,20),
  ('bi','Bi','🐝','#DCBE6E','free','{}'::jsonb,30),
  ('tamarin','Tamarin','🐒','#C7EAD4','free','{}'::jsonb,40),
  ('uggla','Uggla','🦉','#EAF7EE','free','{}'::jsonb,50),
  ('guldtrad','Guldträd','🌳','#F1D580','level','{"threshold":5}'::jsonb,60),
  ('eldrav','Eldräv','🔥','#F4A88A','streak','{"weeks":6}'::jsonb,70),
  ('myrslok','Myrslok','🐜','#CDB79E','badge','{"badge":"skogsdag"}'::jsonb,80);

-- Photo reports
CREATE TABLE public.photo_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  photo_path text,
  status text NOT NULL DEFAULT 'open', -- open | dismissed | removed
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.photo_reports TO authenticated;
GRANT ALL ON public.photo_reports TO service_role;
ALTER TABLE public.photo_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user report insert" ON public.photo_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reported_by_user_id);
CREATE POLICY "admin read reports" ON public.photo_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR auth.uid() = reported_by_user_id);
CREATE INDEX photo_reports_status_idx ON public.photo_reports(status, created_at DESC);

-- Storage RLS: users own their {user_id}/ folder; admins full access
CREATE POLICY "avatar owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(),'admin'::public.app_role)
  ));
CREATE POLICY "avatar owner write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatar owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatar owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(),'admin'::public.app_role)
  ));

-- Leader can reset a team member's photo
CREATE OR REPLACE FUNCTION public.leader_reset_member_photo(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Inte inloggad'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_members m
    JOIN public.teams t ON t.id = m.team_id
    WHERE m.user_id = _user_id AND t.created_by_user_id = v_uid
  ) AND NOT public.has_role(v_uid,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Inte auktoriserad';
  END IF;
  UPDATE public.profiles SET photo_path = NULL WHERE user_id = _user_id;
END $$;

-- Sverige-topplistan view: exposes only first name + non-sensitive columns
CREATE OR REPLACE VIEW public.v_public_seller_profile
WITH (security_invoker = true) AS
SELECT
  p.user_id,
  split_part(coalesce(p.name,''),' ',1) AS first_name,
  p.photo_path,
  p.avatar_key,
  tm.team_id,
  t.name AS team_name,
  o.name AS organization_name,
  t.city AS team_city,
  (SELECT COALESCE(SUM(delta),0)::int FROM public.point_transactions pt
    WHERE pt.seller_user_id = p.user_id) AS points_total,
  (SELECT COALESCE(SUM(delta),0)::int FROM public.point_transactions pt
    WHERE pt.seller_user_id = p.user_id
      AND to_char((pt.created_at AT TIME ZONE 'Europe/Stockholm'),'IYYY"-W"IW')
        = to_char((now() AT TIME ZONE 'Europe/Stockholm'),'IYYY"-W"IW')) AS points_week
FROM public.profiles p
LEFT JOIN public.team_members tm ON tm.user_id = p.user_id
LEFT JOIN public.teams t ON t.id = tm.team_id
LEFT JOIN public.organizations o ON o.id = t.organization_id
WHERE EXISTS (SELECT 1 FROM public.team_members m WHERE m.user_id = p.user_id);

GRANT SELECT ON public.v_public_seller_profile TO authenticated;

-- Teams view for Sverige
CREATE OR REPLACE VIEW public.v_public_team_ranking
WITH (security_invoker = true) AS
SELECT
  t.id AS team_id,
  t.name AS team_name,
  o.name AS organization_name,
  t.city,
  (SELECT COUNT(*) FROM public.team_members tm WHERE tm.team_id = t.id)::int AS members,
  (SELECT COALESCE(SUM(pu.tree_count),0)::int
    FROM public.purchases pu
    JOIN public.team_members tm ON tm.user_id = pu.registered_by_user_id
    WHERE tm.team_id = t.id AND pu.status='paid') AS trees_total,
  (SELECT COALESCE(SUM(pt.delta),0)::int
    FROM public.point_transactions pt
    JOIN public.team_members tm ON tm.user_id = pt.seller_user_id
    WHERE tm.team_id = t.id) AS points_total,
  (SELECT COALESCE(SUM(pt.delta),0)::int
    FROM public.point_transactions pt
    JOIN public.team_members tm ON tm.user_id = pt.seller_user_id
    WHERE tm.team_id = t.id
      AND to_char((pt.created_at AT TIME ZONE 'Europe/Stockholm'),'IYYY"-W"IW')
        = to_char((now() AT TIME ZONE 'Europe/Stockholm'),'IYYY"-W"IW')) AS points_week
FROM public.teams t
LEFT JOIN public.organizations o ON o.id = t.organization_id;

GRANT SELECT ON public.v_public_team_ranking TO authenticated;
