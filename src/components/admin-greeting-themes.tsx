import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListGreetingThemes, adminUpsertGreetingTheme, adminDeleteGreetingTheme,
} from "@/lib/greeting-themes.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = any;

const CATS = ["standard","kalas","hogtid","tack","forlat","djurfadder"] as const;

export function AdminGreetingThemes() {
  const list = useServerFn(adminListGreetingThemes);
  const upsert = useServerFn(adminUpsertGreetingTheme);
  const remove = useServerFn(adminDeleteGreetingTheme);
  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => list().then((r) => setRows(r.themes)).catch((e) => setErr(String(e.message ?? e)));
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const newTheme = () => setEditing({
    id: null, name: "Nytt tema", slug: `tema-${Date.now()}`, category: "standard",
    active: true, sort: 100,
    config: {
      palette: { bg: "#0B3D2E", accent: "#1E9E6A", soft: "#EAF7EE", ink: "#0B3D2E", muted: "#6E9483" },
      motif: "trees",
      heading_template: "Tack, {recipient_name}!",
      eyebrow: "DITT BEVIS",
      reveal: { confetti: true, colors: ["#1E9E6A","#EAF7EE"] },
    },
  });

  const toggle = async (r: Row) => {
    await upsert({ data: { id: r.id, name: r.name, slug: r.slug, category: r.category, active: !r.active, sort: r.sort, config: r.config ?? {} } });
    refresh();
  };
  const del = async (id: string) => {
    if (!confirm("Ta bort temat?")) return;
    await remove({ data: { id } });
    refresh();
  };

  return (
    <section className="surface-card p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Hälsningsteman</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Styr utseendet på bevismailet och reveal-animationen. Certifikatets PDF påverkas inte.
          </p>
        </div>
        <button className="btn-primary" onClick={newTheme}>+ Nytt tema</button>
      </div>
      {err && <div className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>{err}</div>}

      <div className="mt-4 grid gap-2">
        {rows.map((r) => {
          const p = r.config?.palette ?? {};
          return (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${p.bg || "#0B3D2E"}, ${p.accent || "#1E9E6A"})` }} />
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {r.name} {r.is_default && <span className="ml-2 text-xs" style={{ color: "var(--muted-foreground)" }}>(standard)</span>}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {r.category} · sort {r.sort} · {r.active ? "aktiv" : "inaktiv"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button className="chip" onClick={() => toggle(r)}>{r.active ? "Inaktivera" : "Aktivera"}</button>
                <button className="chip" onClick={() => setEditing(r)}>Redigera</button>
                {!r.is_default && <button className="chip" onClick={() => del(r.id)}>Ta bort</button>}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <ThemeEditor row={editing} onClose={() => setEditing(null)} onSaved={async () => { await refresh(); setEditing(null); }} />
      )}
    </section>
  );
}

function ThemeEditor({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => Promise<void> }) {
  const upsert = useServerFn(adminUpsertGreetingTheme);
  const [t, setT] = useState<Row>({ ...row, config: row.config ?? {} });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const p = t.config?.palette ?? {};
  const setCfg = (patch: any) => setT({ ...t, config: { ...(t.config ?? {}), ...patch } });
  const setPal = (patch: any) => setCfg({ palette: { ...(p ?? {}), ...patch } });

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await upsert({ data: {
        id: t.id, name: t.name, slug: t.slug, category: t.category,
        active: !!t.active, sort: Number(t.sort) || 100, config: t.config ?? {},
      }});
      await onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const heading = String(t.config?.heading_template ?? "").replace("{recipient_name}", "Anna");
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: "rgba(11,61,46,0.55)" }}>
      <div className="w-full max-w-5xl mt-6 mb-12 rounded-3xl overflow-hidden" style={{ background: "var(--card)" }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: "var(--border)" }}>
          <h3 className="font-display text-xl font-semibold">Redigera tema</h3>
          <button className="chip" onClick={onClose}>Stäng</button>
        </div>
        <div className="grid md:grid-cols-2 gap-6 p-6">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Namn
                <input className="input-field mt-1 w-full" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
              </label>
              <label className="block text-sm">Slug
                <input className="input-field mt-1 w-full" value={t.slug} onChange={(e) => setT({ ...t, slug: e.target.value })} />
              </label>
              <label className="block text-sm">Kategori
                <select className="input-field mt-1 w-full" value={t.category} onChange={(e) => setT({ ...t, category: e.target.value })}>
                  {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block text-sm">Sortering
                <input className="input-field mt-1 w-full" type="number" value={t.sort} onChange={(e) => setT({ ...t, sort: Number(e.target.value) })} />
              </label>
            </div>

            <div className="rounded-xl border p-3 grid grid-cols-5 gap-2" style={{ borderColor: "var(--border)" }}>
              {(["bg","accent","soft","ink","muted"] as const).map((k) => (
                <label key={k} className="block text-xs">
                  {k}
                  <input type="color" value={p[k] || "#000000"} onChange={(e) => setPal({ [k]: e.target.value })}
                    className="mt-1 w-full h-9 rounded" />
                </label>
              ))}
            </div>

            <label className="block text-sm">Rubrikmall <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{"{recipient_name} ersätts"}</span>
              <input className="input-field mt-1 w-full" value={t.config?.heading_template ?? ""} onChange={(e) => setCfg({ heading_template: e.target.value })} />
            </label>
            <label className="block text-sm">Eyebrow
              <input className="input-field mt-1 w-full" value={t.config?.eyebrow ?? ""} onChange={(e) => setCfg({ eyebrow: e.target.value })} />
            </label>
            <label className="block text-sm">Motiv-nyckel
              <input className="input-field mt-1 w-full" value={t.config?.motif ?? ""} onChange={(e) => setCfg({ motif: e.target.value })} />
            </label>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!t.active} onChange={(e) => setT({ ...t, active: e.target.checked })} /> Aktiv
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!t.config?.reveal?.confetti}
                  onChange={(e) => setCfg({ reveal: { ...(t.config?.reveal ?? {}), confetti: e.target.checked } })} />
                Konfetti i reveal
              </label>
            </div>

            {err && <div className="text-sm" style={{ color: "var(--destructive)" }}>{err}</div>}
            <div className="flex gap-3 pt-2">
              <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Sparar…" : "Spara"}</button>
              <button className="btn-secondary" onClick={onClose}>Avbryt</button>
            </div>
          </div>

          <div className="min-w-0">
            <div className="text-xs mb-2 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Live-preview (mail-hero)</div>
            <div className="rounded-2xl p-6 text-center"
              style={{ background: `linear-gradient(135deg, ${p.bg || "#0B3D2E"}, ${p.accent || "#1E9E6A"})`, color: p.soft || "#EAF7EE" }}>
              <div className="text-[10px] tracking-[0.28em] uppercase" style={{ color: p.soft || "#EAF7EE", opacity: 0.85 }}>
                {t.config?.eyebrow}
              </div>
              <div className="mt-2 font-display text-xl font-semibold">{heading}</div>
              <div className="mt-6 rounded-xl p-4 text-left" style={{ background: p.soft || "#EAF7EE", color: p.ink || "#0B3D2E" }}>
                <div className="text-xs uppercase tracking-wider" style={{ color: p.muted || "#6E9483" }}>TILL ANNA</div>
                <div className="mt-2 italic text-sm">"Grattis på födelsedagen från oss alla!"</div>
                <div className="mt-3 font-display text-4xl font-bold" style={{ color: p.accent || "#1E9E6A" }}>25</div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: p.muted }}>träd planterade i ditt namn</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
