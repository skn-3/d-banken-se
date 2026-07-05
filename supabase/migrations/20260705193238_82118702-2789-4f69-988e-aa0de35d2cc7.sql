
-- 1) app_settings: team share price in ören per tree
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS team_share_ore_per_tree integer NOT NULL DEFAULT 0;

-- 2) purchases: team_id + team_share_ore
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_share_ore integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_purchases_team_id ON public.purchases(team_id);

-- 3) trigger: on insert of smaarty-purchases, stamp team_id + team_share_ore
CREATE OR REPLACE FUNCTION public.stamp_smaarty_team_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ore_per int := 0;
  v_team_id uuid;
BEGIN
  IF NEW.source IS NULL OR NEW.source <> 'smaarty' THEN
    RETURN NEW;
  END IF;
  IF NEW.registered_by_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT team_share_ore_per_tree INTO v_ore_per FROM public.app_settings WHERE id = 1;
  SELECT team_id INTO v_team_id FROM public.team_members
    WHERE user_id = NEW.registered_by_user_id LIMIT 1;

  IF NEW.team_id IS NULL THEN NEW.team_id := v_team_id; END IF;
  IF COALESCE(NEW.team_share_ore, 0) = 0 THEN
    NEW.team_share_ore := COALESCE(NEW.tree_count, 0) * COALESCE(v_ore_per, 0);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_smaarty_team_share ON public.purchases;
CREATE TRIGGER trg_stamp_smaarty_team_share
  BEFORE INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.stamp_smaarty_team_share();

-- 4) payout_requests table
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  amount_ore integer NOT NULL CHECK (amount_ore >= 50000),
  recipient jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL,
  handled_by uuid,
  handled_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- Leader sees own team's requests
CREATE POLICY "Leader sees own team payout requests"
  ON public.payout_requests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = payout_requests.team_id AND t.created_by_user_id = auth.uid()
    )
  );

-- Leader can insert requests for own team (status must be pending)
CREATE POLICY "Leader can request payout for own team"
  ON public.payout_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id AND t.created_by_user_id = auth.uid()
    )
  );

-- Only admin can update status
CREATE POLICY "Admin manages payout requests"
  ON public.payout_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_payout_requests_team ON public.payout_requests(team_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON public.payout_requests(status);

CREATE TRIGGER payout_requests_touch
  BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
