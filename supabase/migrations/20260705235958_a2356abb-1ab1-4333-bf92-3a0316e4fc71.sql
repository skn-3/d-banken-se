
-- 1) rewards: stock + is_digital
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS stock integer,
  ADD COLUMN IF NOT EXISTS is_digital boolean NOT NULL DEFAULT false;
ALTER TABLE public.rewards
  ADD CONSTRAINT rewards_stock_nonneg CHECK (stock IS NULL OR stock >= 0);

-- 2) reward_orders: team_id snapshot + nya statustider + utökat statusflöde
ALTER TABLE public.reward_orders
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS packed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS packed_by   uuid,
  ADD COLUMN IF NOT EXISTS shipped_at  timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_by  uuid,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_by uuid;
CREATE INDEX IF NOT EXISTS reward_orders_team_status_idx ON public.reward_orders(team_id, status);

-- byt ut CHECK: tillåt både gamla och nya värden en migrationsomgång
ALTER TABLE public.reward_orders DROP CONSTRAINT IF EXISTS reward_orders_status_check;
ALTER TABLE public.reward_orders
  ADD CONSTRAINT reward_orders_status_check
  CHECK (status IN ('pending','packed','shipped','delivered','begard','uppfylld'));

-- migrera existerande värden
UPDATE public.reward_orders SET status = 'pending'   WHERE status = 'begard';
UPDATE public.reward_orders SET status = 'delivered', delivered_at = COALESCE(fulfilled_at, now()), delivered_by = fulfilled_by
  WHERE status = 'uppfylld';

-- backfill team_id från säljarens nuvarande medlemskap
UPDATE public.reward_orders o
   SET team_id = tm.team_id
  FROM public.team_members tm
 WHERE o.team_id IS NULL AND tm.user_id = o.seller_user_id;

-- stram CHECK till bara nya värden
ALTER TABLE public.reward_orders DROP CONSTRAINT reward_orders_status_check;
ALTER TABLE public.reward_orders
  ADD CONSTRAINT reward_orders_status_check
  CHECK (status IN ('pending','packed','shipped','delivered'));

ALTER TABLE public.reward_orders ALTER COLUMN status SET DEFAULT 'pending';

-- 3) Ledarupptäckt: hjälpfunktion (SECURITY DEFINER) för RLS utan rekursion
CREATE OR REPLACE FUNCTION public.is_team_leader(_user_id uuid, _team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id AND role = 'team_leader'
  ) OR EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = _team_id AND created_by_user_id = _user_id
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_team_leader(uuid,uuid) TO authenticated;

-- 4) RLS: säljare/ledare/admin
DROP POLICY IF EXISTS "Sellers see own orders, admins all" ON public.reward_orders;
DROP POLICY IF EXISTS "Admins manage orders" ON public.reward_orders;

CREATE POLICY "orders_select_seller_leader_admin" ON public.reward_orders
  FOR SELECT TO authenticated
  USING (
    seller_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (team_id IS NOT NULL AND public.is_team_leader(auth.uid(), team_id))
  );

CREATE POLICY "orders_insert_own_seller" ON public.reward_orders
  FOR INSERT TO authenticated
  WITH CHECK (seller_user_id = auth.uid());

CREATE POLICY "orders_update_admin" ON public.reward_orders
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Ledare får bara sätta delivered på sitt lags shipped-ordrar
CREATE POLICY "orders_update_leader_deliver" ON public.reward_orders
  FOR UPDATE TO authenticated
  USING (team_id IS NOT NULL AND public.is_team_leader(auth.uid(), team_id))
  WITH CHECK (team_id IS NOT NULL AND public.is_team_leader(auth.uid(), team_id));

-- 5) purchase_reward: snapshot team + stock-decrement + digital auto-delivered
CREATE OR REPLACE FUNCTION public.purchase_reward(_reward_id uuid)
RETURNS public.reward_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reward public.rewards%ROWTYPE;
  v_balance integer;
  v_team_id uuid;
  v_order public.reward_orders%ROWTYPE;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inte inloggad'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('reward_purchase'), hashtext(auth.uid()::text));

  SELECT team_id INTO v_team_id FROM public.team_members WHERE user_id = auth.uid() LIMIT 1;
  IF v_team_id IS NULL THEN RAISE EXCEPTION 'Du är inte säljare'; END IF;

  -- Lås rewards-raden atomiskt för lagerkontroll
  SELECT * INTO v_reward FROM public.rewards WHERE id = _reward_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Belöningen finns inte'; END IF;
  IF NOT v_reward.active THEN RAISE EXCEPTION 'Belöningen är inte aktiv'; END IF;
  IF v_reward.stock IS NOT NULL AND v_reward.stock <= 0 THEN RAISE EXCEPTION 'Slutsåld just nu'; END IF;

  SELECT COALESCE(SUM(delta),0)::int INTO v_balance
  FROM public.point_transactions WHERE seller_user_id = auth.uid();
  IF v_balance < v_reward.cost_points THEN
    RAISE EXCEPTION 'Du saknar % poäng', (v_reward.cost_points - v_balance);
  END IF;

  IF v_reward.stock IS NOT NULL THEN
    UPDATE public.rewards SET stock = stock - 1 WHERE id = v_reward.id;
  END IF;

  v_status := CASE WHEN v_reward.is_digital THEN 'delivered' ELSE 'pending' END;

  INSERT INTO public.reward_orders (reward_id, seller_user_id, cost_points, team_id, status,
    delivered_at, delivered_by)
  VALUES (v_reward.id, auth.uid(), v_reward.cost_points, v_team_id, v_status,
    CASE WHEN v_reward.is_digital THEN now() ELSE NULL END,
    CASE WHEN v_reward.is_digital THEN auth.uid() ELSE NULL END)
  RETURNING * INTO v_order;

  INSERT INTO public.point_transactions (seller_user_id, delta, type, reference_id, description)
  VALUES (auth.uid(), -v_reward.cost_points, 'spend', v_order.id, 'Köpte ' || v_reward.name);

  RETURN v_order;
END $$;
