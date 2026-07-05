
-- 0) point_transactions: metadata for boost tracking
ALTER TABLE public.point_transactions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 1) boost_catalog
CREATE TABLE IF NOT EXISTS public.boost_catalog (
  key text PRIMARY KEY,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  trigger_type text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  effect_type text NOT NULL,
  effect_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.boost_catalog TO authenticated, anon;
GRANT ALL ON public.boost_catalog TO service_role;
ALTER TABLE public.boost_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read boost catalog"
  ON public.boost_catalog FOR SELECT TO authenticated, anon USING (true);

INSERT INTO public.boost_catalog(key, name, emoji, description, trigger_type, trigger_config, effect_type, effect_config)
VALUES
  ('turbo',         'Turbo',         '🚀', 'Multiplicerar poäng i 5 planteringar. Aktiveras manuellt.',
    'total_trees_or_week_goal', '{"total_trees":10}', 'multiplier',  '{"factor":2,"uses":5,"manual":true}'),
  ('lagturbo',      'Lagturbo',      '🎉', 'Hela laget får en turbo när veckomålet nås.',
    'team_week_goal',           '{}',                 'award_boost', '{"awards":"turbo"}'),
  ('hattrick',      'Hattrick',      '🎯', 'Tre planteringar samma dag ger 30 extra bonuspoäng.',
    'day_count',                '{"count":3}',        'bonus',       '{"points":30}'),
  ('skogsdag',      'Skogsdag',      '🌳', '10 träd samma dag ger märke och en turbo.',
    'day_trees',                '{"trees":10}',       'award_boost', '{"awards":"turbo","badge":true}'),
  ('comeback',      'Comeback',      '💫', '2x på första planteringen efter 14 dagars paus.',
    'idle_days',                '{"days":14}',        'multiplier',  '{"factor":2,"uses":1,"auto":true}'),
  ('guldplantering','Guldplantering','🥇', '1% chans per plantering, max en per vecka: 3x poäng.',
    'random',                   '{"chance":0.01,"max_per_week":1}', 'multiplier', '{"factor":3,"uses":1,"auto":true}'),
  ('nivaboost',     'Nivåboost',     '🌱', 'Ny nivå på ditt träd ger en turbo.',
    'level_up',                 '{"thresholds":[10,25,50,100]}', 'award_boost', '{"awards":"turbo"}'),
  ('streakfrys',    'Streakfrys',    '❄️', 'Var fjärde veckostreak: en frys som räddar streaken en vecka.',
    'weeks_streak',             '{"every":4}',        'streak_freeze','{}')
ON CONFLICT (key) DO NOTHING;

-- 2) seller_boosts
CREATE TABLE IF NOT EXISTS public.seller_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  boost_key text NOT NULL REFERENCES public.boost_catalog(key) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'earned', -- earned|active|consumed|expired
  earned_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  consumed_at timestamptz,
  remaining_uses integer NOT NULL DEFAULT 0,
  dedupe_key text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.seller_boosts TO authenticated;
GRANT ALL ON public.seller_boosts TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS ux_seller_boosts_dedupe
  ON public.seller_boosts(user_id, boost_key, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seller_boosts_user ON public.seller_boosts(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_boosts_status ON public.seller_boosts(status);

ALTER TABLE public.seller_boosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Seller reads own boosts"
  ON public.seller_boosts FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE tm.user_id = seller_boosts.user_id
        AND t.created_by_user_id = auth.uid()
    )
  );

-- 3) seller_streaks
CREATE TABLE IF NOT EXISTS public.seller_streaks (
  user_id uuid PRIMARY KEY,
  current_weeks integer NOT NULL DEFAULT 0,
  best_weeks integer NOT NULL DEFAULT 0,
  last_counted_week text,
  freezes integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seller_streaks TO authenticated;
GRANT ALL ON public.seller_streaks TO service_role;
ALTER TABLE public.seller_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Seller reads own streak"
  ON public.seller_streaks FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE tm.user_id = seller_streaks.user_id
        AND t.created_by_user_id = auth.uid()
    )
  );

