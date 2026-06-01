import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { Certificate, BACKGROUND_OPTIONS, type CertificateData } from "@/components/certificate";
import { adminSetPassword, adminSendPasswordReset } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — SmartKlimat" }] }),
  component: AdminPage,
});

interface AdminProfile { user_id: string; name: string; email: string; created_at: string; company_template_id: string | null }
interface AdminPurchase { id: string; user_id: string; tree_count: number; total_amount_ore: number; status: string; created_at: string }

interface Template {
  id: string;
  name: string;
  logo_url: string | null;
  accent_color: string;
  heading_text: string;
  body_text: string;
  background_key: string;
  show_coordinates: boolean;
  show_social: boolean;
  social_handles: string;
  company_user_id: string | null;
  is_default: boolean;
}

interface Settings {
  planting_location_name: string;
  planting_latitude: number | string;
  planting_longitude: number | string;
}

function formatKr(ore: number) { return `${(ore / 100).toLocaleString("sv-SE")} kr`; }
function formatDate(iso: string) { return new Date(iso).toLocaleString("sv-SE"); }

type Tab = "overview" | "templates" | "settings";

function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "denied" | "ok">("checking");
  const [tab, setTab] = useState<Tab>("overview");

  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [purchases, setPurchases] = useState<AdminPurchase[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  const load = async () => {
    const [p, q, t, s] = await Promise.all([
      supabase.from("profiles").select("user_id, name, email, created_at, company_template_id").order("created_at", { ascending: false }),
      supabase.from("purchases").select("id, user_id, tree_count, total_amount_ore, status, created_at").order("created_at", { ascending: false }),
      supabase.from("certificate_templates").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: true }),
      supabase.from("app_settings").select("planting_location_name, planting_latitude, planting_longitude").eq("id", 1).maybeSingle(),
    ]);
    setProfiles((p.data ?? []) as AdminProfile[]);
    setPurchases((q.data ?? []) as AdminPurchase[]);
    setTemplates((t.data ?? []) as Template[]);
    setSettings((s.data as Settings | null) ?? null);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    let cancelled = false;
    (async () => {
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (cancelled) return;
      if (!role) { setState("denied"); return; }
      await load();
      if (!cancelled) setState("ok");
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, navigate]);

  const totalTrees = purchases.filter(p => p.status === "paid").reduce((s, p) => s + p.tree_count, 0);
  const totalAmount = purchases.filter(p => p.status === "paid").reduce((s, p) => s + p.total_amount_ore, 0);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20 pt-4">
        <h1 className="font-display text-3xl font-semibold">Admin</h1>

        {state === "checking" && <div className="surface-card mt-6 p-8 text-center" style={{ color: "var(--muted-foreground)" }}>Kontrollerar behörighet…</div>}
        {state === "denied" && (
          <div className="surface-card mt-6 p-8 text-center">
            <h2 className="font-display text-xl">Ingen åtkomst</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Detta konto har inte administratörsrollen.</p>
          </div>
        )}
        {state === "ok" && (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {([
                ["overview", "Översikt"],
                ["templates", "Värdebevis-mallar"],
                ["settings", "Planteringsplats"],
              ] as [Tab, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} className="chip"
                  style={{ cursor: "pointer", background: tab === k ? "var(--mint)" : undefined }}>
                  {label}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <>
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Stat label="Användare" value={profiles.length.toString()} />
                  <Stat label="Träd planterade" value={totalTrees.toLocaleString("sv-SE")} />
                  <Stat label="Intäkt (betalda)" value={formatKr(totalAmount)} />
                </div>

                <section className="surface-card mt-8 p-6">
                  <h2 className="font-display text-xl font-semibold">Användare</h2>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                        <tr><th className="py-2">Namn</th><th>E-post</th><th>Mall-koppling</th><th>Skapad</th><th>Lösenord</th></tr>
                      </thead>
                      <tbody>
                        {profiles.map(p => (
                          <tr key={p.user_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                            <td className="py-3">{p.name}</td>
                            <td className="font-mono text-xs">{p.email}</td>
                            <td>
                              <select
                                className="input-field !py-1 !text-xs"
                                value={p.company_template_id ?? ""}
                                onChange={async (e) => {
                                  const v = e.target.value || null;
                                  await supabase.from("profiles").update({ company_template_id: v }).eq("user_id", p.user_id);
                                  await load();
                                }}
                              >
                                <option value="">— (standard)</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                            </td>
                            <td className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{formatDate(p.created_at)}</td>
                            <td><PasswordActions userId={p.user_id} email={p.email} /></td>
                          </tr>
                        ))}
                        {profiles.length === 0 && <tr><td colSpan={5} className="py-6 text-center" style={{ color: "var(--muted-foreground)" }}>Inga användare än.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="surface-card mt-6 p-6">
                  <h2 className="font-display text-xl font-semibold">Köp</h2>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                        <tr><th className="py-2">Datum</th><th>Användare-ID</th><th>Träd</th><th>Belopp</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {purchases.map(q => (
                          <tr key={q.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                            <td className="py-3 font-mono text-xs">{formatDate(q.created_at)}</td>
                            <td className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{q.user_id.slice(0, 8)}…</td>
                            <td className="font-mono">{q.tree_count}</td>
                            <td className="font-mono">{formatKr(q.total_amount_ore)}</td>
                            <td className="font-mono text-xs">{q.status}</td>
                          </tr>
                        ))}
                        {purchases.length === 0 && <tr><td colSpan={5} className="py-6 text-center" style={{ color: "var(--muted-foreground)" }}>Inga köp än.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {tab === "templates" && (
              <TemplatesTab templates={templates} editing={editing} setEditing={setEditing} reload={load} />
            )}

            {tab === "settings" && settings && (
              <SettingsTab settings={settings} reload={load} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-6">
      <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="mt-2 font-mono text-3xl font-semibold" style={{ color: "var(--forest)" }}>{value}</div>
    </div>
  );
}

function TemplatesTab({ templates, editing, setEditing, reload }: {
  templates: Template[]; editing: Template | null; setEditing: (t: Template | null) => void; reload: () => Promise<void>;
}) {
  const newTemplate = (): Template => ({
    id: "",
    name: "Ny mall",
    logo_url: null,
    accent_color: "#1E9E6A",
    heading_text: "VÄRDEBEVIS",
    body_text: "Detta värdebevis intygar att ovanstående person har bidragit till plantering av träd genom SmartKlimat.",
    background_key: "mint",
    show_coordinates: true,
    show_social: true,
    social_handles: "@smartklimat",
    company_user_id: null,
    is_default: false,
  });

  if (editing) {
    return <TemplateEditor template={editing} onClose={() => setEditing(null)} onSaved={async () => { await reload(); setEditing(null); }} />;
  }

  return (
    <section className="surface-card mt-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Mall-varianter</h2>
        <button className="btn-primary" onClick={() => setEditing(newTemplate())}>+ Ny variant</button>
      </div>
      <div className="mt-4 divide-y" style={{ borderColor: "var(--border)" }}>
        {templates.map((t) => (
          <div key={t.id} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <span className="inline-block h-6 w-6 rounded-full" style={{ background: t.accent_color }} />
              <span className="font-medium">{t.name}</span>
              {t.is_default && <span className="chip !py-0.5 !text-xs">Standard</span>}
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={() => setEditing(t)}>Redigera</button>
              {!t.is_default && (
                <button
                  className="btn-secondary !py-1.5 !px-3 text-sm"
                  onClick={async () => {
                    await supabase.from("certificate_templates").update({ is_default: false }).eq("is_default", true);
                    await supabase.from("certificate_templates").update({ is_default: true }).eq("id", t.id);
                    await reload();
                  }}
                >Sätt som standard</button>
              )}
            </div>
          </div>
        ))}
        {templates.length === 0 && <p className="py-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Inga mallar än.</p>}
      </div>
    </section>
  );
}

function TemplateEditor({ template, onClose, onSaved }: {
  template: Template; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [t, setT] = useState<Template>(template);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview: CertificateData = {
    verification_id: "SK-2026-0001",
    recipient_name: "Anna Andersson",
    tree_count: 25,
    location_name: "Luanshya, Copperbelt, Zambia",
    latitude: -13.1367,
    longitude: 28.4183,
    issued_date: new Date().toISOString(),
    template: {
      logo_url: t.logo_url,
      accent_color: t.accent_color,
      heading_text: t.heading_text,
      body_text: t.body_text,
      background_key: t.background_key,
      show_coordinates: t.show_coordinates,
      show_social: t.show_social,
      social_handles: t.social_handles,
    },
  };

  const save = async () => {
    setError(null); setSaving(true);
    try {
      const payload = {
        name: t.name,
        logo_url: t.logo_url || null,
        accent_color: t.accent_color,
        heading_text: t.heading_text,
        body_text: t.body_text,
        background_key: t.background_key,
        show_coordinates: t.show_coordinates,
        show_social: t.show_social,
        social_handles: t.social_handles,
        company_user_id: t.company_user_id || null,
        is_default: t.is_default,
      };
      if (t.id) {
        const { error } = await supabase.from("certificate_templates").update(payload).eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("certificate_templates").insert(payload);
        if (error) throw error;
      }
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally { setSaving(false); }
  };

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_auto]">
      <section className="surface-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">{t.id ? "Redigera mall" : "Ny mall"}</h2>
          <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={onClose}>← Tillbaka</button>
        </div>

        <Field label="Namn"><input className="input-field" value={t.name} onChange={e => setT({ ...t, name: e.target.value })} /></Field>
        <Field label="Logga (URL)">
          <input className="input-field" placeholder="https://..." value={t.logo_url ?? ""} onChange={e => setT({ ...t, logo_url: e.target.value })} />
        </Field>
        <Field label="Accentfärg">
          <div className="flex items-center gap-3">
            <input type="color" className="h-10 w-14 rounded-lg border" value={t.accent_color} onChange={e => setT({ ...t, accent_color: e.target.value })} />
            <input className="input-field font-mono !w-40" value={t.accent_color} onChange={e => setT({ ...t, accent_color: e.target.value })} />
          </div>
        </Field>
        <Field label="Rubriktext"><input className="input-field" value={t.heading_text} onChange={e => setT({ ...t, heading_text: e.target.value })} /></Field>
        <Field label="Brödtext">
          <textarea className="input-field min-h-[110px]" value={t.body_text} onChange={e => setT({ ...t, body_text: e.target.value })} />
        </Field>
        <Field label="Bakgrund">
          <div className="flex flex-wrap gap-2">
            {BACKGROUND_OPTIONS.map(b => (
              <button key={b.key} type="button"
                onClick={() => setT({ ...t, background_key: b.key })}
                className="rounded-xl px-3 py-2 text-sm font-medium border"
                style={{
                  background: b.css,
                  borderColor: t.background_key === b.key ? "var(--primary)" : "var(--border)",
                  color: "var(--forest)",
                  boxShadow: t.background_key === b.key ? "0 0 0 3px rgba(30,158,106,0.18)" : undefined,
                }}>
                {b.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Sociala medier">
          <input className="input-field" value={t.social_handles} onChange={e => setT({ ...t, social_handles: e.target.value })} />
        </Field>
        <div className="space-y-2">
          <Toggle label="Visa koordinater" checked={t.show_coordinates} onChange={v => setT({ ...t, show_coordinates: v })} />
          <Toggle label="Visa sociala medier-rad" checked={t.show_social} onChange={v => setT({ ...t, show_social: v })} />
          <Toggle label="Standardvariant" checked={t.is_default} onChange={v => setT({ ...t, is_default: v })} />
        </div>

        {error && <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}>{error}</div>}

        <div className="flex gap-3 pt-2">
          <button className="btn-primary" disabled={saving} onClick={save}>{saving ? "Sparar…" : "Spara"}</button>
          <button className="btn-secondary" onClick={onClose}>Avbryt</button>
        </div>
      </section>

      <aside className="lg:sticky lg:top-6 self-start">
        <div className="text-xs uppercase tracking-wider mb-2 text-center" style={{ color: "var(--muted-foreground)" }}>
          Live-förhandsvisning
        </div>
        <div style={{ width: 432, height: 600, overflow: "hidden" }}>
          <Certificate data={preview} scale={0.6} />
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-[color:var(--primary)]" />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function SettingsTab({ settings, reload }: { settings: Settings; reload: () => Promise<void> }) {
  const [s, setS] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setMsg(null);
    const { error } = await supabase.from("app_settings").update({
      planting_location_name: s.planting_location_name,
      planting_latitude: Number(s.planting_latitude),
      planting_longitude: Number(s.planting_longitude),
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    setSaving(false);
    if (error) { setMsg(error.message); return; }
    setMsg("Sparat.");
    await reload();
  };

  return (
    <section className="surface-card mt-6 p-6 max-w-xl">
      <h2 className="font-display text-xl font-semibold">Aktuell planteringsplats</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
        Denna plats stämplas på nya värdebevis vid köptillfället.
      </p>
      <div className="mt-4 space-y-4">
        <Field label="Platsnamn">
          <input className="input-field" value={s.planting_location_name} onChange={e => setS({ ...s, planting_location_name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitud">
            <input className="input-field font-mono" type="number" step="0.0001" value={s.planting_latitude} onChange={e => setS({ ...s, planting_latitude: e.target.value })} />
          </Field>
          <Field label="Longitud">
            <input className="input-field font-mono" type="number" step="0.0001" value={s.planting_longitude} onChange={e => setS({ ...s, planting_longitude: e.target.value })} />
          </Field>
        </div>
        {msg && <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{msg}</div>}
        <button className="btn-primary" disabled={saving} onClick={save}>{saving ? "Sparar…" : "Spara"}</button>
      </div>
    </section>
  );
}
