import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listBusinessCustomers, getBusinessCustomer, saveBusinessCustomer, createInvoice, markInvoiceSent,
  markInvoicePaid, creditInvoice, getInvoicePdfUrl, sendInvoiceToBookkeeping, syncConsumption,
  getCompanySettings, saveCompanySettings,
} from "@/lib/business.functions";
import { formatKr } from "@/lib/invoice-pdf";

/* eslint-disable @typescript-eslint/no-explicit-any */
const nf = (n: number) => n.toLocaleString("sv-SE");
const muted = { color: "var(--muted-foreground)" };
const DEFAULT_DESC = "Trädplantering – påfyllning av kredit i trädbanken";

function statusOf(c: { balance: number; low_balance_threshold: number }) {
  if (c.balance < 0) return { label: "Negativt", bg: "var(--destructive)", fg: "var(--destructive-foreground)" };
  if (c.balance < c.low_balance_threshold) return { label: "Lågt", bg: "var(--warning, #F4C542)", fg: "var(--forest)" };
  return { label: "OK", bg: "var(--mint)", fg: "var(--forest)" };
}

const TYPE_LABEL: Record<string, string> = {
  invoice_credit: "Påfyllning (faktura)", consumption: "Förbrukning", credit_note: "Kreditering", adjustment: "Justering",
};

function errMsg(e: unknown) { return e instanceof Error ? e.message : String(e); }