-- 4) helper: award a boost (idempotent)
CREATE OR REPLACE FUNCTION public.award_seller_boost(
  _user_id uuid, _key text, _dedupe text, _uses int, _meta jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.seller_boosts(user_id, boost_key, status, remaining_uses, dedupe_key, meta)
  VALUES (_user_id, _key, 'earned', COALESCE(_uses,0), _dedupe, COALESCE(_meta,'{}'::jsonb))
  ON CONFLICT (user_id, boost_key, dedupe_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- 5) manual activation
CREATE OR REPLACE FUNCTION public.activate_seller_boost(_boost_id uuid)
RETURNS public.seller_boosts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.seller_boosts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inte inloggad'; END IF;
  SELECT * INTO v_row FROM public.seller_boosts WHERE id=_boost_id;
  IF NOT FOUND OR v_row.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_row.status <> 'earned' THEN RAISE EXCEPTION 'Boost är inte aktiverbar'; END IF;
  UPDATE public.seller_boosts SET status='active', activated_at=now()
    WHERE id=_boost_id RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- 6) boost effects on new purchases
CREATE OR REPLACE FUNCTION public.apply_boost_effects()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := NEW.registered_by_user_id;
  v_tc int := COALESCE(NEW.tree_count,0);
  v_local_now timestamptz := COALESCE(NEW.paid_at, NEW.created_at, now());
  v_day date := (v_local_now AT TIME ZONE 'Europe/Stockholm')::date;
  v_iso_week text := to_char((v_local_now AT TIME ZONE 'Europe/Stockholm'), 'IYYY"-W"IW');
  v_total int; v_today_count int; v_today_trees int; v_week_trees int;
  v_last_before timestamptz;
  v_gold_used int;
  v_multiplier int := 1;
  v_boost_row public.seller_boosts%ROWTYPE;
  v_team_id uuid; v_goal int; v_team_week_trees int;
  v_prev_total int;
  v_threshold int;
  v_thresholds int[] := ARRAY[10,25,50,100];
  i int;
