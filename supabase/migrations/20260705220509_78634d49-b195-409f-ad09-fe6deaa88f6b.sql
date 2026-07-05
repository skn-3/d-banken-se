-- Internal admin notes (attached to any entity via subject_type + subject_id)
CREATE TABLE public.admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('customer','seller','team','certificate','purchase')),
  subject_id text NOT NULL,
  note text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_notes_subject_idx ON public.admin_notes (subject_type, subject_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notes TO authenticated;
GRANT ALL ON public.admin_notes TO service_role;

ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read admin_notes"
  ON public.admin_notes FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert admin_notes"
  ON public.admin_notes FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());

CREATE POLICY "Admins delete admin_notes"
  ON public.admin_notes FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Soft-disable flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz;