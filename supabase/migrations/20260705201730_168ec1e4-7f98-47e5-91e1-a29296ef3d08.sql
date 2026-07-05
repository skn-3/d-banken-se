
ALTER TABLE public.rewards ADD COLUMN IF NOT EXISTS cost_ore integer NOT NULL DEFAULT 0 CHECK (cost_ore >= 0);
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS reward_budget_ore_per_tree integer NOT NULL DEFAULT 0 CHECK (reward_budget_ore_per_tree >= 0);
