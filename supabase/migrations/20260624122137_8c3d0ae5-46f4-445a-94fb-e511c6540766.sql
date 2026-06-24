ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_type_check
  CHECK (account_type = ANY (ARRAY['privat'::text, 'foretag'::text, 'saljare'::text]));