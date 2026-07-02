CREATE OR REPLACE FUNCTION public.purchase_reward(_reward_id uuid)
RETURNS public.reward_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reward public.rewards%ROWTYPE;
  v_balance integer;
  v_order public.reward_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inte inloggad'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('reward_purchase'), hashtext(auth.uid()::text));
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