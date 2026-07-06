import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListTemplates, adminUpsertTemplate, adminDeleteTemplate,
  adminListGreetings, adminReplaceGreeting,
} from "@/lib/certificate-templates.functions";
import { Certificate, type CertificateData, type TemplateConfig, type ThemeKey, type MotifKey, type FrameKey, type HighlightKey } from "@/components/certificate";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = any;

const THEMES: { key: ThemeKey; label: string }[] = [
  { key: "klassisk_gron", label: "Klassisk grön" },
  { key: "midnatt", label: "Midnatt" },
  { key: "papper_guld", label: "Papper & guld" },
  { key: "kalas", label: "Kalas" },
  { key: "vinter", label: "Vinter" },
];
const MOTIFS: { key: MotifKey; label: string }[] = [
  { key: "ingen", label: "Ingen" },
  { key: "trad_rad", label: "Trädrad" },
  { key: "stjarnhimmel", label: "Stjärnhimmel" },
  { key: "konfetti_ballonger", label: "Konfetti & ballonger" },
  { key: "projektdjur", label: "Projektdjur" },
  { key: "snoflingor_granar", label: "Snöflingor & granar" },
];
const FRAMES: { key: FrameKey; label: string }[] = [
  { key: "ingen", label: "Ingen" }, { key: "guldlinje", label: "Guldlinje" }, { key: "dubbel", label: "Dubbel" },
];
const HIGHLIGHTS: { key: HighlightKey; label: string }[] = [
  { key: "trad_stort", label: "Träd stort" }, { key: "co2_stort", label: "CO₂ stort" }, { key: "plats_stort", label: "Plats stort" },
];

export function AdminCertificateDesigner() {
  const list = useServerFn(adminListTemplates);
  const upsert = useServerFn(adminUpsertTemplate);
  const remove = useServerFn(adminDeleteTemplate);
  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    const r = await list();
    setRows(r.templates);
    // Load orgs (best effort, via admin list function if available; else empty)
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.from("organizations").select("id, name").order("name").limit(200);
      setOrgs(data ?? []);
    } catch {/* ignore */}
  };
  useEffect(() => { refresh().catch((e) => setMsg(String(e.message ?? e))); }, []);

  const newTemplate = () => setEditing({
    id: null, name: "Ny mall", category: "standard",
    accent_color: "#1E9E6A", heading_text: "VÄRDEBEVIS", body_text: "",
    background_key: "mint", logo_url: null, thumbnail_url: null,
    active: true, sort: 100, org_id: null, allows_greeting: false,
    show_coordinates: true, show_social: true, social_handles: "@smartklimat",
    config: { tema: "klassisk_gron", motiv: "ingen", ram: "ingen", highlight: "trad_stort",
      visa_falt: { co2: true, plats: true, datum: true, karta: false }, badge_position: "top-right" },
  });

  const del = async (id: string) => {
    if (!confirm("Ta bort mallen?")) return;
    await remove({ data: { id } });
    await refresh();
  };
  const toggleActive = async (r: Row) => {
    await upsert({ data: { ...r, active: !r.active, config: r.config ?? {} } });
    await refresh();
  };

  return (
    <section className="surface-card p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-semibold">Bevisdesigner</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Skapa, redigera och sortera värdebevis-mallar. Live-preview visas när du redigerar.
          </p>
        </div>
        <button className="btn-primary" onClick={newTemplate}>+ Ny mall</button>
      </div>

      {msg && <div className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>{msg}</div>}

      <div className="mt-4 grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-lg flex-shrink-0" style={{ background: r.accent_color }} />
              <div className="min-w-0">
                <div className="font-medium truncate">{r.name} {r.is_default && <span className="ml-2 text-xs" style={{ color: "var(--muted-foreground)" }}>(standard)</span>}</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {r.category} · sort {r.sort} · {r.active ? "aktiv" : "inaktiv"}{r.org_id ? " · org-låst" : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button className="chip" onClick={() => toggleActive(r)}>{r.active ? "Inaktivera" : "Aktivera"}</button>
              <button className="chip" onClick={() => setEditing(r)}>Redigera</button>
              {!r.is_default && <button className="chip" onClick={() => del(r.id)}>Ta bort</button>}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <TemplateEditor
          template={editing}
          orgs={orgs}
          onClose={() => setEditing(null)}
          onSaved={async () => { await refresh(); setEditing(null); }}
        />
      )}

      <div className="mt-8 border-t pt-6" style={{ borderColor: "var(--border)" }}>
        <GreetingsPanel />
      </div>
    </section>
  );
}

