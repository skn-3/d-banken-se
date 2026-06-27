
-- Drop existing partial unique index that blocks repeated INSERTs for same reference
-- (milestones use description-based uniqueness instead)
-- Add per-seller unique index for milestone bonuses
CREATE UNIQUE INDEX IF NOT EXISTS point_tx_milestone_uniq
  ON public.point_transactions (seller_user_id, description)
  WHERE type = 'bonus_milestone';

-- point_events table
CREATE TABLE public.point_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  multiplier integer NOT NULL DEFAULT 2 CHECK (multiplier >= 2 AND multiplier <= 10),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT ON public.point_events TO authenticated;
GRANT ALL ON public.point_events TO service_role;

ALTER TABLE public.point_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read events"
  ON public.point_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage events"
  ON public.point_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX point_events_active_window_idx ON public.point_events (active, start_at, end_at);

-- Updated trigger: sale points + milestone bonuses + active double-points event bonus
CREATE OR REPLACE FUNCTION public.add_sale_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prev integer;
  v_new integer;
  v_thresh integer;
  v_bonus integer;
  v_event public.point_events%ROWTYPE;
  v_milestones int[][] := ARRAY[[25,5],[50,15],[100,40]];
  i integer;
BEGIN
  IF NEW.status <> 'paid' OR NEW.registered_by_user_id IS NULL OR NEW.tree_count <= 0 THEN
    RETURN NEW;
  END IF;

  -- 1) Base sale points (idempotent on purchase id)
  INSERT INTO public.point_transactions (seller_user_id, delta, type, reference_id, description)
  SELECT NEW.registered_by_user_id, NEW.tree_count, 'sale', NEW.id, 'Sålda träd'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.point_transactions
    WHERE type = 'sale' AND reference_id = NEW.id
  );

  -- 2) Active double-points event bonus
  SELECT * INTO v_event
  FROM public.point_events
  WHERE active = true AND now() >= start_at AND now() < end_at
  ORDER BY start_at DESC
  LIMIT 1;

  IF FOUND AND v_event.multiplier > 1 THEN
    INSERT INTO public.point_transactions (seller_user_id, delta, type, reference_id, description)
    SELECT NEW.registered_by_user_id,
           NEW.tree_count * (v_event.multiplier - 1),
           'bonus_double',
           NEW.id,
           'Dubbelpoäng: ' || v_event.name
    WHERE NOT EXISTS (
      SELECT 1 FROM public.point_transactions
      WHERE type = 'bonus_double' AND reference_id = NEW.id
    );
  END IF;

  -- 3) Milestone bonuses (based on total sold trees crossing thresholds)
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

  RETURN NEW;
END $function$;
