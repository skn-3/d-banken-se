
CREATE TABLE public.failed_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  error TEXT NOT NULL,
  event_type TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  alert_sent_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.failed_purchases TO service_role;
GRANT SELECT, UPDATE ON public.failed_purchases TO authenticated;
ALTER TABLE public.failed_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view failed_purchases"
  ON public.failed_purchases FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update failed_purchases"
  ON public.failed_purchases FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX failed_purchases_unresolved_idx ON public.failed_purchases (created_at DESC) WHERE resolved = false;
