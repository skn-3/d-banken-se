
-- 1) Team config columns for weekly goal & team bonus
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS weekly_goal_trees integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS team_bonus_points integer NOT NULL DEFAULT 0;

-- 2) Track when a team has been awarded its weekly bonus (idempotency per ISO week)
CREATE TABLE IF NOT EXISTS public.team_week_bonus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  iso_week text NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, iso_week)
);
GRANT SELECT ON public.team_week_bonus TO authenticated;
GRANT ALL ON public.team_week_bonus TO service_role;
ALTER TABLE public.team_week_bonus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_week_bonus visible to team members and admins" ON public.team_week_bonus;
CREATE POLICY "team_week_bonus visible to team members and admins"
  ON public.team_week_bonus
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_week_bonus.team_id AND tm.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 3) Idempotency indexes for bonus types using description as natural key
CREATE UNIQUE INDEX IF NOT EXISTS ux_pt_bonus_sprint
  ON public.point_transactions(seller_user_id, description)
  WHERE type = 'bonus_sprint';
CREATE UNIQUE INDEX IF NOT EXISTS ux_pt_bonus_team
  ON public.point_transactions(seller_user_id, description)
  WHERE type = 'bonus_team';
CREATE UNIQUE INDEX IF NOT EXISTS ux_pt_bonus_streak
  ON public.point_transactions(seller_user_id, description)
  WHERE type = 'bonus_streak';

-- 4) Updated trigger: keep prompt 7/8a logic, add sprint/team/streak bonuses
CREATE OR REPLACE FUNCTION public.add_sale_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prev int;
  v_new int;
  v_thresh int;
  v_bonus int;
  v_event public.point_events%ROWTYPE;
  v_milestones int[][] := ARRAY[[25,5],[50,15],[100,40]];
  v_streak_thresh int[] := ARRAY[3,7,14];
  v_streak_bonus int[] := ARRAY[3,8,15];
  i int;
  v_sale_ts timestamptz;
  v_iso_week text;
  v_local_dow int;
  v_weekend_total int;
  v_team_id uuid;
  v_goal int;
  v_team_bonus int;
  v_team_week_total int;
  v_today date;
  v_anchor date;
  v_streak int := 0;
  v_d date;
