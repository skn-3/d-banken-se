
-- Revoke public exec on generate_certificate (only server code should call it)
REVOKE EXECUTE ON FUNCTION public.generate_certificate(uuid) FROM PUBLIC, anon, authenticated;

-- has_role: only used inside RLS policies; revoke from PUBLIC, keep for anon/authenticated/service_role
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
