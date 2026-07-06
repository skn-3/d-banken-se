
CREATE TABLE public.admin_ai_usage (
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  day date NOT NULL DEFAULT current_date,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (admin_id, kind, day)
);
GRANT SELECT ON public.admin_ai_usage TO authenticated;
GRANT ALL ON public.admin_ai_usage TO service_role;
ALTER TABLE public.admin_ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_ai_usage self read"
  ON public.admin_ai_usage FOR SELECT TO authenticated
  USING (admin_id = auth.uid());

CREATE OR REPLACE FUNCTION public.admin_bump_ai_usage(_kind text, _limit int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cur int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin krävs';
  END IF;
  SELECT count INTO cur FROM public.admin_ai_usage
    WHERE admin_id = auth.uid() AND kind = _kind AND day = current_date;
  IF COALESCE(cur, 0) >= _limit THEN
    RETURN false;
  END IF;
  INSERT INTO public.admin_ai_usage(admin_id, kind, day, count)
  VALUES (auth.uid(), _kind, current_date, 1)
  ON CONFLICT (admin_id, kind, day) DO UPDATE SET count = admin_ai_usage.count + 1;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_bump_ai_usage(text, int) TO authenticated;
