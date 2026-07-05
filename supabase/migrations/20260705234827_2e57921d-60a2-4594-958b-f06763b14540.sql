CREATE TABLE public.welcome_emails_sent (
  user_id uuid NOT NULL,
  kind text NOT NULL,
  team_id uuid NOT NULL,
  sent_to text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, team_id)
);
GRANT ALL ON public.welcome_emails_sent TO service_role;
ALTER TABLE public.welcome_emails_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON public.welcome_emails_sent FOR ALL USING (false) WITH CHECK (false);