BEGIN
  IF NEW.status <> 'paid' OR v_uid IS NULL OR v_tc <= 0 OR NEW.source IS DISTINCT FROM 'smaarty' THEN
    RETURN NEW;
  END IF;

  -- totals
  SELECT COALESCE(SUM(tree_count),0)::int INTO v_total
    FROM public.purchases WHERE registered_by_user_id=v_uid AND status='paid';
  v_prev_total := v_total - v_tc;

  SELECT COUNT(*)::int, COALESCE(SUM(tree_count),0)::int INTO v_today_count, v_today_trees
    FROM public.purchases
    WHERE registered_by_user_id=v_uid AND status='paid'
      AND (COALESCE(paid_at, created_at) AT TIME ZONE 'Europe/Stockholm')::date = v_day;

  SELECT COALESCE(SUM(tree_count),0)::int INTO v_week_trees
    FROM public.purchases
    WHERE registered_by_user_id=v_uid AND status='paid'
      AND to_char((COALESCE(paid_at, created_at) AT TIME ZONE 'Europe/Stockholm'),'IYYY"-W"IW') = v_iso_week;

  -- ==== Instant effects ====

  -- Guldplantering (1% chance, max 1 per week)
  SELECT COUNT(*)::int INTO v_gold_used
    FROM public.point_transactions
    WHERE seller_user_id=v_uid
      AND metadata->>'boost_key'='guldplantering'
      AND to_char((created_at AT TIME ZONE 'Europe/Stockholm'),'IYYY"-W"IW') = v_iso_week;
  IF v_gold_used = 0 AND random() < 0.01 THEN
    INSERT INTO public.point_transactions(seller_user_id, delta, type, reference_id, description, metadata)
    VALUES (v_uid, v_tc*2, 'boost_gold', NEW.id, 'Guldplantering: 3x poäng',
            jsonb_build_object('boost_key','guldplantering','purchase_id',NEW.id));
  END IF;

  -- Comeback: last purchase before this was >=14 days ago
  SELECT MAX(COALESCE(paid_at, created_at)) INTO v_last_before
    FROM public.purchases
    WHERE registered_by_user_id=v_uid AND status='paid' AND id <> NEW.id;
  IF v_last_before IS NULL OR (v_local_now - v_last_before) >= INTERVAL '14 days' THEN
    IF v_last_before IS NOT NULL THEN
      INSERT INTO public.point_transactions(seller_user_id, delta, type, reference_id, description, metadata)
      VALUES (v_uid, v_tc, 'boost_comeback', NEW.id, 'Comeback: 2x på första planteringen efter paus',
              jsonb_build_object('boost_key','comeback','purchase_id',NEW.id));
    END IF;
  END IF;

  -- Active turbo (pick oldest active)
  SELECT * INTO v_boost_row FROM public.seller_boosts
    WHERE user_id=v_uid AND status='active' AND remaining_uses>0
      AND boost_key IN ('turbo')
    ORDER BY activated_at NULLS LAST, earned_at
    LIMIT 1;
  IF FOUND THEN
    v_multiplier := COALESCE((v_boost_row.meta->>'factor')::int, 2);
    INSERT INTO public.point_transactions(seller_user_id, delta, type, reference_id, description, metadata)
    VALUES (v_uid, v_tc*(v_multiplier-1), 'boost_turbo', NEW.id, 'Turbo aktiv',
            jsonb_build_object('boost_key','turbo','purchase_id',NEW.id,'factor',v_multiplier,'boost_id',v_boost_row.id));
    UPDATE public.seller_boosts
      SET remaining_uses = remaining_uses - 1,
          status = CASE WHEN remaining_uses - 1 <= 0 THEN 'consumed' ELSE status END,
          consumed_at = CASE WHEN remaining_uses - 1 <= 0 THEN now() ELSE consumed_at END
      WHERE id = v_boost_row.id;
  END IF;

  -- Hattrick: third purchase of the day
  IF v_today_count = 3 THEN
    INSERT INTO public.point_transactions(seller_user_id, delta, type, reference_id, description, metadata)
    VALUES (v_uid, 30, 'boost_hattrick', NEW.id, 'Hattrick: 3 planteringar på en dag',
            jsonb_build_object('boost_key','hattrick','purchase_id',NEW.id,'day',v_day));
  END IF;

  -- ==== Unlocks (idempotent via dedupe_key) ====

  -- Turbo: total_trees >= 10 (first-time)
  IF v_total >= 10 AND v_prev_total < 10 THEN
    PERFORM public.award_seller_boost(v_uid,'turbo','total10',5,
      jsonb_build_object('factor',2,'reason','total_trees>=10'));
  END IF;
  -- Turbo: personal weekly goal reached? interpret "veckomål nått" from team weekly_goal_trees
  SELECT tm.team_id INTO v_team_id FROM public.team_members tm WHERE tm.user_id=v_uid LIMIT 1;
  IF v_team_id IS NOT NULL THEN
    SELECT weekly_goal_trees INTO v_goal FROM public.teams WHERE id=v_team_id;
    IF COALESCE(v_goal,0) > 0 AND v_week_trees >= v_goal AND (v_week_trees - v_tc) < v_goal THEN
      PERFORM public.award_seller_boost(v_uid,'turbo','week:'||v_iso_week,5,
        jsonb_build_object('factor',2,'reason','week_goal'));
    END IF;

    -- Lagturbo: team weekly total crosses goal → every member gets a turbo
    SELECT COALESCE(SUM(p.tree_count),0)::int INTO v_team_week_trees
      FROM public.purchases p
      JOIN public.team_members tm ON tm.user_id=p.registered_by_user_id
      WHERE tm.team_id=v_team_id AND p.status='paid'
        AND to_char((COALESCE(p.paid_at,p.created_at) AT TIME ZONE 'Europe/Stockholm'),'IYYY"-W"IW')=v_iso_week;
    IF COALESCE(v_goal,0) > 0 AND v_team_week_trees >= v_goal AND (v_team_week_trees - v_tc) < v_goal THEN
      INSERT INTO public.seller_boosts(user_id, boost_key, status, remaining_uses, dedupe_key, meta)
      SELECT tm.user_id, 'turbo', 'earned', 5, 'team_week:'||v_iso_week||':'||v_team_id,
             jsonb_build_object('factor',2,'reason','lagturbo','team_id',v_team_id)
      FROM public.team_members tm WHERE tm.team_id=v_team_id
      ON CONFLICT (user_id, boost_key, dedupe_key) DO NOTHING;
    END IF;
  END IF;

  -- Skogsdag: 10 träd samma dag → turbo (dedupe per day)
  IF v_today_trees >= 10 AND (v_today_trees - v_tc) < 10 THEN
    PERFORM public.award_seller_boost(v_uid,'skogsdag','day:'||v_day,1,
      jsonb_build_object('day',v_day));
    PERFORM public.award_seller_boost(v_uid,'turbo','skogsdag:'||v_day,5,
      jsonb_build_object('factor',2,'reason','skogsdag'));
  END IF;

  -- Nivåboost: crossing level thresholds
  FOR i IN 1..array_length(v_thresholds,1) LOOP
    v_threshold := v_thresholds[i];
    IF v_total >= v_threshold AND v_prev_total < v_threshold THEN
      PERFORM public.award_seller_boost(v_uid,'nivaboost','level:'||v_threshold,0,
        jsonb_build_object('threshold',v_threshold));
      PERFORM public.award_seller_boost(v_uid,'turbo','level:'||v_threshold,5,
        jsonb_build_object('factor',2,'reason','nivaboost','threshold',v_threshold));
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_boost_effects ON public.purchases;
CREATE TRIGGER trg_apply_boost_effects
  AFTER INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.apply_boost_effects();