export function AdminBusinessTab() {
  const list = useServerFn(listBusinessCustomers);
  const sync = useServerFn(syncConsumption);
  const [rows, setRows] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const reload = async () => setRows((await list()).customers);
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (selected) return <CustomerDetail id={selected} onBack={async () => { setSelected(null); await reload(); }} />;
  if (creating) return <CustomerForm onDone={async (id) => { setCreating(false); await reload(); if (id) setSelected(id); }} />;

  return (
    <section className="surface-card mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Företagskunder</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={async () => {
            try { const r = await sync(); toast.success(`Synkat – ${r.added} nya förbrukningsrader`); await reload(); }
            catch (e) { toast.error(errMsg(e)); }
          }}>Synka förbrukning</button>
          <button className="btn-secondary" onClick={() => setShowSettings((v) => !v)}>Säljaruppgifter</button>
          <button className="btn-primary" onClick={() => setCreating(true)}>+ Ny företagskund</button>
        </div>
      </div>
      {showSettings && <CompanySettingsForm onClose={() => setShowSettings(false)} />}
      {!rows ? <p className="mt-6" style={muted}>Laddar…</p> : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left" style={muted}>
              <th className="py-2">Kundnr</th><th>Namn</th><th className="text-right">Saldo</th>
              <th className="text-right">Köpta / förbrukade</th><th>Senaste faktura</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((c) => {
                const s = statusOf(c);
                return (
                  <tr key={c.id} className="cursor-pointer border-t" style={{ borderColor: "var(--border)" }} onClick={() => setSelected(c.id)}>
                    <td className="py-3 font-mono">{c.customer_no}</td>
                    <td className="font-semibold">{c.legal_name}</td>
                    <td className="text-right font-display text-2xl font-bold" style={{ color: c.balance < 0 ? "var(--destructive)" : "var(--forest)" }}>{nf(c.balance)}</td>
                    <td className="text-right" style={muted}>{nf(c.credited)} / {nf(c.consumed)}</td>
                    <td>{c.last_invoice ? `${c.last_invoice.invoice_no} · ${c.last_invoice.invoice_date}` : "–"}</td>
                    <td><span className="chip" style={{ background: s.bg, color: s.fg }}>{s.label}</span></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center" style={muted}>Inga företagskunder ännu.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block" style={muted}>{label}</span>{children}</label>;
}

function CustomerForm({ initial, organizations, onDone }: { initial?: any; organizations?: any[]; onDone: (id?: string) => void }) {
  const save = useServerFn(saveBusinessCustomer);
  const [f, setF] = useState<any>(() => initial ?? {
    customer_no: "", invoice_prefix: "", legal_name: "", org_nr: "", address_line: "", postal_city: "", email: "",
    contact_reference: "", payment_terms_days: 10, default_price_per_tree: 25, vat_rate: 0.25, organization_id: null,
    ledger_start_at: new Date().toISOString(), low_balance_threshold: 100, active: true, notes: "",
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    try {
      const r = await save({ data: {
        id: f.id, customer_no: f.customer_no, invoice_prefix: String(f.invoice_prefix).toUpperCase(), legal_name: f.legal_name,
        org_nr: f.org_nr || null, address_line: f.address_line || null, postal_city: f.postal_city || null, email: f.email || null,
        contact_reference: f.contact_reference || null, payment_terms_days: Number(f.payment_terms_days),
        default_price_per_tree: Number(f.default_price_per_tree), vat_rate: Number(f.vat_rate),
        organization_id: f.organization_id || null, ledger_start_at: new Date(f.ledger_start_at).toISOString(),
        low_balance_threshold: Number(f.low_balance_threshold), active: !!f.active, notes: f.notes || null,
      } });
      toast.success("Sparat"); onDone(r.id);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const ledgerLocal = useMemo(() => {
    const d = new Date(f.ledger_start_at); const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  }, [f.ledger_start_at]);
  return (
    <section className="surface-card mt-6 p-6">
      <h2 className="font-display text-xl font-semibold">{f.id ? "Redigera kunduppgifter" : "Ny företagskund"}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Kundnr"><input className="input-field" value={f.customer_no} onChange={set("customer_no")} /></Field>
        <Field label="Fakturaprefix"><input className="input-field" value={f.invoice_prefix} onChange={set("invoice_prefix")} disabled={!!f.id} /></Field>
        <Field label="Företagsnamn"><input className="input-field" value={f.legal_name} onChange={set("legal_name")} /></Field>
        <Field label="Org.nr"><input className="input-field" value={f.org_nr ?? ""} onChange={set("org_nr")} /></Field>
        <Field label="Adress"><input className="input-field" value={f.address_line ?? ""} onChange={set("address_line")} /></Field>
        <Field label="Postnr och ort"><input className="input-field" value={f.postal_city ?? ""} onChange={set("postal_city")} /></Field>
        <Field label="E-post"><input className="input-field" value={f.email ?? ""} onChange={set("email")} /></Field>
        <Field label="Kontakt / er referens"><input className="input-field" value={f.contact_reference ?? ""} onChange={set("contact_reference")} /></Field>
        <Field label="Betalningsvillkor (dagar)"><input type="number" className="input-field" value={f.payment_terms_days} onChange={set("payment_terms_days")} /></Field>
        <Field label="Standardpris per träd (kr)"><input type="number" className="input-field" value={f.default_price_per_tree} onChange={set("default_price_per_tree")} /></Field>
        <Field label="Momssats (0,25 = 25 %)"><input type="number" step="0.01" className="input-field" value={f.vat_rate} onChange={set("vat_rate")} /></Field>
        <Field label="Varningsgräns lågt saldo (träd)"><input type="number" className="input-field" value={f.low_balance_threshold} onChange={set("low_balance_threshold")} /></Field>
        <Field label="Kopplad organisation">
          <select className="input-field" value={f.organization_id ?? ""} onChange={set("organization_id")}>
            <option value="">– Ingen –</option>
            {(organizations ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Förbrukning räknas från">
          <input type="datetime-local" className="input-field" value={ledgerLocal} onChange={(e) => setF({ ...f, ledger_start_at: new Date(e.target.value).toISOString() })} />
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Aktiv</label>
        <div className="sm:col-span-2"><Field label="Anteckningar"><textarea className="input-field" rows={3} value={f.notes ?? ""} onChange={set("notes")} /></Field></div>
      </div>
      <div className="mt-4 flex gap-2">
        <button className="btn-primary" onClick={submit}>Spara</button>
        <button className="btn-secondary" onClick={() => onDone(f.id)}>Avbryt</button>
      </div>
    </section>
  );
}

function CustomerDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const get = useServerFn(getBusinessCustomer);
  const [d, setD] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [newInvoice, setNewInvoice] = useState(false);
  const reload = async () => setD(await get({ data: { id } }));
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  if (!d) return <div className="surface-card mt-6 p-8 text-center" style={muted}>Laddar…</div>;
  if (editing) return <CustomerForm initial={d.customer} organizations={d.organizations} onDone={async () => { setEditing(false); await reload(); }} />;

  const c = d.customer; const b = d.balance;
  const st = statusOf({ balance: b.balance, low_balance_threshold: c.low_balance_threshold });
  const invoiceNo = (iid: string | null) => d.invoices.find((i: any) => i.id === iid)?.invoice_no;

  return (
    <div className="mt-6 space-y-6">
      <button className="btn-secondary" onClick={onBack}>← Alla företagskunder</button>
      <section className="surface-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-sm" style={muted}>{c.customer_no}</div>
            <h2 className="font-display text-2xl font-semibold">{c.legal_name}</h2>
            <div className="mt-2 text-sm" style={muted}>
              {[c.org_nr && `Org.nr ${c.org_nr}`, c.address_line, c.postal_city].filter(Boolean).join(" · ")}<br />
              Er referens: {c.contact_reference ?? "–"} · {c.payment_terms_days} dagar netto · {formatKr(Number(c.default_price_per_tree))}/träd · moms {Math.round(Number(c.vat_rate) * 100)} %<br />
              Organisation: {d.organizations.find((o: any) => o.id === c.organization_id)?.name ?? "–"} · Förbrukning från {new Date(c.ledger_start_at).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })}
            </div>
          </div>
          <button className="btn-secondary" onClick={() => setEditing(true)}>Redigera</button>
        </div>
      </section>

      <section className="surface-card p-6" style={{ background: "var(--mint-paper, var(--mint))" }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm" style={muted}>Trädsaldo</div>
            <div className="font-display text-5xl font-bold" style={{ color: b.balance < 0 ? "var(--destructive)" : "var(--forest)" }}>{nf(b.balance)}</div>
            <div className="mt-1 text-sm" style={muted}>Köpta {nf(b.credited)} · Förbrukade {nf(b.consumed)}</div>
          </div>
          <span className="chip" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
        </div>
        {b.balance < 0 && <p className="mt-3 font-semibold" style={{ color: "var(--destructive)" }}>Kunden har negativt saldo – fakturera påfyllning</p>}
        {b.balance >= 0 && b.balance < c.low_balance_threshold && <p className="mt-3 font-semibold" style={{ color: "var(--forest)" }}>⚠ Saldot är under varningsgränsen ({nf(c.low_balance_threshold)} träd)</p>}
      </section>

      <WeeklyChart ledger={d.ledger} />

      <section className="surface-card p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Fakturor</h3>
          <button className="btn-primary" onClick={() => setNewInvoice((v) => !v)}>+ Ny faktura</button>
        </div>
        {newInvoice && <NewInvoiceForm customer={c} nextNo={d.nextInvoiceNo} onDone={async () => { setNewInvoice(false); await reload(); }} />}
        <InvoiceTable invoices={d.invoices} onChange={reload} />
      </section>

      <section className="surface-card p-6">
        <h3 className="font-display text-lg font-semibold">Saldohistorik</h3>
        <div className="mt-3 max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left" style={muted}><th className="py-2">Datum</th><th>Typ</th><th className="text-right">Träd</th><th>Avser</th></tr></thead>
            <tbody>
              {d.ledger.map((l: any) => (
                <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2">{new Date(l.created_at).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })}</td>
                  <td>{TYPE_LABEL[l.entry_type] ?? l.entry_type}</td>
                  <td className="text-right font-semibold" style={{ color: l.trees < 0 ? "var(--destructive)" : "var(--forest)" }}>{l.trees > 0 ? "+" : ""}{nf(l.trees)}</td>
                  <td>
                    {l.invoice_id ? <>Faktura {invoiceNo(l.invoice_id)}</> : l.purchase_id
                      ? <a className="underline" href={`/admin?tab=entities&q=${l.purchase_id}`}>Köp {l.purchase_id.slice(0, 8)}</a> : null}
                    {l.note && l.note !== `Faktura ${invoiceNo(l.invoice_id)}` && <div className="text-xs" style={muted}>{l.note}</div>}
                  </td>
                </tr>
              ))}
              {d.ledger.length === 0 && <tr><td colSpan={4} className="py-4 text-center" style={muted}>Inga rader.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-v${String(Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}

function WeeklyChart({ ledger }: { ledger: any[] }) {
  const weeks = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 11; i >= 0; i--) m.set(isoWeek(new Date(Date.now() - i * 7 * 86400000)), 0);
    for (const l of ledger) if (l.entry_type === "consumption") {
      const k = isoWeek(new Date(l.created_at)); if (m.has(k)) m.set(k, (m.get(k) ?? 0) + -l.trees);
    }
    return [...m.entries()];
  }, [ledger]);
  const max = Math.max(1, ...weeks.map(([, v]) => v));
  return (
    <section className="surface-card p-6">
      <h3 className="font-display text-lg font-semibold">Förbrukning per vecka</h3>
      <div className="mt-4 flex h-40 items-end gap-2">
        {weeks.map(([k, v]) => (
          <div key={k} className="flex flex-1 flex-col items-center gap-1">
            <div className="text-xs font-semibold">{v || ""}</div>
            <div className="w-full rounded-t-md" style={{ height: `${(v / max) * 110}px`, minHeight: 2, background: "var(--primary)" }} />
            <div className="text-[10px]" style={muted}>{k.slice(5)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NewInvoiceForm({ customer, nextNo, onDone }: { customer: any; nextNo: string; onDone: () => void }) {
  const create = useServerFn(createInvoice);
  const [trees, setTrees] = useState(1000);
  const [price, setPrice] = useState(Number(customer.default_price_per_tree));
  const [desc, setDesc] = useState(DEFAULT_DESC);
  const [busy, setBusy] = useState(false);
  const net = Math.round(trees * price * 100) / 100;
  const vat = Math.round(net * Number(customer.vat_rate) * 100) / 100;
  const go = async (send: boolean) => {
    setBusy(true);
    try { const r = await create({ data: { customerId: customer.id, trees, unitPrice: price, description: desc, send } }); toast.success(`${r.invoice_no} ${send ? "skapad och skickad-markerad" : "sparad som utkast"}`); onDone(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
      <div className="text-sm" style={muted}>Nästa fakturanummer: <span className="font-mono font-semibold" style={{ color: "var(--forest)" }}>{nextNo}</span></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
        <Field label="Antal träd"><input type="number" min={1} className="input-field" value={trees} onChange={(e) => setTrees(Math.max(0, Math.floor(Number(e.target.value))))} /></Field>
        <Field label="À-pris (kr)"><input type="number" min={0} step="0.01" className="input-field" value={price} onChange={(e) => setPrice(Number(e.target.value))} /></Field>
        <Field label="Beskrivning"><input className="input-field" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>Netto<br /><b>{formatKr(net)}</b></div>
        <div>Moms {Math.round(Number(customer.vat_rate) * 100)} %<br /><b>{formatKr(vat)}</b></div>
        <div>Totalt<br /><b className="font-display text-lg" style={{ color: "var(--forest)" }}>{formatKr(net + vat)}</b></div>
      </div>
      <div className="mt-4 flex gap-2">
        <button className="btn-secondary" disabled={busy || trees < 1} onClick={() => go(false)}>Spara utkast</button>
        <button className="btn-primary" disabled={busy || trees < 1} onClick={() => go(true)}>Skapa & skicka-markera</button>
      </div>
    </div>
  );
}

function InvoiceTable({ invoices, onChange }: { invoices: any[]; onChange: () => void }) {
  const send = useServerFn(markInvoiceSent);
  const paid = useServerFn(markInvoicePaid);
  const credit = useServerFn(creditInvoice);
  const pdf = useServerFn(getInvoicePdfUrl);
  const bk = useServerFn(sendInvoiceToBookkeeping);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, msg?: string) => {
    setBusy(key);
    try { await fn(); if (msg) toast.success(msg); onChange(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left" style={muted}><th className="py-2">Nr</th><th>Datum</th><th>Förfaller</th><th className="text-right">Träd</th><th className="text-right">Belopp</th><th>Status</th><th /></tr></thead>
        <tbody>
          {invoices.map((i) => (
            <tr key={i.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
              <td className="py-2 font-mono">{i.invoice_no}{i.credits_invoice_id && <div className="text-xs" style={muted}>Kreditfaktura</div>}</td>
              <td>{i.invoice_date}</td><td>{i.due_date}</td>
              <td className="text-right">{nf(i.trees)}</td>
              <td className="text-right font-semibold">{formatKr(Number(i.total_amount))}</td>
              <td><span className="chip">{i.status}</span>{i.bookkeeping_sent_at && <div className="text-xs" style={muted}>Bokföring {new Date(i.bookkeeping_sent_at).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })}</div>}</td>
              <td className="space-x-1 whitespace-nowrap text-right">
                {i.status === "utkast" && <button className="btn-primary !px-3 !py-1 text-xs" disabled={!!busy} onClick={() => run(i.id, () => send({ data: { id: i.id } }), "Skickad-markerad")}>Skicka-markera</button>}
                {i.status !== "utkast" && <>
                  <button className="btn-secondary !px-3 !py-1 text-xs" disabled={!!busy} onClick={() => run(i.id, async () => { const r = await pdf({ data: { id: i.id } }); window.open(r.url, "_blank"); })}>PDF</button>
                  <button className="btn-secondary !px-3 !py-1 text-xs" disabled={!!busy} onClick={() => run(i.id, () => bk({ data: { id: i.id } }), "Kopia skickad till bokföringen")}>Skicka kopia till bokföringen</button>
                </>}
                {i.status === "skickad" && !i.credits_invoice_id && <button className="btn-secondary !px-3 !py-1 text-xs" disabled={!!busy} onClick={() => run(i.id, () => paid({ data: { id: i.id } }), "Markerad betald")}>Markera betald</button>}
                {["skickad", "betald"].includes(i.status) && !i.credits_invoice_id && <button className="btn-secondary !px-3 !py-1 text-xs" disabled={!!busy} onClick={() => {
                  const reason = window.prompt(`Orsak till kreditering av ${i.invoice_no}?`);
                  if (reason && reason.trim().length >= 3) void run(i.id, () => credit({ data: { id: i.id, reason } }), "Kreditfaktura skapad");
                }}>Kreditera</button>}
              </td>
            </tr>
          ))}
          {invoices.length === 0 && <tr><td colSpan={7} className="py-4 text-center" style={muted}>Inga fakturor.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function CompanySettingsForm({ onClose }: { onClose: () => void }) {
  const get = useServerFn(getCompanySettings);
  const save = useServerFn(saveCompanySettings);
  const [s, setS] = useState<any>(null);
  useEffect(() => { void get().then((r) => setS(r.settings)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  if (!s) return <p className="mt-4" style={muted}>Laddar…</p>;
  const fields: Array<[string, string]> = [
    ["legal_name", "Bolagsnamn"], ["org_nr", "Org.nr"], ["vat_nr", "Momsreg.nr"], ["address_line", "Adress"],
    ["postal_city", "Postnr och ort"], ["bankgiro", "Bankgiro"], ["email", "E-post"], ["phone", "Telefon"],
    ["website", "Webbplats"], ["our_reference", "Vår referens"], ["tagline", "Sidfotsrad"], ["bookkeeping_email", "Bokföringens e-post"],
  ];
  return (
    <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([k, label]) => <Field key={k} label={label}><input className="input-field" value={s[k] ?? ""} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></Field>)}
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn-primary" onClick={async () => {
          try { const { id: _id, updated_at: _u, ...rest } = s; await save({ data: rest }); toast.success("Säljaruppgifter sparade"); onClose(); }
          catch (e) { toast.error(errMsg(e)); }
        }}>Spara</button>
        <button className="btn-secondary" onClick={onClose}>Stäng</button>
      </div>
    </div>
  );
}
