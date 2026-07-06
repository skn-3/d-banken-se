ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS cert_template_id uuid
  REFERENCES public.cert_templates(id) ON DELETE SET NULL;