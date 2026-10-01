CREATE TABLE public.company_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  legal_name text NOT NULL DEFAULT 'SmartKlimatKompensera på Tellus AB',
  org_nr text NOT NULL DEFAULT '559370-9453',
  vat_nr text NOT NULL DEFAULT 'SE559370945301',
  address_line text NOT NULL DEFAULT 'Morsstigen 3',
  postal_city text NOT NULL DEFAULT '141 71 Segeltorp',
  bankgiro text NOT NULL DEFAULT '5838-9586',
  email text NOT NULL DEFAULT 'plantering@smartklimat.org',
  phone text NOT NULL DEFAULT '070-719 72 35',
  website text NOT NULL DEFAULT 'smartklimat.org',
  our_reference text NOT NULL DEFAULT 'Johannes',
  tagline text NOT NULL DEFAULT 'Tänk smart, vi har ett gemensamt klimat.',
  bookkeeping_email text NOT NULL DEFAULT 'inbox.ver.1528974@arkivplats.se',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all company_settings" ON public.company_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.company_settings (id) VALUES (1);

CREATE TABLE public.business_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_no text NOT NULL UNIQUE,
  invoice_prefix text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  org_nr text,
  address_line text,
  postal_city text,
  email text,
  contact_reference text,
  payment_terms_days integer NOT NULL DEFAULT 10,
  default_price_per_tree numeric NOT NULL DEFAULT 25,
  vat_rate numeric NOT NULL DEFAULT 0.25,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ledger_start_at timestamptz NOT NULL DEFAULT now(),
  low_balance_threshold integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_customers TO authenticated;
GRANT ALL ON public.business_customers TO service_role;
ALTER TABLE public.business_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all business_customers" ON public.business_customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.business_customers(id),
  invoice_no text UNIQUE,
  series_seq integer,
  invoice_date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL DEFAULT current_date + 10,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  trees integer NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'utkast' CHECK (status IN ('utkast','skickad','betald','krediterad')),
  paid_at timestamptz,
  pdf_path text,
  credited_by_invoice_id uuid REFERENCES public.invoices(id),
  credits_invoice_id uuid REFERENCES public.invoices(id),
  bookkeeping_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all invoices" ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Låsning: bara utkast får redigeras fritt; låsta fakturor får endast status/paid_at/pdf/kreditering/loggfält ändrade.
CREATE OR REPLACE FUNCTION public._invoice_lock() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'utkast' THEN RAISE EXCEPTION 'Fakturan är låst och kan inte raderas'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'utkast' THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.invoice_no IS DISTINCT FROM OLD.invoice_no
       OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.lines IS DISTINCT FROM OLD.lines OR NEW.trees IS DISTINCT FROM OLD.trees
       OR NEW.net_amount IS DISTINCT FROM OLD.net_amount OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
      RAISE EXCEPTION 'Fakturan är låst – ändringar görs via kreditering';
    END IF;
    IF NEW.status = 'utkast' THEN RAISE EXCEPTION 'En låst faktura kan inte bli utkast igen'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoices_lock BEFORE UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public._invoice_lock();

CREATE TABLE public.invoice_series (
  prefix text PRIMARY KEY,
  next_seq integer NOT NULL DEFAULT 1
);
GRANT SELECT ON public.invoice_series TO authenticated;
GRANT ALL ON public.invoice_series TO service_role;
ALTER TABLE public.invoice_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read invoice_series" ON public.invoice_series FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.next_invoice_no(_prefix text, OUT invoice_no text, OUT seq integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  INSERT INTO public.invoice_series(prefix, next_seq) VALUES (_prefix, 1) ON CONFLICT (prefix) DO NOTHING;
  SELECT s.next_seq INTO seq FROM public.invoice_series s WHERE s.prefix = _prefix FOR UPDATE;
  UPDATE public.invoice_series SET next_seq = seq + 1 WHERE prefix = _prefix;
  invoice_no := _prefix || '-' || lpad(seq::text, 3, '0');
END $$;
REVOKE EXECUTE ON FUNCTION public.next_invoice_no(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_no(text) TO authenticated, service_role;

CREATE TABLE public.tree_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.business_customers(id),
  entry_type text NOT NULL CHECK (entry_type IN ('invoice_credit','consumption','credit_note','adjustment')),
  trees integer NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id),
  purchase_id uuid REFERENCES public.purchases(id),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tree_ledger_purchase_uniq ON public.tree_ledger(purchase_id) WHERE purchase_id IS NOT NULL;
