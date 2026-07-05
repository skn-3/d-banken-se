
-- Push subscriptions
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own subs" ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX push_subs_user_idx ON public.push_subscriptions(user_id);

-- Minor flag + guardian on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_minor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guardian_email text;

-- Log table for push sends
CREATE TABLE public.push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ok int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.push_log TO authenticated;
GRANT ALL ON public.push_log TO service_role;
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read push log" ON public.push_log FOR SELECT
  USING (public.has_role(auth.uid(),'admin'::public.app_role));

-- Trigger: enqueue push when a boost is earned (turbo/lagturbo/nivaboost/skogsdag)
CREATE OR REPLACE FUNCTION public.enqueue_boost_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url text := 'https://project--yakwdirpbwdtsdpxlbkp.lovable.app/api/public/push-notify';
  v_key text;
BEGIN
  IF NEW.status <> 'earned' THEN RETURN NEW; END IF;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='SUPABASE_ANON_KEY' LIMIT 1;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object(
      'kind', CASE WHEN NEW.meta->>'reason' = 'lagturbo' THEN 'team_turbo'
                   WHEN NEW.boost_key = 'nivaboost' THEN 'level_up'
                   ELSE 'boost_earned' END,
      'user_id', NEW.user_id,
      'boost_key', NEW.boost_key,
      'meta', NEW.meta
    )
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enqueue_boost_push ON public.seller_boosts;
CREATE TRIGGER trg_enqueue_boost_push
  AFTER INSERT ON public.seller_boosts
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_boost_push();

-- Weekly streak reminder: Thursday 16:00 UTC (17:00 Europe/Stockholm CET)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN
  PERFORM cron.unschedule('push_streak_reminder');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'push_streak_reminder',
  '0 16 * * 4',
  $$SELECT net.http_post(
    url := 'https://project--yakwdirpbwdtsdpxlbkp.lovable.app/api/public/push-notify',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('kind','streak_reminder_batch')
  );$$
);
