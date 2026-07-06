
ALTER VIEW public.v_public_seller_profile SET (security_invoker = true);
ALTER VIEW public.v_public_team_ranking   SET (security_invoker = true);
ALTER FUNCTION public._validate_greeting() SET search_path = public;
