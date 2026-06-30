DELETE FROM public.reward_orders WHERE reward_id IN (SELECT id FROM public.rewards WHERE image_url IS NULL OR image_url = '');
DELETE FROM public.rewards WHERE image_url IS NULL OR image_url = '';