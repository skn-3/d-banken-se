
-- Remove duplicate rewards, keep the row with image_url (or earliest if tie), and prevent future duplicates.
WITH ranked AS (
  SELECT id, name,
    row_number() OVER (
      PARTITION BY name
      ORDER BY (image_url IS NULL), created_at ASC, id ASC
    ) AS rn
  FROM public.rewards
),
to_delete AS (SELECT id FROM ranked WHERE rn > 1)
DELETE FROM public.reward_orders WHERE reward_id IN (SELECT id FROM to_delete);

WITH ranked AS (
  SELECT id, name,
    row_number() OVER (
      PARTITION BY name
      ORDER BY (image_url IS NULL), created_at ASC, id ASC
    ) AS rn
  FROM public.rewards
)
DELETE FROM public.rewards WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS rewards_name_unique_idx ON public.rewards (name);
