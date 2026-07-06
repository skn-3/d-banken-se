import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminListActivity, adminGetEconomySettings, adminUpdateEconomySettings, adminExportPurchases } from "@/lib/admin-extra.functions";

interface ActivityRow {
  id: string;
  user_id: string | null;
  admin_name: string;
  admin_email: string | null;
  action: string;
  detail: unknown;
  created_at: string;
}

function targetSummary(detail: unknown): string {
  if (!detail || typeof detail !== "object") return "";
  const d = detail as Record<string, unknown>;
  const bits: string[] = [];
  for (const key of ["team_name","team_id","purchase_id","certificate_id","email","new_email","old_email","rows","from","to"]) {
    if (d[key] !== undefined && d[key] !== null) {
      const v = typeof d[key] === "object" ? JSON.stringify(d[key]) : String(d[key]);
      bits.push(`${key}: ${v.length > 40 ? v.slice(0, 40) + "…" : v}`);
      if (bits.length >= 3) break;
    }
  }
  return bits.join(" · ");
}

export function AdminActivityTab() {
  const listFn = useServerFn(adminListActivity);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await listFn({ data: { action: action || undefined, from: from || undefined, to: to || undefined } });
      setRows(r.rows as ActivityRow[]);
      setActions(r.actions as string[]);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <section className="surface-card mt-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Aktivitetslogg</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Senaste 200 admin-åtgärderna. Endast läsning.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input-field !py-1 !text-sm" value={action} onChange={e => setAction(e.target.value)}>
            <option value="">Alla åtgärder</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className="input-field !py-1 !text-sm" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <input className="input-field !py-1 !text-sm" type="date" value={to} onChange={e => setTo(e.target.value)} />
          <button className="btn-primary !py-1 !px-3 text-sm" onClick={load}>Filtrera</button>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Laddar…</div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
              <tr><th className="py-2">Tid</th><th>Admin</th><th>Åtgärd</th><th>Mål</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{new Date(r.created_at).toLocaleString("sv-SE")}</td>
                  <td className="py-2">{r.admin_name}{r.admin_email && <div className="font-mono text-[10px]" style={{ color: "var(--muted-foreground)" }}>{r.admin_email}</div>}</td>
                  <td className="py-2 font-mono text-xs">{r.action}</td>
                  <td className="py-2 text-xs" style={{ color: "var(--muted-foreground)" }}>{targetSummary(r.detail)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="py-6 text-center" style={{ color: "var(--muted-foreground)" }}>Inga poster.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---- Economy settings block --------------------------------------------

function oreToKr(ore: number): string {
  return (ore / 100).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AdminEconomySettings() {
  const getFn = useServerFn(adminGetEconomySettings);
  const saveFn = useServerFn(adminUpdateEconomySettings);
  const [teamShare, setTeamShare] = useState(0);
  const [rewardBudget, setRewardBudget] = useState(0);
  const [origTeamShare, setOrigTeamShare] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await getFn({ data: {} });
      setTeamShare(r.team_share_ore_per_tree);
      setOrigTeamShare(r.team_share_ore_per_tree);
      setRewardBudget(r.reward_budget_ore_per_tree);
      setLoading(false);
    })();
    /* eslint-disable-next-line */
  }, []);

  const teamShareChanged = teamShare !== origTeamShare;

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await saveFn({ data: { team_share_ore_per_tree: teamShare, reward_budget_ore_per_tree: rewardBudget } });
      setOrigTeamShare(teamShare);
      setMsg("Sparat och loggat.");
    } catch (e) { setMsg((e as Error).message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="surface-card mt-6 p-6 text-sm" style={{ color: "var(--muted-foreground)" }}>Laddar ekonomi…</div>;

  return (
    <section className="surface-card mt-6 p-6 max-w-xl">
      <h2 className="font-display text-xl font-semibold">Ekonomi</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
        Belopp i öre per sålt träd. Ändringar loggas i aktivitetsloggen.
      </p>
      <div className="mt-4 space-y-4">
        <label className="block">
          <div className="mb-1.5 text-sm font-medium">Lagets andel per träd (öre)</div>
          <input className="input-field font-mono" type="number" min={0} step={1}
            value={teamShare}
            onChange={e => setTeamShare(Math.max(0, Number(e.target.value) || 0))} />
          <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            {teamShare} öre = {oreToKr(teamShare)} kr/träd
          </div>
        </label>
        {teamShareChanged && (
          <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--destructive)", background: "rgba(220,38,38,0.06)", color: "var(--destructive)" }}>
            ⚠️ Påverkar alla lags intjäning framåt — historiska köp räknas inte om.
          </div>
        )}
        <label className="block">
          <div className="mb-1.5 text-sm font-medium">Belöningsbudget per träd (öre)</div>
          <input className="input-field font-mono" type="number" min={0} step={1}
            value={rewardBudget}
            onChange={e => setRewardBudget(Math.max(0, Number(e.target.value) || 0))} />
          <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            {rewardBudget} öre = {oreToKr(rewardBudget)} kr/träd
          </div>
        </label>
        {msg && <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{msg}</div>}
        <button className="btn-primary" disabled={saving} onClick={save}>{saving ? "Sparar…" : "Spara"}</button>
      </div>
    </section>
  );
}

// ---- CSV export button -------------------------------------------------

export function AdminPurchasesExport() {
  const exportFn = useServerFn(adminExportPurchases);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await exportFn({ data: { from: from || undefined, to: to || undefined } });
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `kop-${stamp}.csv`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      setMsg(`Exporterade ${r.count} köp.`);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">
        <div className="mb-1" style={{ color: "var(--muted-foreground)" }}>Från</div>
        <input className="input-field !py-1 !text-sm" type="date" value={from} onChange={e => setFrom(e.target.value)} />
      </label>
      <label className="text-xs">
        <div className="mb-1" style={{ color: "var(--muted-foreground)" }}>Till</div>
        <input className="input-field !py-1 !text-sm" type="date" value={to} onChange={e => setTo(e.target.value)} />
      </label>
      <button className="btn-primary !py-1 !px-3 text-sm" disabled={busy} onClick={run}>
        {busy ? "Exporterar…" : "Exportera köp (CSV)"}
      </button>
      {msg && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{msg}</span>}
    </div>
  );
}
