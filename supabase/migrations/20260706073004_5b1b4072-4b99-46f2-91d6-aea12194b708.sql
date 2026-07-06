
-- ============ TABLES ============
CREATE TABLE public.club_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lov INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.club_wallets TO authenticated;
GRANT ALL ON public.club_wallets TO service_role;
ALTER TABLE public.club_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wallet" ON public.club_wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin wallets" ON public.club_wallets FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TABLE public.lov_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lov_tx_dedupe ON public.lov_transactions(user_id, reason, ref_id) WHERE ref_id IS NOT NULL;
CREATE INDEX lov_tx_user_idx ON public.lov_transactions(user_id, created_at DESC);
GRANT SELECT ON public.lov_transactions TO authenticated;
GRANT ALL ON public.lov_transactions TO service_role;
ALTER TABLE public.lov_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tx" ON public.lov_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin tx" ON public.lov_transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TABLE public.partner_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  lov_cost INTEGER NOT NULL CHECK (lov_cost >= 0),
  code_type TEXT NOT NULL DEFAULT 'static' CHECK (code_type IN ('static','unique')),
  code_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  stock INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_deals TO authenticated, anon;
GRANT ALL ON public.partner_deals TO service_role;
ALTER TABLE public.partner_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read active deals" ON public.partner_deals FOR SELECT USING (active = true OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "admin manage deals" ON public.partner_deals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TABLE public.deal_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.partner_deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_issued TEXT NOT NULL,
  lov_cost INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX deal_claims_user_idx ON public.deal_claims(user_id, created_at DESC);
