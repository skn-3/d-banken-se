DROP TABLE IF EXISTS public.reward_claims CASCADE;
DROP TABLE IF EXISTS public.rewards CASCADE;

CREATE TABLE public.rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  cost_points integer NOT NULL CHECK (cost_points >= 0),
  category text NOT NULL,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rewards TO authenticated;
GRANT ALL ON public.rewards TO service_role;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated reads rewards" ON public.rewards
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage rewards" ON public.rewards
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER rewards_touch_updated_at BEFORE UPDATE ON public.rewards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.reward_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES public.rewards(id) ON DELETE RESTRICT,
  seller_user_id uuid NOT NULL,
  cost_points integer NOT NULL CHECK (cost_points >= 0),
  status text NOT NULL DEFAULT 'begard' CHECK (status IN ('begard','uppfylld')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  fulfilled_by uuid
);
CREATE INDEX reward_orders_seller_idx ON public.reward_orders(seller_user_id);
CREATE INDEX reward_orders_reward_idx ON public.reward_orders(reward_id);
GRANT SELECT, INSERT, UPDATE ON public.reward_orders TO authenticated;
GRANT ALL ON public.reward_orders TO service_role;
ALTER TABLE public.reward_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers see own orders, admins all" ON public.reward_orders
  FOR SELECT TO authenticated
  USING (seller_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage orders" ON public.reward_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id uuid NOT NULL,
  delta integer NOT NULL,
  type text NOT NULL CHECK (type IN ('sale','spend','bonus_milestone','bonus_weekend','bonus_double','bonus_team','bonus_streak','bonus_other')),
  reference_id uuid,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX point_tx_seller_idx ON public.point_transactions(seller_user_id);
CREATE UNIQUE INDEX point_tx_type_ref_uniq ON public.point_transactions(type, reference_id) WHERE reference_id IS NOT NULL;
GRANT SELECT ON public.point_transactions TO authenticated;
GRANT ALL ON public.point_transactions TO service_role;
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers see own tx, admins all" ON public.point_transactions
  FOR SELECT TO authenticated
  USING (seller_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.add_sale_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND NEW.registered_by_user_id IS NOT NULL AND NEW.tree_count > 0 THEN
    INSERT INTO public.point_transactions (seller_user_id, delta, type, reference_id, description)
    SELECT NEW.registered_by_user_id, NEW.tree_count, 'sale', NEW.id, 'Sålda träd'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.point_transactions
      WHERE type = 'sale' AND reference_id = NEW.id
    );
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER purchases_add_sale_points
  AFTER INSERT OR UPDATE OF status, registered_by_user_id, tree_count ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.add_sale_points();

INSERT INTO public.point_transactions (seller_user_id, delta, type, reference_id, description, created_at)
SELECT p.registered_by_user_id, p.tree_count, 'sale', p.id, 'Sålda träd (backfill)', COALESCE(p.paid_at, p.created_at)
FROM public.purchases p
WHERE p.status = 'paid' AND p.registered_by_user_id IS NOT NULL AND p.tree_count > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.point_transactions t
    WHERE t.type = 'sale' AND t.reference_id = p.id
  );

CREATE OR REPLACE FUNCTION public.seller_points_balance(_user_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(delta),0)::int FROM public.point_transactions WHERE seller_user_id = _user_id;
$$;
GRANT EXECUTE ON FUNCTION public.seller_points_balance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.purchase_reward(_reward_id uuid)
RETURNS public.reward_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reward public.rewards%ROWTYPE;
  v_balance integer;
  v_order public.reward_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inte inloggad'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Du är inte säljare';
  END IF;
  SELECT * INTO v_reward FROM public.rewards WHERE id = _reward_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Belöningen finns inte'; END IF;
  IF NOT v_reward.active THEN RAISE EXCEPTION 'Belöningen är inte aktiv'; END IF;

  SELECT COALESCE(SUM(delta),0)::int INTO v_balance
  FROM public.point_transactions WHERE seller_user_id = auth.uid();
  IF v_balance < v_reward.cost_points THEN
    RAISE EXCEPTION 'Du saknar % poäng', (v_reward.cost_points - v_balance);
  END IF;

  INSERT INTO public.reward_orders (reward_id, seller_user_id, cost_points)
  VALUES (v_reward.id, auth.uid(), v_reward.cost_points)
  RETURNING * INTO v_order;

  INSERT INTO public.point_transactions (seller_user_id, delta, type, reference_id, description)
  VALUES (auth.uid(), -v_reward.cost_points, 'spend', v_order.id, 'Köpte ' || v_reward.name);

  RETURN v_order;
END $$;
GRANT EXECUTE ON FUNCTION public.purchase_reward(uuid) TO authenticated;

INSERT INTO public.rewards (name, cost_points, category, sort_order) VALUES
  ('Klistermärken / sticker-pack', 5, 'Småpriser', 10),
  ('Smaarty-pin / merch', 6, 'Småpriser', 20),
  ('Glass (presentkort)', 8, 'Småpriser', 30),
  ('El-sparkcykeltur', 8, 'Småpriser', 40),
  ('Godispåse', 10, 'Småpriser', 50),
  ('Robux / V-bucks (50 kr)', 10, 'Småpriser', 60),
  ('Happy Meal', 15, 'Mellanpriser', 110),
  ('Snabbmats-presentkort (100 kr)', 20, 'Mellanpriser', 120),
  ('Hamburgarmeny (Max/Babas)', 24, 'Mellanpriser', 130),
  ('Pizza family', 24, 'Mellanpriser', 140),
  ('Spotify Premium (1 mån)', 24, 'Mellanpriser', 150),
  ('Biobiljett', 28, 'Mellanpriser', 160),
  ('El-sparkcykel dagspass', 30, 'Mellanpriser', 170),
  ('Kläd-presentkort (200 kr)', 40, 'Storpriser', 210),
  ('Lasergame / trampolinpark', 40, 'Storpriser', 220),
  ('Hörlurar (in-ear)', 60, 'Storpriser', 230),
  ('Bio för två + snacks', 70, 'Storpriser', 240),
  ('Spotify / Netflix (3 mån)', 78, 'Storpriser', 250),
  ('AirPods', 360, 'Drömpriser', 310),
  ('Nintendo Switch', 700, 'Drömpriser', 320),
  ('iPad (budget)', 900, 'Drömpriser', 330),
  ('PlayStation 5', 1200, 'Drömpriser', 340),
  ('iPhone (budget)', 1400, 'Drömpriser', 350);