-- 7) weekly streak processor (runs weekly on Mondays)
CREATE OR REPLACE FUNCTION public.process_seller_weekly_streaks()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_week_end date := ((now() AT TIME ZONE 'Europe/Stockholm')::date - 1); -- yesterday (Sunday)
  v_week_start date := v_week_end - 6;
  v_iso_week text := to_char(make_date(EXTRACT(YEAR FROM v_week_end)::int,
                                       EXTRACT(MONTH FROM v_week_end)::int,
                                       EXTRACT(DAY FROM v_week_end)::int),
                              'IYYY"-W"IW');
  r RECORD;
  v_had_plant boolean;
  v_streak seller_streaks%ROWTYPE;
BEGIN
  FOR r IN
    SELECT DISTINCT registered_by_user_id AS user_id
    FROM public.purchases
    WHERE registered_by_user_id IS NOT NULL AND status='paid'
    UNION
    SELECT user_id FROM public.seller_streaks
  LOOP
    -- Skip if already processed
    SELECT * INTO v_streak FROM public.seller_streaks WHERE user_id=r.user_id;
    IF FOUND AND v_streak.last_counted_week = v_iso_week THEN CONTINUE; END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.purchases
      WHERE registered_by_user_id=r.user_id AND status='paid'
        AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Stockholm')::date BETWEEN v_week_start AND v_week_end
    ) INTO v_had_plant;

    IF NOT FOUND THEN
      INSERT INTO public.seller_streaks(user_id, current_weeks, best_weeks, last_counted_week, freezes)
      VALUES (r.user_id, 0, 0, NULL, 0);
      SELECT * INTO v_streak FROM public.seller_streaks WHERE user_id=r.user_id;
    END IF;

    IF v_had_plant THEN
      UPDATE public.seller_streaks
        SET current_weeks = current_weeks + 1,
            best_weeks = GREATEST(best_weeks, current_weeks + 1),
            last_counted_week = v_iso_week,
            updated_at = now()
        WHERE user_id = r.user_id
        RETURNING * INTO v_streak;
      -- Streakfrys var fjärde vecka
      IF v_streak.current_weeks % 4 = 0 THEN
        PERFORM public.award_seller_boost(r.user_id,'streakfrys',
          'weeks:'||v_streak.current_weeks, 1,
          jsonb_build_object('weeks',v_streak.current_weeks));
        UPDATE public.seller_streaks SET freezes = freezes + 1 WHERE user_id=r.user_id;
      END IF;
    ELSE
      IF v_streak.freezes > 0 THEN
        UPDATE public.seller_streaks
          SET freezes = freezes - 1,
              last_counted_week = v_iso_week,
              updated_at = now()
          WHERE user_id = r.user_id;
      ELSE
        UPDATE public.seller_streaks
          SET current_weeks = 0,
              last_counted_week = v_iso_week,
              updated_at = now()
          WHERE user_id = r.user_id;
      END IF;
    END IF;
  END LOOP;
END $$;

-- 8) pg_cron: Mondays 06:00 Europe/Stockholm ≈ 04:00/05:00 UTC. Use 05:00 UTC.
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule('seller-weekly-streaks');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'seller-weekly-streaks',
  '0 5 * * 1',
  $$ SELECT public.process_seller_weekly_streaks(); $$
);
