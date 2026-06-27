
CREATE TABLE public.rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  threshold_trees int NOT NULL CHECK (threshold_trees >= 0),
  category text,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rewards_team_idx ON public.rewards(team_id);

GRANT SELECT ON public.rewards TO authenticated;
GRANT ALL ON public.rewards TO service_role;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers see rewards for their team"
ON public.rewards FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.user_id = auth.uid() AND tm.team_id = rewards.team_id
  )
);

CREATE POLICY "Admins manage rewards"
ON public.rewards FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER rewards_touch_updated_at
BEFORE UPDATE ON public.rewards
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


CREATE TABLE public.reward_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  seller_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'begard' CHECK (status IN ('begard','uppfylld')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  fulfilled_by uuid
);
CREATE INDEX reward_claims_seller_idx ON public.reward_claims(seller_user_id);
CREATE INDEX reward_claims_reward_idx ON public.reward_claims(reward_id);

GRANT SELECT ON public.reward_claims TO authenticated;
GRANT ALL ON public.reward_claims TO service_role;
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers see own claims, admins see all"
ON public.reward_claims FOR SELECT TO authenticated
USING (
  seller_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins manage claims"
ON public.reward_claims FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
