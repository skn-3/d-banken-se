
CREATE OR REPLACE VIEW public.admin_greetings_view
WITH (security_invoker = true)
AS
SELECT
  p.id AS purchase_id,
  p.greeting AS purchase_greeting,
  p.created_at AS purchase_created_at,
  p.user_id,
  p.recipient_email,
  p.certificate_template_id,
  COALESCE(t.name, t.namn) AS template_name,
  c.id AS certificate_id,
  c.greeting AS certificate_greeting,
  c.verification_id,
  c.recipient_name,
  c.tree_count
FROM public.purchases p
LEFT JOIN public.cert_templates t ON t.id = p.certificate_template_id
LEFT JOIN public.certificates c ON c.purchase_id = p.id
WHERE p.greeting IS NOT NULL OR c.greeting IS NOT NULL;

GRANT SELECT ON public.admin_greetings_view TO authenticated;