CREATE INDEX deal_claims_deal_idx ON public.deal_claims(deal_id, created_at DESC);
GRANT SELECT ON public.deal_claims TO authenticated;
GRANT ALL ON public.deal_claims TO service_role;
ALTER TABLE public.deal_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own claims" ON public.deal_claims FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin claims" ON public.deal_claims FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TABLE public.competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  end_date TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.competitions TO authenticated, anon;
GRANT ALL ON public.competitions TO service_role;
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read active comps" ON public.competitions FOR SELECT USING (active = true OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "admin manage comps" ON public.competitions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- ============ CORE FUNCTION: award_lov (idempotent) ============
CREATE OR REPLACE FUNCTION public.award_lov(_user_id UUID, _delta INT, _reason TEXT, _ref_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _delta = 0 THEN RETURN FALSE; END IF;
  BEGIN
    INSERT INTO public.lov_transactions(user_id, delta, reason, ref_id)
    VALUES (_user_id, _delta, _reason, _ref_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN FALSE;
  END;
  INSERT INTO public.club_wallets(user_id, lov, updated_at)
  VALUES (_user_id, _delta, now())
  ON CONFLICT (user_id) DO UPDATE SET lov = public.club_wallets.lov + EXCLUDED.lov, updated_at = now();
  RETURN TRUE;
END $$;

-- Trigger: certificate linked to user
CREATE OR REPLACE FUNCTION public._cert_award_lov()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_first BOOLEAN;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id THEN RETURN NEW; END IF;

  PERFORM public.award_lov(NEW.user_id, 20 * COALESCE(NEW.tree_count,0), 'cert_link', NEW.id::text);
  PERFORM public.award_lov(NEW.user_id, 30, 'cert_first_download', NEW.id::text);

  SELECT NOT EXISTS(
    SELECT 1 FROM public.lov_transactions
    WHERE user_id = NEW.user_id AND reason = 'signup_recipient'
  ) INTO v_first;
  IF v_first THEN
    PERFORM public.award_lov(NEW.user_id, 50, 'signup_recipient', NEW.user_id::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cert_award_lov ON public.certificates;
CREATE TRIGGER trg_cert_award_lov
AFTER INSERT OR UPDATE OF user_id ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public._cert_award_lov();

-- Trigger: monthly-paid purchase
CREATE OR REPLACE FUNCTION public._monthly_award_lov()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID;
BEGIN
  IF NEW.status <> 'paid' OR COALESCE(NEW.source,'') <> 'monthly' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN RETURN NEW; END IF;

  -- Find recipient user via customer email
  SELECT p.user_id INTO v_uid
  FROM public.customers c
  JOIN public.profiles p ON lower(p.email) = lower(c.email)
  WHERE c.id = NEW.customer_id
  LIMIT 1;

  IF v_uid IS NOT NULL THEN
    PERFORM public.award_lov(v_uid, 40, 'monthly_paid', NEW.id::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_monthly_award_lov ON public.purchases;
CREATE TRIGGER trg_monthly_award_lov
AFTER INSERT OR UPDATE OF status ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public._monthly_award_lov();

-- ============ CLAIM DEAL ============
CREATE OR REPLACE FUNCTION public.claim_deal(_deal_id UUID)
RETURNS public.deal_claims
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_deal public.partner_deals%ROWTYPE;
  v_bal INT;
  v_code TEXT;
  v_codes JSONB;
  v_claim public.deal_claims%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Inte inloggad'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('claim_deal'), hashtext(v_uid::text));

  SELECT * INTO v_deal FROM public.partner_deals WHERE id = _deal_id FOR UPDATE;
  IF NOT FOUND OR NOT v_deal.active THEN RAISE EXCEPTION 'Deal ej tillgänglig'; END IF;
  IF v_deal.stock IS NOT NULL AND v_deal.stock <= 0 THEN RAISE EXCEPTION 'Slutsåld'; END IF;

  SELECT COALESCE(lov,0) INTO v_bal FROM public.club_wallets WHERE user_id = v_uid;
  IF COALESCE(v_bal,0) < v_deal.lov_cost THEN
    RAISE EXCEPTION 'Du saknar % löv', (v_deal.lov_cost - COALESCE(v_bal,0));
  END IF;

  IF v_deal.code_type = 'static' THEN
    v_code := COALESCE(v_deal.code_data->>'code', '');
    IF v_code = '' THEN RAISE EXCEPTION 'Kod saknas'; END IF;
  ELSE
    v_codes := COALESCE(v_deal.code_data->'codes', '[]'::jsonb);
    IF jsonb_array_length(v_codes) = 0 THEN RAISE EXCEPTION 'Inga koder kvar'; END IF;
    v_code := v_codes->>0;
    UPDATE public.partner_deals
      SET code_data = jsonb_set(code_data, '{codes}', (v_codes - 0))
      WHERE id = v_deal.id;
  END IF;

  IF v_deal.stock IS NOT NULL THEN
    UPDATE public.partner_deals SET stock = stock - 1 WHERE id = v_deal.id;
  END IF;

  INSERT INTO public.deal_claims(deal_id, user_id, code_issued, lov_cost)
  VALUES (v_deal.id, v_uid, v_code, v_deal.lov_cost)
  RETURNING * INTO v_claim;

  -- Deduct löv
  INSERT INTO public.lov_transactions(user_id, delta, reason, ref_id)
  VALUES (v_uid, -v_deal.lov_cost, 'claim_deal', v_claim.id::text);
  UPDATE public.club_wallets SET lov = lov - v_deal.lov_cost, updated_at = now() WHERE user_id = v_uid;

  RETURN v_claim;
END $$;

-- ============ MY CLUB RPC ============
CREATE OR REPLACE FUNCTION public.get_my_club()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_lov INT;
  v_trees INT;
  v_claims JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Inte inloggad'; END IF;
  SELECT COALESCE(lov,0) INTO v_lov FROM public.club_wallets WHERE user_id = v_uid;
  SELECT COALESCE(SUM(tree_count),0)::int INTO v_trees FROM public.certificates WHERE user_id = v_uid;
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_claims FROM (
    SELECT dc.id, dc.deal_id, dc.code_issued, dc.created_at, d.title, d.partner_name
    FROM public.deal_claims dc
    JOIN public.partner_deals d ON d.id = dc.deal_id
    WHERE dc.user_id = v_uid
  ) x;
  RETURN jsonb_build_object('lov', COALESCE(v_lov,0), 'trees', v_trees, 'claims', v_claims);
END $$;

-- ============ INSIGHTS: Trädbanken ============
CREATE OR REPLACE FUNCTION public.admin_insights_treebank()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_members INT;
  v_lov_out BIGINT;
  v_claims_30d INT;
BEGIN
  PERFORM public._assert_admin();
  SELECT COUNT(*)::int INTO v_members FROM public.club_wallets WHERE lov > 0;
  SELECT COALESCE(SUM(lov),0)::bigint INTO v_lov_out FROM public.club_wallets;
  SELECT COUNT(*)::int INTO v_claims_30d FROM public.deal_claims WHERE created_at >= now() - INTERVAL '30 days';
  RETURN jsonb_build_object('members', v_members, 'lov_out', v_lov_out, 'claims_30d', v_claims_30d);
END $$;

-- ============ BACKFILL ============
-- Signup bonus for existing profiles that ever received a certificate
INSERT INTO public.lov_transactions(user_id, delta, reason, ref_id)
SELECT DISTINCT c.user_id, 50, 'signup_recipient', c.user_id::text
FROM public.certificates c
WHERE c.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.lov_transactions(user_id, delta, reason, ref_id)
SELECT c.user_id, 20 * c.tree_count, 'cert_link', c.id::text
FROM public.certificates c WHERE c.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.club_wallets(user_id, lov)
SELECT user_id, SUM(delta)::int FROM public.lov_transactions GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE SET lov = EXCLUDED.lov, updated_at = now();

CREATE TRIGGER partner_deals_touch BEFORE UPDATE ON public.partner_deals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER competitions_touch BEFORE UPDATE ON public.competitions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