BEGIN
  IF NEW.status <> 'paid' OR NEW.registered_by_user_id IS NULL OR NEW.tree_count <= 0 THEN
    RETURN NEW;
  END IF;

  v_sale_ts := COALESCE(NEW.paid_at, NEW.created_at, now());
  v_iso_week := to_char((v_sale_ts AT TIME ZONE 'Europe/Stockholm'), 'IYYY"-W"IW');

  -- 1) Base sale points (idempotent)
  INSERT INTO public.point_transactions (seller_user_id, delta, type, reference_id, description)
  SELECT NEW.registered_by_user_id, NEW.tree_count, 'sale', NEW.id, 'Sålda träd'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.point_transactions
    WHERE type = 'sale' AND reference_id = NEW.id
  );

  -- 2) Double-points event bonus
  SELECT * INTO v_event
  FROM public.point_events
  WHERE active = true AND now() >= start_at AND now() < end_at
  ORDER BY start_at DESC LIMIT 1;
  IF FOUND AND v_event.multiplier > 1 THEN
    INSERT INTO public.point_transactions (seller_user_id, delta, type, reference_id, description)
    SELECT NEW.registered_by_user_id,
           NEW.tree_count * (v_event.multiplier - 1),
           'bonus_double', NEW.id,
           'Dubbelpoäng: ' || v_event.name
    WHERE NOT EXISTS (
      SELECT 1 FROM public.point_transactions
      WHERE type = 'bonus_double' AND reference_id = NEW.id
    );
  END IF;

  -- 3) Milestone bonuses (total trees crossing thresholds)
  SELECT COALESCE(SUM(tree_count),0)::int INTO v_new
  FROM public.purchases
  WHERE registered_by_user_id = NEW.registered_by_user_id AND status = 'paid';
  v_prev := v_new - NEW.tree_count;
  FOR i IN 1 .. array_upper(v_milestones, 1) LOOP
    v_thresh := v_milestones[i][1];
    v_bonus := v_milestones[i][2];
    IF v_new >= v_thresh AND v_prev < v_thresh THEN
      INSERT INTO public.point_transactions (seller_user_id, delta, type, reference_id, description)
      VALUES (NEW.registered_by_user_id, v_bonus, 'bonus_milestone', NULL, 'Milstolpe: ' || v_thresh || ' träd')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- 4) Weekend sprint (Sat/Sun in Europe/Stockholm)
  v_local_dow := EXTRACT(ISODOW FROM (v_sale_ts AT TIME ZONE 'Europe/Stockholm'))::int;
  IF v_local_dow IN (6,7) THEN
    SELECT COALESCE(SUM(p.tree_count),0)::int INTO v_weekend_total
    FROM public.purchases p
    WHERE p.registered_by_user_id = NEW.registered_by_user_id
      AND p.status = 'paid'
      AND to_char((COALESCE(p.paid_at, p.created_at) AT TIME ZONE 'Europe/Stockholm'), 'IYYY"-W"IW') = v_iso_week
      AND EXTRACT(ISODOW FROM (COALESCE(p.paid_at, p.created_at) AT TIME ZONE 'Europe/Stockholm')) IN (6,7);
    IF v_weekend_total >= 5 THEN
      INSERT INTO public.point_transactions (seller_user_id, delta, type, reference_id, description)
      VALUES (NEW.registered_by_user_id, 10, 'bonus_sprint', NULL, 'Helg-sprint: ' || v_iso_week)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- 5) Team bonus
  SELECT tm.team_id INTO v_team_id
  FROM public.team_members tm
  WHERE tm.user_id = NEW.registered_by_user_id
  LIMIT 1;
  IF v_team_id IS NOT NULL THEN
    SELECT weekly_goal_trees, team_bonus_points INTO v_goal, v_team_bonus
    FROM public.teams WHERE id = v_team_id;
    IF COALESCE(v_goal,0) > 0 AND COALESCE(v_team_bonus,0) > 0 THEN
      SELECT COALESCE(SUM(p.tree_count),0)::int INTO v_team_week_total
      FROM public.purchases p
      JOIN public.team_members tm ON tm.user_id = p.registered_by_user_id
      WHERE tm.team_id = v_team_id
        AND p.status = 'paid'
        AND to_char((COALESCE(p.paid_at, p.created_at) AT TIME ZONE 'Europe/Stockholm'), 'IYYY"-W"IW') = v_iso_week;
      IF v_team_week_total >= v_goal THEN
        INSERT INTO public.team_week_bonus (team_id, iso_week) VALUES (v_team_id, v_iso_week)
        ON CONFLICT (team_id, iso_week) DO NOTHING;
        IF FOUND THEN
          INSERT INTO public.point_transactions (seller_user_id, delta, type, reference_id, description)
          SELECT tm.user_id, v_team_bonus, 'bonus_team', NULL, 'Lag-bonus: ' || v_iso_week
          FROM public.team_members tm WHERE tm.team_id = v_team_id;
        END IF;
      END IF;
    END IF;
  END IF;

  -- 6) Streak milestones (compute current streak in Europe/Stockholm)
  v_today := (now() AT TIME ZONE 'Europe/Stockholm')::date;
  IF EXISTS (
    SELECT 1 FROM public.purchases
    WHERE registered_by_user_id = NEW.registered_by_user_id AND status='paid'
      AND (COALESCE(paid_at, created_at) AT TIME ZONE 'Europe/Stockholm')::date = v_today
  ) THEN
    v_anchor := v_today;
  ELSIF EXISTS (
    SELECT 1 FROM public.purchases
    WHERE registered_by_user_id = NEW.registered_by_user_id AND status='paid'
      AND (COALESCE(paid_at, created_at) AT TIME ZONE 'Europe/Stockholm')::date = v_today - 1
  ) THEN
    v_anchor := v_today - 1;
  ELSE
    v_anchor := NULL;
  END IF;

  IF v_anchor IS NOT NULL THEN
    v_d := v_anchor;
    LOOP
      EXIT WHEN v_streak > 365;
      IF EXISTS (
        SELECT 1 FROM public.purchases
        WHERE registered_by_user_id = NEW.registered_by_user_id AND status='paid'
          AND (COALESCE(paid_at, created_at) AT TIME ZONE 'Europe/Stockholm')::date = v_d
      ) THEN
        v_streak := v_streak + 1;
        v_d := v_d - 1;
      ELSE
        EXIT;
      END IF;
    END LOOP;
  END IF;

  FOR i IN 1 .. array_length(v_streak_thresh, 1) LOOP
    IF v_streak >= v_streak_thresh[i] THEN
      INSERT INTO public.point_transactions (seller_user_id, delta, type, reference_id, description)
      VALUES (NEW.registered_by_user_id, v_streak_bonus[i], 'bonus_streak', NULL, 'Streak: ' || v_streak_thresh[i] || ' dagar')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END
$function$;

-- Ensure the trigger is wired (idempotent recreate)
DROP TRIGGER IF EXISTS trg_add_sale_points ON public.purchases;
CREATE TRIGGER trg_add_sale_points
  AFTER INSERT ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.add_sale_points();
