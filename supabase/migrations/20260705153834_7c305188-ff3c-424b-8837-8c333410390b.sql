
CREATE TABLE public.project_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  headline text NOT NULL,
  body text NOT NULL,
  image_url text,
  cta_label text,
  cta_url text,
  audience_kind text NOT NULL,
  audience_value text,
  recipient_count integer NOT NULL DEFAULT 0,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.project_updates TO authenticated;
GRANT ALL ON public.project_updates TO service_role;

ALTER TABLE public.project_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read project_updates"
  ON public.project_updates
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
