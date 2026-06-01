-- Organizations
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('school','company')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage organizations" ON public.organizations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Teams
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_teams_org ON public.teams(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage teams" ON public.teams
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Team members (sellers / team_leaders)
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'seller' CHECK (role IN ('seller','team_leader')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_team_members_team ON public.team_members(team_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage team members" ON public.team_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Sellers can see their own membership row
CREATE POLICY "Users see own team membership" ON public.team_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Sellers can read their own team
CREATE POLICY "Sellers read own team" ON public.teams
  FOR SELECT TO authenticated
  USING (id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()));

-- Sellers can read their own organization
CREATE POLICY "Sellers read own organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT t.organization_id FROM public.teams t
    JOIN public.team_members m ON m.team_id = t.id
    WHERE m.user_id = auth.uid()
  ));

-- Allow authenticated sellers to insert purchases attributed to themselves
-- (existing INSERT policy required auth.uid() = user_id, but for seller flow we set registered_by_user_id)
CREATE POLICY "Sellers create attributed purchases" ON public.purchases
  FOR INSERT TO authenticated
  WITH CHECK (registered_by_user_id = auth.uid());

-- Allow sellers to view purchases they've registered
CREATE POLICY "Sellers view own registered purchases" ON public.purchases
  FOR SELECT TO authenticated
  USING (registered_by_user_id = auth.uid());

-- Trigger for updated_at on organizations & teams
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_orgs_touch BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_teams_touch BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();