CREATE INDEX tree_ledger_customer_idx ON public.tree_ledger(customer_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tree_ledger TO authenticated;
GRANT ALL ON public.tree_ledger TO service_role;
ALTER TABLE public.tree_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all tree_ledger" ON public.tree_ledger FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE VIEW public.customer_tree_balance WITH (security_invoker = true) AS
SELECT c.id AS customer_id,
  COALESCE(SUM(l.trees) FILTER (WHERE l.trees > 0), 0)::int AS credited,
  COALESCE(-SUM(l.trees) FILTER (WHERE l.trees < 0), 0)::int AS consumed,
  COALESCE(SUM(l.trees), 0)::int AS balance
FROM public.business_customers c LEFT JOIN public.tree_ledger l ON l.customer_id = c.id
GROUP BY c.id;
GRANT SELECT ON public.customer_tree_balance TO authenticated, service_role;

-- Förbrukning: ett Mockfjärds-köp räknas när dess händelser är bekräftade (claimed).
-- Köpet hör till kunden via team->organisation, eller via källan 'mockfjards' när kunden är kopplad till Mockfjärds-organisationen.
CREATE OR REPLACE FUNCTION public.sync_purchase_consumption(_purchase_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; c record; claimed int;
BEGIN
  SELECT pu.id, pu.created_at, pu.source, pu.source_order_ref, t.organization_id AS team_org
    INTO p FROM public.purchases pu LEFT JOIN public.teams t ON t.id = pu.team_id WHERE pu.id = _purchase_id;
  IF NOT FOUND OR p.source IS DISTINCT FROM 'mockfjards' THEN RETURN; END IF;
  SELECT bc.* INTO c FROM public.business_customers bc
    JOIN public.organizations o ON o.id = bc.organization_id
   WHERE bc.active AND (bc.organization_id = p.team_org OR (p.team_org IS NULL AND o.name ILIKE 'Mockfj%'))
   ORDER BY bc.created_at LIMIT 1;
  IF NOT FOUND OR p.created_at < c.ledger_start_at THEN RETURN; END IF;
  SELECT COALESCE(SUM(e.tree_count), 0) INTO claimed FROM public.mockfjards_events e
   WHERE e.case_id = p.source_order_ref AND e.status = 'claimed';
  IF claimed <= 0 THEN RETURN; END IF;
  INSERT INTO public.tree_ledger(customer_id, entry_type, trees, purchase_id, note)
  VALUES (c.id, 'consumption', -claimed, p.id, 'Mockfjärds-ärende ' || p.source_order_ref)
  ON CONFLICT (purchase_id) WHERE purchase_id IS NOT NULL
  DO UPDATE SET trees = EXCLUDED.trees WHERE public.tree_ledger.entry_type = 'consumption';
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_purchase_consumption(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_purchase_consumption(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._mockfjards_event_consumption() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  IF NEW.status <> 'claimed' THEN RETURN NEW; END IF;
  SELECT purchase_id INTO pid FROM public.mockfjards_cases WHERE case_id = NEW.case_id;
  IF pid IS NOT NULL THEN PERFORM public.sync_purchase_consumption(pid); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mockfjards_events_consumption AFTER INSERT OR UPDATE OF status, tree_count ON public.mockfjards_events
  FOR EACH ROW EXECUTE FUNCTION public._mockfjards_event_consumption();

CREATE OR REPLACE FUNCTION public.sync_all_consumption() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; before int; after int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT count(*) INTO before FROM public.tree_ledger WHERE entry_type = 'consumption';
  FOR r IN SELECT id FROM public.purchases WHERE source = 'mockfjards'
             AND created_at >= (SELECT COALESCE(min(ledger_start_at), now()) FROM public.business_customers) LOOP
    PERFORM public.sync_purchase_consumption(r.id);
  END LOOP;
  SELECT count(*) INTO after FROM public.tree_ledger WHERE entry_type = 'consumption';
  RETURN after - before;
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_all_consumption() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_all_consumption() TO authenticated, service_role;

-- Seed: Daniel Malke AB + DMAB-001
DO $$
DECLARE cid uuid; inv uuid; n record;
BEGIN
  INSERT INTO public.business_customers(customer_no, invoice_prefix, legal_name, org_nr, address_line, postal_city,
    contact_reference, payment_terms_days, default_price_per_tree, vat_rate, organization_id, ledger_start_at)
  VALUES ('DMAB01', 'DMAB', 'Daniel Malke AB', '559173-5898', 'Morsstigen 3', '141 71 Segeltorp',
    'Daniel Malke', 10, 25, 0.25,
    (SELECT id FROM public.organizations WHERE name ILIKE 'Mockfj%' ORDER BY created_at LIMIT 1),
    '2026-10-01 00:00:00+02')
  RETURNING id INTO cid;
  SELECT * INTO n FROM public.next_invoice_no('DMAB');
  INSERT INTO public.invoices(customer_id, invoice_no, series_seq, invoice_date, due_date, lines, trees,
    net_amount, vat_amount, total_amount, status)
  VALUES (cid, n.invoice_no, n.seq, '2026-10-01', '2026-10-11',
    '[{"description":"Trädplantering – påfyllning av kredit i trädbanken","quantity":1000,"unit":"st","unit_price":25}]'::jsonb,
    1000, 25000, 6250, 31250, 'skickad')
  RETURNING id INTO inv;
  INSERT INTO public.tree_ledger(customer_id, entry_type, trees, invoice_id, note)
  VALUES (cid, 'invoice_credit', 1000, inv, 'Faktura ' || n.invoice_no);
END $$;