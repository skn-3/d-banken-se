ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_order_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchases_source_order_ref
  ON public.purchases(source_order_ref)
  WHERE source_order_ref IS NOT NULL;