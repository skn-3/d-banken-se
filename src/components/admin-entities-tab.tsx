import React, { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";
import { PurchaseCorrectButton, CertReissueButton, PointsAdjustButton } from "@/components/admin-corrections";

// Types
interface Customer { id: string; name: string; email: string; created_at: string }
interface Purchase {
  id: string; created_at: string; recipient_name: string | null; recipient_email: string | null;
  tree_count: number; total_amount_ore: number; status: string;
  customer_id: string | null; team_id: string | null; certificate_template_id: string | null;
  admin_note: string | null;
}
interface Certificate {
  id: string; verification_id: string; recipient_name: string; tree_count: number;
  location_name: string; issued_date: string; purchase_id: string;
  customer_id: string | null; template_id: string | null;
  greeting: string | null; superseded_by: string | null;
}
interface Team {
  id: string; name: string; city: string | null; join_code: string | null;
  organization_id: string; created_at: string; cert_template_id: string | null;
}
interface Seller { user_id: string; name: string; email: string; team_id: string | null; team_name: string | null }
interface CertTemplate { id: string; slug: string; namn: string }
interface Organization { id: string; name: string }

type Sub = "kunder" | "kop" | "certifikat" | "lag" | "saljare";

const SUBS: [Sub, string][] = [
  ["kunder", "Kunder"],
  ["kop", "Köp"],
  ["certifikat", "Certifikat"],
  ["lag", "Lag"],
  ["saljare", "Säljare"],
];



function formatDate(iso: string) { return new Date(iso).toLocaleString("sv-SE"); }
function formatKr(ore: number) { return `${(ore / 100).toLocaleString("sv-SE")} kr`; }

export function AdminEntitiesTab() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/admin" }) as {
    sub?: string; q?: string; from?: string; to?: string; tema?: string;
    status?: string; team?: string; proj?: string; highlight?: string;
  };

  const sub = (search.sub as Sub) || "kunder";

  const setParams = (patch: Record<string, string | undefined>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: "/admin", search: (prev: any) => {
      const next = { ...prev, ...patch };
      Object.keys(next).forEach(k => { if (next[k] === "" || next[k] == null) delete next[k]; });
      return next;
    } });
  };

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [templates, setTemplates] = useState<CertTemplate[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(k => k + 1);

  useEffect(() => {
    (async () => {
      const [c, p, ct, t, prof, tmpl, o] = await Promise.all([
        supabase.from("customers").select("id, name, email, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("purchases").select("id, created_at, recipient_name, recipient_email, tree_count, total_amount_ore, status, customer_id, team_id, certificate_template_id, admin_note").order("created_at", { ascending: false }).limit(500),
        supabase.from("certificates").select("id, verification_id, recipient_name, tree_count, location_name, issued_date, purchase_id, customer_id, template_id, greeting, superseded_by").order("issued_date", { ascending: false }).limit(500),
        supabase.from("teams").select("id, name, city, join_code, organization_id, created_at, cert_template_id").order("created_at", { ascending: false }),
        supabase.from("team_members").select("user_id, team_id, teams:team_id(name), profiles:user_id(name, email)"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("cert_templates").select("id, slug, namn").order("sort"),
        supabase.from("organizations").select("id, name").order("name"),
      ]);
      setCustomers((c.data ?? []) as Customer[]);
      setPurchases((p.data ?? []) as Purchase[]);
      setCerts((ct.data ?? []) as Certificate[]);
      setTeams((t.data ?? []) as Team[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSellers(((prof.data ?? []) as any[]).map(m => ({
        user_id: m.user_id, team_id: m.team_id,
        name: m.profiles?.name ?? "",
        email: m.profiles?.email ?? "",
        team_name: m.teams?.name ?? null,
      })));
      setTemplates((tmpl.data ?? []) as CertTemplate[]);
      setOrgs((o.data ?? []) as Organization[]);
    })();
  }, [reloadKey]);

  const templateBySlug = useMemo(() => new Map(templates.map(t => [t.slug, t])), [templates]);
  const templateById = useMemo(() => new Map(templates.map(t => [t.id, t])), [templates]);

  const q = (search.q || "").toLowerCase();
  const from = search.from || "";
  const to = search.to || "";
  const temaSlug = search.tema || "";
  const status = search.status || "";
  const teamFilter = search.team || "";

  const inDate = (iso: string) => {
    if (from && iso < from) return false;
    if (to && iso > to + "T23:59:59") return false;
    return true;
  };

  const matchesQ = (...vals: (string | null | undefined)[]) =>
    !q || vals.some(v => v && v.toLowerCase().includes(q));

  const filteredPurchases = purchases.filter(p => {
    if (!inDate(p.created_at)) return false;
    if (status && p.status !== status) return false;
    if (teamFilter && p.team_id !== teamFilter) return false;
    if (temaSlug) {
      const t = templateById.get(p.certificate_template_id ?? "");
      if (!t || t.slug !== temaSlug) return false;
    }
    return matchesQ(p.recipient_name, p.recipient_email, p.id);
  });

  const filteredCerts = certs.filter(c => {
    if (c.superseded_by) return false; // hide historic rows from default view
    if (!inDate(c.issued_date)) return false;
    if (temaSlug) {
      const t = templateById.get(c.template_id ?? "");
      if (!t || t.slug !== temaSlug) return false;
    }
    return matchesQ(c.recipient_name, c.verification_id, c.location_name);
  });

  const filteredTeams = teams.filter(t => {
    if (!inDate(t.created_at)) return false;
    if (search.proj && t.organization_id !== search.proj) return false;
    if (temaSlug) {
      const tmpl = templateById.get(t.cert_template_id ?? "");
      if (!tmpl || tmpl.slug !== temaSlug) return false;
    }
    return matchesQ(t.name, t.city, t.join_code);
  });

  const filteredCustomers = customers.filter(c => {
    if (!inDate(c.created_at)) return false;
    return matchesQ(c.name, c.email);
  });

  const filteredSellers = sellers.filter(s => {
    if (teamFilter && s.team_id !== teamFilter) return false;
    return matchesQ(s.name, s.email, s.team_name);
  });

  const anyFilter = !!(q || from || to || temaSlug || status || teamFilter || search.proj);

  const clear = () => setParams({ q: undefined, from: undefined, to: undefined, tema: undefined, status: undefined, team: undefined, proj: undefined });

  return (
    <section className="surface-card mt-6 p-6">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {SUBS.map(([k, label]) => (
          <button key={k} onClick={() => setParams({ sub: k, highlight: undefined })} className="chip"
            style={{ cursor: "pointer", background: sub === k ? "var(--mint)" : undefined }}>
            {label}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs">
          <span className="mb-1 block" style={{ color: "var(--muted-foreground)" }}>Sök</span>
          <input className="input-field !py-1.5 !text-sm" value={search.q ?? ""} onChange={e => setParams({ q: e.target.value })} placeholder="Namn, e-post, ID…" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block" style={{ color: "var(--muted-foreground)" }}>Från</span>
          <input type="date" className="input-field !py-1.5 !text-sm" value={search.from ?? ""} onChange={e => setParams({ from: e.target.value })} />
        </label>
        <label className="text-xs">
          <span className="mb-1 block" style={{ color: "var(--muted-foreground)" }}>Till</span>
          <input type="date" className="input-field !py-1.5 !text-sm" value={search.to ?? ""} onChange={e => setParams({ to: e.target.value })} />
        </label>
        <label className="text-xs">
          <span className="mb-1 block" style={{ color: "var(--muted-foreground)" }}>Tema</span>
          <select className="input-field !py-1.5 !text-sm" value={search.tema ?? ""} onChange={e => setParams({ tema: e.target.value })}>
            <option value="">Alla</option>
            {templates.map(t => <option key={t.id} value={t.slug}>{t.namn}</option>)}
          </select>
        </label>
        {(sub === "kop") && (
          <label className="text-xs">
            <span className="mb-1 block" style={{ color: "var(--muted-foreground)" }}>Status</span>
            <select className="input-field !py-1.5 !text-sm" value={search.status ?? ""} onChange={e => setParams({ status: e.target.value })}>
              <option value="">Alla</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
            </select>
          </label>
        )}
        {(sub === "kop" || sub === "saljare") && (
          <label className="text-xs">
            <span className="mb-1 block" style={{ color: "var(--muted-foreground)" }}>Lag</span>
            <select className="input-field !py-1.5 !text-sm" value={search.team ?? ""} onChange={e => setParams({ team: e.target.value })}>
              <option value="">Alla</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        {sub === "lag" && (
          <label className="text-xs">
            <span className="mb-1 block" style={{ color: "var(--muted-foreground)" }}>Projekt</span>
            <select className="input-field !py-1.5 !text-sm" value={search.proj ?? ""} onChange={e => setParams({ proj: e.target.value })}>
              <option value="">Alla</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        )}
        {anyFilter && (
          <div className="flex items-end">
            <button className="btn-secondary !py-1.5 !px-3 text-xs" onClick={clear}>
              <X size={12} className="mr-1 inline" /> Rensa filter
            </button>
          </div>
        )}
      </div>

      {/* Views */}
      <div className="mt-6">
        {sub === "kunder" && <CustomersView rows={filteredCustomers} purchases={purchases} highlight={search.highlight} onOpenPurchases={(cid) => setParams({ sub: "kop", q: undefined, highlight: undefined, team: undefined, status: undefined })} setParams={setParams} />}
        {sub === "kop" && <PurchasesView rows={filteredPurchases} certs={certs} templateById={templateById} highlight={search.highlight} setParams={setParams} onReload={reload} />}
        {sub === "certifikat" && <CertsView rows={filteredCerts} templateById={templateById} highlight={search.highlight} onReload={reload} />}
        {sub === "lag" && <TeamsView rows={filteredTeams} sellers={sellers} templateById={templateById} highlight={search.highlight} setParams={setParams} />}
        {sub === "saljare" && <SellersView rows={filteredSellers} purchases={purchases} highlight={search.highlight} setParams={setParams} onReload={reload} />}
      </div>

      {/* Empty state */}
      {((sub === "kunder" && filteredCustomers.length === 0) ||
        (sub === "kop" && filteredPurchases.length === 0) ||
        (sub === "certifikat" && filteredCerts.length === 0) ||
        (sub === "lag" && filteredTeams.length === 0) ||
        (sub === "saljare" && filteredSellers.length === 0)) && (
        <div className="mt-4 rounded-xl border p-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          Inga träffar med aktuella filter.
          {anyFilter && (
            <div className="mt-3">
              <button className="btn-secondary !py-1.5 !px-3 text-xs" onClick={clear}>Rensa filter</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function highlightStyle(active: boolean): React.CSSProperties {
  return active ? { background: "var(--mint-paper)", outline: "2px solid var(--mint)" } : {};
}

function CustomersView({ rows, purchases, highlight, setParams }: { rows: Customer[]; purchases: Purchase[]; highlight?: string; onOpenPurchases: (cid: string) => void; setParams: (p: Record<string,string | undefined>) => void }) {
  const [openId, setOpenId] = useState<string | null>(highlight ?? null);
  useEffect(() => { if (highlight) setOpenId(highlight); }, [highlight]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
          <tr><th className="py-2">Namn</th><th>E-post</th><th>Skapad</th><th>Köp</th></tr>
        </thead>
        <tbody>
          {rows.map(c => {
            const cPurchases = purchases.filter(p => p.customer_id === c.id);
            const isOpen = openId === c.id;
            return (
              <Fragment key={c.id}>
                <tr key={c.id} className="border-t cursor-pointer" style={{ borderColor: "var(--border)", ...highlightStyle(highlight === c.id) }} onClick={() => setOpenId(isOpen ? null : c.id)}>
                  <td className="py-3 font-medium">{c.name}</td>
                  <td className="font-mono text-xs">{c.email}</td>
                  <td className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{formatDate(c.created_at)}</td>
                  <td className="font-mono text-xs">{cPurchases.length}</td>
                </tr>
                {isOpen && cPurchases.length > 0 && (
                  <tr key={`${c.id}-sub`} style={{ background: "var(--muted)" }}>
                    <td colSpan={4} className="p-3">
                      <div className="space-y-1 text-xs">
                        {cPurchases.map(p => (
                          <div key={p.id} className="flex justify-between gap-2">
                            <button className="text-left underline" onClick={() => setParams({ sub: "kop", highlight: p.id, q: undefined })}>
                              {formatDate(p.created_at)} — {p.tree_count} träd · {formatKr(p.total_amount_ore)} · {p.status}
                            </button>
                            <span className="font-mono" style={{ color: "var(--muted-foreground)" }}>{p.id.slice(0, 8)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PurchasesView({ rows, certs, templateById, highlight, setParams }: { rows: Purchase[]; certs: Certificate[]; templateById: Map<string, CertTemplate>; highlight?: string; setParams: (p: Record<string,string | undefined>) => void }) {
  const certByPurchase = useMemo(() => new Map(certs.map(c => [c.purchase_id, c])), [certs]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
          <tr><th className="py-2">Datum</th><th>Mottagare</th><th>Träd</th><th>Belopp</th><th>Status</th><th>Tema</th><th>Certifikat</th></tr>
        </thead>
        <tbody>
          {rows.map(p => {
            const cert = certByPurchase.get(p.id);
            const tmpl = p.certificate_template_id ? templateById.get(p.certificate_template_id) : null;
            return (
              <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)", ...highlightStyle(highlight === p.id) }}>
                <td className="py-3 font-mono text-xs">{formatDate(p.created_at)}</td>
                <td>
                  <div>{p.recipient_name || "—"}</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{p.recipient_email ?? ""}</div>
                </td>
                <td className="font-mono">{p.tree_count}</td>
                <td className="font-mono">{formatKr(p.total_amount_ore)}</td>
                <td className="font-mono text-xs">{p.status}</td>
                <td className="text-xs">{tmpl?.namn ?? "—"}</td>
                <td>
                  {cert ? (
                    <button className="underline text-xs" onClick={() => setParams({ sub: "certifikat", highlight: cert.id, q: undefined })}>
                      {cert.verification_id}
                    </button>
                  ) : <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CertsView({ rows, templateById, highlight }: { rows: Certificate[]; templateById: Map<string, CertTemplate>; highlight?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
          <tr><th className="py-2">Verifikat-ID</th><th>Mottagare</th><th>Träd</th><th>Plats</th><th>Utfärdat</th><th>Tema</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map(c => {
            const tmpl = c.template_id ? templateById.get(c.template_id) : null;
            return (
              <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)", ...highlightStyle(highlight === c.id) }}>
                <td className="py-3 font-mono text-xs">{c.verification_id}</td>
                <td>{c.recipient_name}</td>
                <td className="font-mono">{c.tree_count}</td>
                <td className="text-xs">{c.location_name}</td>
                <td className="font-mono text-xs">{formatDate(c.issued_date)}</td>
                <td className="text-xs">{tmpl?.namn ?? "—"}</td>
                <td>
                  <Link to="/v/$id" params={{ id: c.verification_id }} className="underline text-xs" target="_blank">
                    Öppna /v/{c.verification_id}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeamsView({ rows, sellers, templateById, highlight, setParams }: { rows: Team[]; sellers: Seller[]; templateById: Map<string, CertTemplate>; highlight?: string; setParams: (p: Record<string,string | undefined>) => void }) {
  const [openId, setOpenId] = useState<string | null>(highlight ?? null);
  useEffect(() => { if (highlight) setOpenId(highlight); }, [highlight]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
          <tr><th className="py-2">Lag</th><th>Stad</th><th>Kod</th><th>Tema</th><th>Medlemmar</th></tr>
        </thead>
        <tbody>
          {rows.map(t => {
            const members = sellers.filter(s => s.team_id === t.id);
            const isOpen = openId === t.id;
            const tmpl = t.cert_template_id ? templateById.get(t.cert_template_id) : null;
            return (
              <Fragment key={t.id}>
                <tr key={t.id} className="border-t cursor-pointer" style={{ borderColor: "var(--border)", ...highlightStyle(highlight === t.id) }} onClick={() => setOpenId(isOpen ? null : t.id)}>
                  <td className="py-3 font-medium">{t.name}</td>
                  <td className="text-xs">{t.city ?? "—"}</td>
                  <td className="font-mono text-xs">{t.join_code ?? "—"}</td>
                  <td className="text-xs">{tmpl?.namn ?? "—"}</td>
                  <td className="font-mono text-xs">{members.length}</td>
                </tr>
                {isOpen && members.length > 0 && (
                  <tr key={`${t.id}-sub`} style={{ background: "var(--muted)" }}>
                    <td colSpan={5} className="p-3">
                      <div className="space-y-1 text-xs">
                        {members.map(m => (
                          <button key={m.user_id} className="block text-left underline" onClick={() => setParams({ sub: "saljare", highlight: m.user_id, q: undefined })}>
                            {m.name} · {m.email}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SellersView({ rows, purchases, highlight, setParams }: { rows: Seller[]; purchases: Purchase[]; highlight?: string; setParams: (p: Record<string,string | undefined>) => void }) {
  const [openId, setOpenId] = useState<string | null>(highlight ?? null);
  useEffect(() => { if (highlight) setOpenId(highlight); }, [highlight]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
          <tr><th className="py-2">Namn</th><th>E-post</th><th>Lag</th><th>Försäljningar</th></tr>
        </thead>
        <tbody>
          {rows.map(s => {
            // purchases where team_id matches AND (approx) registered_by = s.user_id — we don't have that field surfaced, so use team_id filter as proxy
            const sPurchases = purchases.filter(p => p.team_id === s.team_id);
            const isOpen = openId === s.user_id;
            return (
              <Fragment key={s.user_id}>
                <tr key={s.user_id} className="border-t cursor-pointer" style={{ borderColor: "var(--border)", ...highlightStyle(highlight === s.user_id) }} onClick={() => setOpenId(isOpen ? null : s.user_id)}>
                  <td className="py-3 font-medium">{s.name}</td>
                  <td className="font-mono text-xs">{s.email}</td>
                  <td className="text-xs">{s.team_name ?? "—"}</td>
                  <td className="font-mono text-xs">{sPurchases.length}</td>
                </tr>
                {isOpen && sPurchases.length > 0 && (
                  <tr key={`${s.user_id}-sub`} style={{ background: "var(--muted)" }}>
                    <td colSpan={4} className="p-3">
                      <div className="space-y-1 text-xs">
                        {sPurchases.slice(0, 20).map(p => (
                          <button key={p.id} className="block text-left underline" onClick={() => setParams({ sub: "kop", highlight: p.id, q: undefined })}>
                            {formatDate(p.created_at)} · {p.tree_count} träd · {p.status}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
