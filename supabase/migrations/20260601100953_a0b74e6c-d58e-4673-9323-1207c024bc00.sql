
-- Protect admin role for johannes@malke.se from accidental removal,
-- and auto-grant on (re)creation of the profile.

CREATE OR REPLACE FUNCTION public.protect_permanent_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = OLD.user_id;
  IF OLD.role = 'admin'::public.app_role AND lower(coalesce(v_email,'')) = 'johannes@malke.se' THEN
    RAISE EXCEPTION 'Cannot remove permanent admin role for %', v_email;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_permanent_admin ON public.user_roles;
CREATE TRIGGER trg_protect_permanent_admin
BEFORE DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_permanent_admin();

-- Auto-grant admin role when the permanent admin profile is (re)created.
CREATE OR REPLACE FUNCTION public.grant_permanent_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.email,'')) = 'johannes@malke.se' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_permanent_admin ON public.profiles;
CREATE TRIGGER trg_grant_permanent_admin
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.grant_permanent_admin();

-- Ensure the role exists right now as well.
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'admin'::public.app_role
FROM public.profiles p
WHERE lower(p.email) = 'johannes@malke.se'
ON CONFLICT (user_id, role) DO NOTHING;
