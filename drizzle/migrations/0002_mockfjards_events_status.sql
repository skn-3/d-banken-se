ALTER TABLE public.mockfjards_events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.mockfjards_events ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
UPDATE public.mockfjards_events SET status = 'claimed', claimed_at = created_at WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS mockfjards_events_case_status_idx ON public.mockfjards_events (case_id, status);