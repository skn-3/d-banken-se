
-- =============== achievement_catalog ===============
CREATE TABLE public.achievement_catalog (
  key text PRIMARY KEY,
  name text NOT NULL,
  emoji text NOT NULL,
  description text NOT NULL,
  trigger_type text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope text NOT NULL DEFAULT 'seller',
  rarity text NOT NULL DEFAULT 'normal',
  sort_order int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.achievement_catalog TO anon, authenticated;
GRANT ALL ON public.achievement_catalog TO service_role;
ALTER TABLE public.achievement_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievement_catalog readable" ON public.achievement_catalog FOR SELECT USING (true);

INSERT INTO public.achievement_catalog(key,name,emoji,description,trigger_type,trigger_config,scope,rarity,sort_order) VALUES
('forsta_tradet','Första trädet','🌱','Din första plantering','total_trees','{"n":1}','seller','normal',10),
('tio_trad','Tio träd','🌿','10 träd totalt','total_trees','{"n":10}','seller','normal',20),
('kvartsskog_25','Kvartsskog','🌳','25 träd totalt','total_trees','{"n":25}','seller','normal',30),
('femtio_trad','Femtio träd','🌲','50 träd totalt','total_trees','{"n":50}','seller','normal',40),
('skogsmastare_100','Skogsmästare','🏆','100 träd totalt','total_trees','{"n":100}','seller','gold',50),
('varldsforbattrare_250','Världsförbättrare','🌍','250 träd totalt','total_trees','{"n":250}','seller','gold',60),
('eldsjal_streak3','Eldsjäl','🔥','3 veckor i rad','streak_weeks','{"n":3}','seller','normal',70),
('obruten_laga_streak10','Obruten låga','🔥','10 veckor i rad','streak_weeks','{"n":10}','seller','gold',80),
('hattrick','Hattrick','⚽','3 planteringar samma dag','same_day_plants','{"n":3}','seller','normal',90),
('skogsdag','Skogsdag','🌲','10 träd på en dag','same_day_trees','{"n":10}','seller','normal',100),
('morgonpigg','Morgonpigg','🌅','Plantering före 08:00','time_of_day','{"before_hour":8}','seller','normal',110),
('nattugglan','Nattugglan','🦉','Plantering efter 20:00','time_of_day','{"after_hour":20}','seller','normal',120),
('helghjalte','Helghjälte','🎽','Planterat både lör och sön samma helg','weekend_both','{}','seller','normal',130),
('lagets_hjarta','Lagets hjärta','💚','Flest planteringar i laget en avslutad vecka','weekly_top_in_team','{}','seller','normal',140),
('malskytten','Målskytten','🎯','Planteringen som når lagets kampanjmål','team_goal_hit','{}','seller','gold',150),
('grundare','Grundare','⭐','Med i lagets första 7 dagar','team_founder','{"days":7}','seller','normal',160),
('manadens_alla_veckor','Månadens alla veckor','📅','Planterat varje vecka en hel kalendermånad','all_weeks_month','{}','seller','normal',170)
ON CONFLICT (key) DO NOTHING;

-- =============== seller_achievements ===============
CREATE TABLE public.seller_achievements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_key text NOT NULL REFERENCES public.achievement_catalog(key) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, achievement_key)
);
GRANT SELECT ON public.seller_achievements TO authenticated;
GRANT ALL ON public.seller_achievements TO service_role;
ALTER TABLE public.seller_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller_ach read own+team+admin" ON public.seller_achievements FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = seller_achievements.user_id
      AND t.created_by_user_id = auth.uid()
  )
);
CREATE INDEX idx_seller_ach_user ON public.seller_achievements(user_id);

-- =============== activity_feed ===============
CREATE TABLE public.activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope text NOT NULL DEFAULT 'team',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.activity_feed TO authenticated;
GRANT ALL ON public.activity_feed TO service_role;
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity read national" ON public.activity_feed FOR SELECT TO authenticated
USING (
  scope = 'national'
  OR public.has_role(auth.uid(),'admin'::public.app_role)
  OR (scope='team' AND team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.team_members tm WHERE tm.team_id = activity_feed.team_id AND tm.user_id = auth.uid()
  ))
);
CREATE INDEX idx_activity_team_created ON public.activity_feed(team_id, created_at DESC);
CREATE INDEX idx_activity_scope_created ON public.activity_feed(scope, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_feed;
ALTER TABLE public.activity_feed REPLICA IDENTITY FULL;

-- =============== helper: get user's team ===============
CREATE OR REPLACE FUNCTION public._user_team_id(_uid uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT team_id FROM public.team_members WHERE user_id=_uid LIMIT 1;
$$;

-- =============== award helper ===============
CREATE OR REPLACE FUNCTION public.award_achievement(_user_id uuid, _key text, _meta jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_cat public.achievement_catalog%ROWTYPE;
  v_team uuid;
  v_first_name text;
  v_scope text := 'team';
BEGIN
  SELECT * INTO v_cat FROM public.achievement_catalog WHERE key=_key AND active;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.seller_achievements(user_id, achievement_key, meta)
  VALUES (_user_id, _key, COALESCE(_meta,'{}'::jsonb))
  ON CONFLICT (user_id, achievement_key) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT public._user_team_id(_user_id) INTO v_team;
  SELECT split_part(COALESCE(name,''),' ',1) INTO v_first_name FROM public.profiles WHERE user_id=_user_id;

  -- national scope: gold badges + skogsmastare_100+
  IF v_cat.rarity='gold' THEN v_scope := 'national'; END IF;

  INSERT INTO public.activity_feed(user_id, team_id, type, payload, scope)
  VALUES (_user_id, v_team, 'achievement_earned',
    jsonb_build_object('key',_key,'name',v_cat.name,'emoji',v_cat.emoji,'rarity',v_cat.rarity,'first_name',v_first_name,'meta',COALESCE(_meta,'{}'::jsonb)),
    v_scope);

  -- If gold + national, also insert a team row so team-mates see it
  IF v_scope='national' AND v_team IS NOT NULL THEN
    INSERT INTO public.activity_feed(user_id, team_id, type, payload, scope)
    VALUES (_user_id, v_team, 'achievement_earned',
      jsonb_build_object('key',_key,'name',v_cat.name,'emoji',v_cat.emoji,'rarity',v_cat.rarity,'first_name',v_first_name,'meta',COALESCE(_meta,'{}'::jsonb)),
      'team');
  END IF;

  RETURN true;
END $$;

-- =============== evaluate achievements on purchase ===============
CREATE OR REPLACE FUNCTION public.evaluate_purchase_achievements()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := NEW.registered_by_user_id;
  v_tc int := COALESCE(NEW.tree_count,0);
  v_ts timestamptz := COALESCE(NEW.paid_at, NEW.created_at, now());
  v_local timestamptz := (v_ts AT TIME ZONE 'Europe/Stockholm');
  v_day date := v_local::date;
  v_hour int := EXTRACT(HOUR FROM v_local)::int;
  v_dow int := EXTRACT(ISODOW FROM v_local)::int;
  v_iso_week text := to_char(v_local,'IYYY"-W"IW');
  v_total int; v_prev int;
  v_today_ct int; v_today_trees int; v_prev_today_trees int;
  v_team_id uuid; v_team public.teams%ROWTYPE;
  v_week_team_trees int; v_prev_week_team_trees int;
  v_total_team_trees int; v_prev_total_team_trees int;
  v_member_since timestamptz;
  v_ct int;
BEGIN
  IF NEW.status <> 'paid' OR v_uid IS NULL OR v_tc <= 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(tree_count),0)::int INTO v_total
    FROM public.purchases WHERE registered_by_user_id=v_uid AND status='paid';
  v_prev := v_total - v_tc;

  -- Total-tree milestones
  IF v_total >= 1 AND v_prev < 1 THEN PERFORM public.award_achievement(v_uid,'forsta_tradet'); END IF;
  IF v_total >= 10 AND v_prev < 10 THEN PERFORM public.award_achievement(v_uid,'tio_trad'); END IF;
  IF v_total >= 25 AND v_prev < 25 THEN PERFORM public.award_achievement(v_uid,'kvartsskog_25'); END IF;
  IF v_total >= 50 AND v_prev < 50 THEN PERFORM public.award_achievement(v_uid,'femtio_trad'); END IF;
  IF v_total >= 100 AND v_prev < 100 THEN PERFORM public.award_achievement(v_uid,'skogsmastare_100'); END IF;
  IF v_total >= 250 AND v_prev < 250 THEN PERFORM public.award_achievement(v_uid,'varldsforbattrare_250'); END IF;

  -- same day
  SELECT COUNT(*)::int, COALESCE(SUM(tree_count),0)::int INTO v_today_ct, v_today_trees
    FROM public.purchases WHERE registered_by_user_id=v_uid AND status='paid'
      AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date = v_day;
  v_prev_today_trees := v_today_trees - v_tc;
  IF v_today_ct >= 3 THEN PERFORM public.award_achievement(v_uid,'hattrick', jsonb_build_object('day',v_day)); END IF;
  IF v_today_trees >= 10 AND v_prev_today_trees < 10 THEN
    PERFORM public.award_achievement(v_uid,'skogsdag', jsonb_build_object('day',v_day));
  END IF;

  -- Time of day
  IF v_hour < 8 THEN PERFORM public.award_achievement(v_uid,'morgonpigg'); END IF;
  IF v_hour >= 20 THEN PERFORM public.award_achievement(v_uid,'nattugglan'); END IF;

  -- Weekend both
  IF v_dow IN (6,7) THEN
    SELECT COUNT(DISTINCT EXTRACT(ISODOW FROM (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')))::int INTO v_ct
      FROM public.purchases WHERE registered_by_user_id=v_uid AND status='paid'
        AND to_char((COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm'),'IYYY"-W"IW')=v_iso_week
        AND EXTRACT(ISODOW FROM (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')) IN (6,7);
    IF v_ct >= 2 THEN PERFORM public.award_achievement(v_uid,'helghjalte', jsonb_build_object('week',v_iso_week)); END IF;
  END IF;

  -- Team-based
  SELECT tm.team_id INTO v_team_id FROM public.team_members tm WHERE tm.user_id=v_uid LIMIT 1;
  IF v_team_id IS NOT NULL THEN
    SELECT * INTO v_team FROM public.teams WHERE id=v_team_id;

    -- Grundare: joined during team's first 7 days
    SELECT tm.created_at INTO v_member_since FROM public.team_members tm WHERE tm.user_id=v_uid AND tm.team_id=v_team_id;
    IF v_member_since IS NOT NULL AND v_member_since <= v_team.created_at + INTERVAL '7 days' THEN
      PERFORM public.award_achievement(v_uid,'grundare', jsonb_build_object('team_id',v_team_id));
    END IF;

    -- Målskytten: team total crosses goal_trees
    IF COALESCE(v_team.goal_trees,0) > 0 THEN
      SELECT COALESCE(SUM(p.tree_count),0)::int INTO v_total_team_trees
        FROM public.purchases p JOIN public.team_members tm ON tm.user_id=p.registered_by_user_id
        WHERE tm.team_id=v_team_id AND p.status='paid';
      v_prev_total_team_trees := v_total_team_trees - v_tc;
      IF v_total_team_trees >= v_team.goal_trees AND v_prev_total_team_trees < v_team.goal_trees THEN
        PERFORM public.award_achievement(v_uid,'malskytten', jsonb_build_object('team_id',v_team_id,'goal',v_team.goal_trees));
        INSERT INTO public.activity_feed(user_id,team_id,type,payload,scope)
        VALUES (v_uid,v_team_id,'team_goal_hit',
          jsonb_build_object('goal',v_team.goal_trees,'team_name',v_team.name),'national');
      END IF;
    END IF;

    -- team weekly goal reached (activity only; boost trigger already handles points)
    IF COALESCE(v_team.weekly_goal_trees,0) > 0 THEN
      SELECT COALESCE(SUM(p.tree_count),0)::int INTO v_week_team_trees
        FROM public.purchases p JOIN public.team_members tm ON tm.user_id=p.registered_by_user_id
        WHERE tm.team_id=v_team_id AND p.status='paid'
          AND to_char((COALESCE(p.paid_at,p.created_at) AT TIME ZONE 'Europe/Stockholm'),'IYYY"-W"IW')=v_iso_week;
      v_prev_week_team_trees := v_week_team_trees - v_tc;
      IF v_week_team_trees >= v_team.weekly_goal_trees AND v_prev_week_team_trees < v_team.weekly_goal_trees THEN
        INSERT INTO public.activity_feed(user_id,team_id,type,payload,scope)
        VALUES (NULL,v_team_id,'team_weekly_goal_hit',
          jsonb_build_object('goal',v_team.weekly_goal_trees,'week',v_iso_week,'team_name',v_team.name),'team');
      END IF;
    END IF;
  END IF;

  -- Gold plantering event on point_transactions is separate; log if occurred
  IF EXISTS (SELECT 1 FROM public.point_transactions WHERE reference_id=NEW.id AND type='boost_gold') THEN
    INSERT INTO public.activity_feed(user_id,team_id,type,payload,scope)
    VALUES (v_uid, public._user_team_id(v_uid),'gold_plant',
      jsonb_build_object('trees',v_tc,'purchase_id',NEW.id),'team');
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_evaluate_purchase_achievements ON public.purchases;
CREATE TRIGGER trg_evaluate_purchase_achievements
AFTER INSERT OR UPDATE OF status ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.evaluate_purchase_achievements();

-- =============== boost events → feed + level ach ===============
CREATE OR REPLACE FUNCTION public.log_boost_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_team uuid;
  v_first text;
  v_scope text := 'team';
  v_name text;
BEGIN
  SELECT public._user_team_id(NEW.user_id) INTO v_team;
  SELECT split_part(COALESCE(name,''),' ',1) INTO v_first FROM public.profiles WHERE user_id=NEW.user_id;
  SELECT name INTO v_name FROM public.boost_catalog WHERE key=NEW.boost_key;

  IF TG_OP='INSERT' AND NEW.status='earned' THEN
    INSERT INTO public.activity_feed(user_id,team_id,type,payload,scope)
    VALUES (NEW.user_id,v_team,'boost_earned',
      jsonb_build_object('key',NEW.boost_key,'name',COALESCE(v_name,NEW.boost_key),'first_name',v_first,'meta',NEW.meta),'team');

    IF NEW.boost_key='nivaboost' THEN
      INSERT INTO public.activity_feed(user_id,team_id,type,payload,scope)
      VALUES (NEW.user_id,v_team,'level_up',
        jsonb_build_object('threshold',NEW.meta->>'threshold','first_name',v_first),'team');
    END IF;
  ELSIF TG_OP='UPDATE' AND NEW.status='active' AND OLD.status='earned' THEN
    INSERT INTO public.activity_feed(user_id,team_id,type,payload,scope)
    VALUES (NEW.user_id,v_team,'boost_activated',
      jsonb_build_object('key',NEW.boost_key,'name',COALESCE(v_name,NEW.boost_key),'first_name',v_first),'team');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_boost_activity ON public.seller_boosts;
CREATE TRIGGER trg_log_boost_activity
AFTER INSERT OR UPDATE OF status ON public.seller_boosts
FOR EACH ROW EXECUTE FUNCTION public.log_boost_activity();

-- =============== streak update → ach + feed ===============
CREATE OR REPLACE FUNCTION public.log_streak_milestones() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_team uuid; v_first text; v_scope text;
BEGIN
  IF COALESCE(NEW.current_weeks,0) <= COALESCE(OLD.current_weeks,0) THEN RETURN NEW; END IF;
  IF NEW.current_weeks >= 3 THEN PERFORM public.award_achievement(NEW.user_id,'eldsjal_streak3', jsonb_build_object('weeks',NEW.current_weeks)); END IF;
  IF NEW.current_weeks >= 10 THEN PERFORM public.award_achievement(NEW.user_id,'obruten_laga_streak10', jsonb_build_object('weeks',NEW.current_weeks)); END IF;

  IF NEW.current_weeks IN (3,5,10) THEN
    SELECT public._user_team_id(NEW.user_id) INTO v_team;
    SELECT split_part(COALESCE(name,''),' ',1) INTO v_first FROM public.profiles WHERE user_id=NEW.user_id;
    v_scope := CASE WHEN NEW.current_weeks >= 5 THEN 'national' ELSE 'team' END;
    INSERT INTO public.activity_feed(user_id,team_id,type,payload,scope)
    VALUES (NEW.user_id,v_team,'streak_milestone',
      jsonb_build_object('weeks',NEW.current_weeks,'first_name',v_first), v_scope);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_streak_milestones ON public.seller_streaks;
CREATE TRIGGER trg_log_streak_milestones
AFTER UPDATE OF current_weeks ON public.seller_streaks
FOR EACH ROW EXECUTE FUNCTION public.log_streak_milestones();

-- =============== weekly wrap: lagets_hjarta + manadens_alla_veckor ===============
CREATE OR REPLACE FUNCTION public.process_weekly_achievements()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_week_end date := ((now() AT TIME ZONE 'Europe/Stockholm')::date - 1);
  v_week_start date := v_week_end - 6;
  v_iso_week text := to_char(v_week_end,'IYYY"-W"IW');
  r RECORD;
  m RECORD;
  v_month_first date;
  v_month_last date;
  v_expected int;
  v_actual int;
BEGIN
  -- Lagets hjärta: top seller in each team for the finished week
  FOR r IN
    SELECT team_id, user_id, SUM(trees) AS trees FROM (
      SELECT tm.team_id, p.registered_by_user_id AS user_id, p.tree_count AS trees
      FROM public.purchases p
      JOIN public.team_members tm ON tm.user_id=p.registered_by_user_id
      WHERE p.status='paid'
        AND (COALESCE(p.paid_at,p.created_at) AT TIME ZONE 'Europe/Stockholm')::date BETWEEN v_week_start AND v_week_end
    ) x
    GROUP BY team_id, user_id
  LOOP
    -- pick top per team
    IF (SELECT user_id FROM (
        SELECT user_id, SUM(trees) AS s FROM (
          SELECT p.registered_by_user_id AS user_id, p.tree_count AS trees
          FROM public.purchases p
          JOIN public.team_members tm ON tm.user_id=p.registered_by_user_id
          WHERE tm.team_id=r.team_id AND p.status='paid'
            AND (COALESCE(p.paid_at,p.created_at) AT TIME ZONE 'Europe/Stockholm')::date BETWEEN v_week_start AND v_week_end
        ) y GROUP BY user_id ORDER BY s DESC LIMIT 1
    ) z) = r.user_id THEN
      PERFORM public.award_achievement(r.user_id,'lagets_hjarta', jsonb_build_object('week',v_iso_week,'team_id',r.team_id));
    END IF;
  END LOOP;

  -- Månadens alla veckor: if the finished week was the last ISO week of a month
  v_month_first := date_trunc('month', v_week_end)::date;
  v_month_last := (date_trunc('month', v_week_end) + INTERVAL '1 month - 1 day')::date;
  IF v_week_end + 7 > v_month_last THEN  -- next week rolls into next month
    v_expected := (
      SELECT COUNT(DISTINCT to_char(d,'IYYY"-W"IW'))
      FROM generate_series(v_month_first, v_month_last, INTERVAL '1 day') d
    );
    FOR m IN
      SELECT DISTINCT registered_by_user_id AS user_id
      FROM public.purchases
      WHERE status='paid' AND registered_by_user_id IS NOT NULL
        AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date BETWEEN v_month_first AND v_month_last
    LOOP
      SELECT COUNT(DISTINCT to_char((COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm'),'IYYY"-W"IW'))
        INTO v_actual
      FROM public.purchases
      WHERE status='paid' AND registered_by_user_id=m.user_id
        AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date BETWEEN v_month_first AND v_month_last;
      IF v_actual >= v_expected THEN
        PERFORM public.award_achievement(m.user_id,'manadens_alla_veckor',
          jsonb_build_object('month', to_char(v_week_end,'YYYY-MM')));
      END IF;
    END LOOP;
  END IF;
END $$;

-- Schedule weekly on Monday 06:15 (after streaks 06:00)
SELECT cron.schedule('process-weekly-achievements','15 6 * * 1',$$SELECT public.process_weekly_achievements();$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='process-weekly-achievements');

-- =============== read functions ===============
CREATE OR REPLACE FUNCTION public.get_team_activity_feed(_limit int DEFAULT 100)
RETURNS TABLE(id uuid, user_id uuid, team_id uuid, type text, payload jsonb, created_at timestamptz, avatar_key text, photo_path text, first_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.id, a.user_id, a.team_id, a.type, a.payload, a.created_at,
         p.avatar_key, p.photo_path, split_part(COALESCE(p.name,''),' ',1) AS first_name
  FROM public.activity_feed a
  LEFT JOIN public.profiles p ON p.user_id=a.user_id
  WHERE a.scope='team'
    AND a.team_id = public._user_team_id(auth.uid())
    AND public._user_team_id(auth.uid()) IS NOT NULL
  ORDER BY a.created_at DESC
  LIMIT COALESCE(_limit,100);
$$;

CREATE OR REPLACE FUNCTION public.get_national_activity_feed(_limit int DEFAULT 30)
RETURNS TABLE(id uuid, user_id uuid, team_id uuid, type text, payload jsonb, created_at timestamptz, avatar_key text, photo_path text, first_name text, team_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.id, a.user_id, a.team_id, a.type, a.payload, a.created_at,
         p.avatar_key, p.photo_path, split_part(COALESCE(p.name,''),' ',1) AS first_name,
         t.name AS team_name
  FROM public.activity_feed a
  LEFT JOIN public.profiles p ON p.user_id=a.user_id
  LEFT JOIN public.teams t ON t.id=a.team_id
  WHERE a.scope='national'
  ORDER BY a.created_at DESC
  LIMIT COALESCE(_limit,30);
$$;

GRANT EXECUTE ON FUNCTION public.get_team_activity_feed(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_national_activity_feed(int) TO authenticated, anon;
