-- Add 'seller' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'seller';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'team_leader';