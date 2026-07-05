
-- Newsletters log
CREATE TABLE IF NOT EXISTS public.newsletters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject         text NOT NULL,
  audience_kind   text NOT NULL,
  audience_value  text,
  headline        text,
  body            text,
  cta_label       text,
  cta_url         text,
  recipient_count integer NOT NULL DEFAULT 0,
  sent_by         uuid,
  sent_at         timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.newsletters TO authenticated;
GRANT ALL    ON public.newsletters TO service_role;
ALTER TABLE public.newsletters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read newsletters" ON public.newsletters
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Backup runs log
CREATE TABLE IF NOT EXISTS public.backup_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  ok          boolean NOT NULL DEFAULT false,
  files       jsonb NOT NULL DEFAULT '[]'::jsonb,
  deleted     jsonb NOT NULL DEFAULT '[]'::jsonb,
  note        text,
  triggered_by text NOT NULL DEFAULT 'cron'
);
GRANT SELECT ON public.backup_runs TO authenticated;
GRANT ALL    ON public.backup_runs TO service_role;
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read backup_runs" ON public.backup_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Storage policies for private bucket "backups": admin-only list/read via Data API
CREATE POLICY "Admins list backups"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'::public.app_role));