function TemplateEditor({ template, orgs, onClose, onSaved }: {
  template: Row; orgs: { id: string; name: string }[];
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const upsert = useServerFn(adminUpsertTemplate);
  const [t, setT] = useState<Row>({ ...template, config: template.config ?? {} });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cfg: TemplateConfig = t.config ?? {};
  const setCfg = (patch: Partial<TemplateConfig>) => setT({ ...t, config: { ...cfg, ...patch } });
  const setVisa = (patch: Partial<NonNullable<TemplateConfig["visa_falt"]>>) =>
    setCfg({ visa_falt: { ...(cfg.visa_falt ?? { co2: true, plats: true, datum: true, karta: false }), ...patch } });

  const preview: CertificateData = {
    verification_id: "SK-2026-0001",
    recipient_name: "Anna Andersson",
    tree_count: 25,
    location_name: "Luanshya, Copperbelt, Zambia",
    latitude: -13.1367, longitude: 28.4183,
    issued_date: new Date().toISOString(),
    greeting: t.allows_greeting ? "Grattis på födelsedagen från oss alla!" : null,
    template: {
      logo_url: t.logo_url, accent_color: t.accent_color, heading_text: t.heading_text,
      body_text: t.body_text, background_key: t.background_key,
      show_coordinates: t.show_coordinates, show_social: t.show_social,
      social_handles: t.social_handles, config: cfg, allows_greeting: t.allows_greeting,
    },
  };

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await upsert({ data: {
        id: t.id, name: t.name, category: t.category,
        accent_color: t.accent_color, heading_text: t.heading_text, body_text: t.body_text ?? "",
        background_key: t.background_key, logo_url: t.logo_url || null, thumbnail_url: t.thumbnail_url || null,
        active: !!t.active, sort: Number(t.sort) || 100, org_id: t.org_id || null,
        allows_greeting: !!t.allows_greeting,
        show_coordinates: !!t.show_coordinates, show_social: !!t.show_social,
        social_handles: t.social_handles ?? "@smartklimat",
        config: cfg as any,
      }});
      await onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: "rgba(11,61,46,0.55)" }}>
      <div className="w-full max-w-6xl mt-6 mb-12 rounded-3xl overflow-hidden" style={{ background: "var(--card)" }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: "var(--border)" }}>
          <h3 className="font-display text-xl font-semibold">Redigera mall</h3>
          <button className="chip" onClick={onClose}>Stäng</button>
        </div>
        <div className="grid md:grid-cols-2 gap-6 p-6">
          <div className="space-y-3">
            <label className="block text-sm">Namn
              <input className="input-field mt-1 w-full" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Kategori
                <select className="input-field mt-1 w-full" value={t.category} onChange={(e) => setT({ ...t, category: e.target.value })}>
                  <option value="standard">Standard</option>
                  <option value="tillval">Tillval (kassan)</option>
                  <option value="org">Org (låst)</option>
                </select>
              </label>
              <label className="block text-sm">Sortering
                <input className="input-field mt-1 w-full" type="number" value={t.sort} onChange={(e) => setT({ ...t, sort: Number(e.target.value) })} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Tema
                <select className="input-field mt-1 w-full" value={cfg.tema ?? "klassisk_gron"} onChange={(e) => setCfg({ tema: e.target.value as ThemeKey })}>
                  {THEMES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </label>
              <label className="block text-sm">Motiv
                <select className="input-field mt-1 w-full" value={cfg.motiv ?? "ingen"} onChange={(e) => setCfg({ motiv: e.target.value as MotifKey })}>
                  {MOTIFS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </label>
              <label className="block text-sm">Ram
                <select className="input-field mt-1 w-full" value={cfg.ram ?? "ingen"} onChange={(e) => setCfg({ ram: e.target.value as FrameKey })}>
                  {FRAMES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </label>
              <label className="block text-sm">Highlight
                <select className="input-field mt-1 w-full" value={cfg.highlight ?? "trad_stort"} onChange={(e) => setCfg({ highlight: e.target.value as HighlightKey })}>
                  {HIGHLIGHTS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </label>
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="text-sm font-medium mb-2">Synliga fält</div>
              <div className="flex flex-wrap gap-3 text-sm">
                {(["co2", "plats", "datum", "karta"] as const).map((k) => {
                  const on = (cfg.visa_falt ?? { co2: true, plats: true, datum: true, karta: false })[k] !== false && (cfg.visa_falt ?? {})[k] !== undefined ? (cfg.visa_falt ?? {})[k] : (k === "karta" ? false : true);
                  return (
                    <label key={k} className="flex items-center gap-2">
                      <input type="checkbox" checked={!!on} onChange={(e) => setVisa({ [k]: e.target.checked } as any)} />
                      {k}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Accentfärg
                <input className="input-field mt-1 w-full" type="color" value={t.accent_color} onChange={(e) => setT({ ...t, accent_color: e.target.value })} />
              </label>
              <label className="block text-sm">Bakgrundsnyckel (legacy)
                <input className="input-field mt-1 w-full" value={t.background_key} onChange={(e) => setT({ ...t, background_key: e.target.value })} />
              </label>
            </div>
            <label className="block text-sm">Rubriktext
              <input className="input-field mt-1 w-full" value={t.heading_text} onChange={(e) => setT({ ...t, heading_text: e.target.value })} />
            </label>
            <label className="block text-sm">Brödtext
              <textarea className="input-field mt-1 w-full" rows={3} value={t.body_text ?? ""} onChange={(e) => setT({ ...t, body_text: e.target.value })} />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Logo URL
                <input className="input-field mt-1 w-full" value={t.logo_url ?? ""} onChange={(e) => setT({ ...t, logo_url: e.target.value })} />
              </label>
              <label className="block text-sm">Thumbnail URL
                <input className="input-field mt-1 w-full" value={t.thumbnail_url ?? ""} onChange={(e) => setT({ ...t, thumbnail_url: e.target.value })} />
              </label>
            </div>

            <label className="block text-sm">Lås till organisation
              <select className="input-field mt-1 w-full" value={t.org_id ?? ""} onChange={(e) => setT({ ...t, org_id: e.target.value || null })}>
                <option value="">— Ingen —</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>

            <div className="flex flex-wrap gap-4 pt-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!t.active} onChange={(e) => setT({ ...t, active: e.target.checked })} /> Aktiv</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!t.allows_greeting} onChange={(e) => setT({ ...t, allows_greeting: e.target.checked })} /> Tillåt hälsning</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!t.show_coordinates} onChange={(e) => setT({ ...t, show_coordinates: e.target.checked })} /> Visa koordinater</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!t.show_social} onChange={(e) => setT({ ...t, show_social: e.target.checked })} /> Visa social</label>
            </div>

            {err && <div className="text-sm" style={{ color: "var(--destructive)" }}>{err}</div>}
            <div className="flex gap-3 pt-2">
              <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Sparar…" : "Spara"}</button>
              <button className="btn-secondary" onClick={onClose}>Avbryt</button>
            </div>
          </div>

          <div className="min-w-0">
            <div className="text-xs mb-2 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Live-preview</div>
            <div className="overflow-hidden rounded-2xl" style={{ height: 500 }}>
              <div style={{ transform: "scale(0.55)", transformOrigin: "top left" }}>
                <Certificate data={preview} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GreetingsPanel() {
  const list = useServerFn(adminListGreetings);
  const replace = useServerFn(adminReplaceGreeting);
  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setRows((await list()).rows);
  useEffect(() => { refresh().catch(() => {}); }, []);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await replace({ data: { certificateId: editing.id, newGreeting: editing.text } });
      setEditing(null);
      await refresh();
    } finally { setBusy(false); }
  };

  return (
    <div>
      <h3 className="font-display text-lg font-semibold">Hälsningar</h3>
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        Alla personliga hälsningar från kassan. Ersätt och skicka om bevis vid behov.
      </p>
      <div className="mt-3 grid gap-2 max-h-96 overflow-y-auto">
        {rows.length === 0 && <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Inga hälsningar ännu.</div>}
        {rows.map((r) => (
          <div key={r.purchase_id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {new Date(r.purchase_created_at).toLocaleString("sv-SE")} · {r.template_name ?? "—"} · {r.recipient_name ?? r.recipient_email}
            </div>
            <div className="mt-1 text-sm">"{r.certificate_greeting ?? r.purchase_greeting}"</div>
            {r.certificate_id && (
              <button className="chip mt-2" onClick={() => setEditing({ id: r.certificate_id, text: r.certificate_greeting ?? r.purchase_greeting ?? "" })}>
                Ersätt text
              </button>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,61,46,0.55)" }}>
          <div className="w-full max-w-lg rounded-2xl p-5" style={{ background: "var(--card)" }}>
            <h4 className="font-display text-lg font-semibold">Ersätt hälsning</h4>
            <textarea className="input-field mt-3 w-full" rows={3} maxLength={120}
              value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
            <div className="mt-3 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Avbryt</button>
              <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Sparar…" : "Spara och skicka om"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
