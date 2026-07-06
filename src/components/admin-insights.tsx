import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { getInsightsAll } from "@/lib/insights.functions";

type Kpis = {
  trees_total: number; trees_week: number; trees_prev_week: number;
  active_planters: number; revenue_mtd_ore: number;
  activation_rate: number; sellers_registered: number; sellers_active: number;
  payout_count: number; payout_amount_ore: number; payout_oldest: string | null;
};
type WeeklyRow = { week_start: string; source: string; trees: number };
type MixRow = { source: string; trees: number; revenue_ore: number };
type Engine = {
  median_time_to_first_tree_sec: number;
  streak_active: number; streak_healthy: number; streak_healthy_pct: number;
  turbo_activations_week: number;
  w1_retention_pct: number; w1_cohort: number;
};
type Recipients = {
  customers_total: number; customers_new_30d: number;
  certificates_total: number; certificates_linked: number; proof_to_account_pct: number;
  verify_views_30d: number; repeat_buyers: number;
  active_monthly: number; churn_30d: number;
};
type Risk = {
  payout_count: number; payout_amount_ore: number; payout_oldest: string | null;
  suppressions_7d: number; open_photo_reports: number;
  last_backup: { created_at: string; ok: boolean; note: string | null } | null;
  reward_orders_pending: number; reward_orders_oldest: string | null;
};
type TeamRow = { team_id: string; team_name: string; trees: number };

const SOURCE_COLORS: Record<string, string> = {
  smaarty: "#1E9E6A",
  mockfjards: "#DCBE6E",
  web: "#3B82F6",
  monthly: "#8B5CF6",
  gift: "#F6B27A",
  total: "#0F172A",
};
const SOURCES = ["smaarty", "mockfjards", "web", "monthly", "gift"];

function kr(ore: number) { return `${Math.round(ore / 100).toLocaleString("sv-SE")} kr`; }
function pct(v: number) { return `${v}%`; }
function dateStr(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("sv-SE");
}
function ageDays(iso: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function fmtDur(sec: number) {
  if (!sec || sec <= 0) return "—";
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} h`;
  return `${(sec / 86400).toFixed(1)} d`;
}

function KpiChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
      <div className="text-[11px] uppercase tracking-wider font-mono" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{sub}</div>}
    </div>
  );
}

export function AdminInsightsSection() {
  const load = useServerFn(getInsightsAll);
  const [data, setData] = useState<Awaited<ReturnType<typeof getInsightsAll>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    load().then(setData).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [load]);

  if (err) return <section className="surface-card p-6"><h2 className="font-display text-xl font-semibold">Insights</h2><p className="mt-2 text-sm" style={{ color: "var(--destructive)" }}>{err}</p></section>;
  if (!data) return <section className="surface-card p-6"><h2 className="font-display text-xl font-semibold">Insights</h2><p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Läser in …</p></section>;

  const kpis = data.kpis as Kpis;
  const weekly = (data.weekly as WeeklyRow[]) ?? [];
  const mix30 = (data.mix30 as MixRow[]) ?? [];
  const engine = data.engine as Engine;
  const recipients = data.recipients as Recipients;
  const risk = data.risk as Risk;
  const topTeams = (data.topTeams as TeamRow[]) ?? [];

  // Pivot weekly to chart data
  const weeksSet = Array.from(new Set(weekly.map((r) => r.week_start))).sort();
  const weeklyChart = weeksSet.map((wk) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any = { week: wk.slice(5) };
    let total = 0;
    for (const s of SOURCES) {
      const t = weekly.filter((r) => r.week_start === wk && r.source === s).reduce((a, b) => a + b.trees, 0);
      row[s] = t; total += t;
    }
    row.total = total;
    return row;
  });

  const wowDelta = kpis.trees_prev_week === 0
    ? (kpis.trees_week > 0 ? "+∞" : "±0")
    : `${kpis.trees_week - kpis.trees_prev_week >= 0 ? "+" : ""}${Math.round(100 * (kpis.trees_week - kpis.trees_prev_week) / kpis.trees_prev_week)}%`;

  return (
    <section className="surface-card p-6 space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold">Insights</h2>
        <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>uppdaterad {new Date().toLocaleTimeString("sv-SE")}</span>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiChip label="Träd totalt" value={kpis.trees_total.toLocaleString("sv-SE")} />
        <KpiChip label="Träd denna vecka" value={kpis.trees_week.toLocaleString("sv-SE")} sub={`v/v ${wowDelta}`} />
        <KpiChip label="Aktiva planterare" value={kpis.active_planters.toLocaleString("sv-SE")} sub="säljare 28 d + mån-prenumeranter" />
        <KpiChip label="Intäkt MTD" value={kr(kpis.revenue_mtd_ore)} />
        <KpiChip label="Aktiveringsgrad" value={pct(kpis.activation_rate)} sub={`${kpis.sellers_active} av ${kpis.sellers_registered} säljare`} />
        <KpiChip label="Payout-kö" value={`${kpis.payout_count} st · ${kr(kpis.payout_amount_ore)}`} sub={kpis.payout_oldest ? `äldsta ${dateStr(kpis.payout_oldest)}` : "inga öppna"} />
      </div>

      {/* Weekly series */}
      <div>
        <h3 className="font-display text-base font-semibold">Träd per vecka — 12 v</h3>
        <div className="mt-2 h-64">
          <ResponsiveContainer>
            <LineChart data={weeklyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {SOURCES.map((s) => (
                <Line key={s} type="monotone" dataKey={s} stroke={SOURCE_COLORS[s]} strokeWidth={2} dot={false} />
              ))}
              <Line type="monotone" dataKey="total" stroke={SOURCE_COLORS.total} strokeWidth={2.5} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Channel mix 30d */}
      <div>
        <h3 className="font-display text-base font-semibold">Kanalmix — 30 d</h3>
        <div className="mt-2 h-56">
          <ResponsiveContainer>
            <BarChart data={mix30}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="source" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="trees" fill="#1E9E6A" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sales engine */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="font-display text-base font-semibold">Säljmotor</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Median till första trädet</dt><dd className="font-semibold">{fmtDur(engine.median_time_to_first_tree_sec)}</dd></div>
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Streak-hälsa (≥ 2 v)</dt><dd className="font-semibold">{pct(engine.streak_healthy_pct)} <span className="text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>({engine.streak_healthy}/{engine.streak_active})</span></dd></div>
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Turboaktiveringar/v</dt><dd className="font-semibold">{engine.turbo_activations_week}</dd></div>
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>W1-retention</dt><dd className="font-semibold">{pct(engine.w1_retention_pct)} <span className="text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>({engine.w1_cohort} i kohort)</span></dd></div>
          </dl>
        </div>

        {/* Recipients */}
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="font-display text-base font-semibold">Mottagare</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Kunder totalt</dt><dd className="font-semibold">{recipients.customers_total.toLocaleString("sv-SE")}</dd></div>
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Nya 30 d</dt><dd className="font-semibold">{recipients.customers_new_30d}</dd></div>
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Bevis→konto</dt><dd className="font-semibold">{pct(recipients.proof_to_account_pct)} <span className="text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>({recipients.certificates_linked}/{recipients.certificates_total})</span></dd></div>
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Bevisvisningar 30 d</dt><dd className="font-semibold">{recipients.verify_views_30d}</dd></div>
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Återkommande köpare</dt><dd className="font-semibold">{recipients.repeat_buyers}</dd></div>
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Aktiva månadsplanterare</dt><dd className="font-semibold">{recipients.active_monthly} <span className="text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>churn 30 d: {recipients.churn_30d}</span></dd></div>
          </dl>
        </div>
      </div>

      {/* Risk & queues */}
      <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
        <h3 className="font-display text-base font-semibold">Risk & köer</h3>
        <dl className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Payout-kö</dt><dd className="font-semibold">{risk.payout_count} · {kr(risk.payout_amount_ore)}</dd></div>
          <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Mail-suppression 7 d</dt><dd className="font-semibold">{risk.suppressions_7d}</dd></div>
          <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Öppna bildanmälningar</dt><dd className="font-semibold">{risk.open_photo_reports}</dd></div>
          <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Senaste backup</dt><dd className="font-semibold">{risk.last_backup ? `${risk.last_backup.ok ? "OK" : "FEL"} · ${dateStr(risk.last_backup.created_at)}` : "—"}</dd></div>
          <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Opackade belöningar</dt><dd className="font-semibold">{risk.reward_orders_pending}{risk.reward_orders_oldest ? ` · ${ageDays(risk.reward_orders_oldest)} d` : ""}</dd></div>
          <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Äldsta payout</dt><dd className="font-semibold">{dateStr(risk.payout_oldest)}</dd></div>
        </dl>
      </div>

      {/* Top 5 teams */}
      <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
        <h3 className="font-display text-base font-semibold">Topp 5 lag — denna vecka</h3>
        {topTeams.length === 0
          ? <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Ingen aktivitet ännu.</p>
          : (
            <ol className="mt-3 space-y-1.5 text-sm">
              {topTeams.map((t, i) => (
                <li key={t.team_id} className="flex justify-between">
                  <span><span className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{i + 1}.</span> {t.team_name}</span>
                  <span className="font-semibold">{t.trees} träd</span>
                </li>
              ))}
            </ol>
          )}
      </div>

      <TreebankInsightsRow />
    </section>
  );
}

function TreebankInsightsRow() {
  const [d, setD] = useState<{ members: number; lov_out: number; claims_30d: number } | null>(null);
  useEffect(() => {
    import("@/lib/club.functions").then(async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc("admin_insights_treebank");
      if (data) setD(data);
    });
  }, []);
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
      <h3 className="font-display text-base font-semibold">Trädbanken (kund-klubben)</h3>
      <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Separat från säljarpoängen.</p>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Medlemmar</dt><dd className="font-semibold">{d?.members ?? "—"}</dd></div>
        <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Löv ute</dt><dd className="font-semibold">{d?.lov_out?.toLocaleString("sv-SE") ?? "—"}</dd></div>
        <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Claims 30 d</dt><dd className="font-semibold">{d?.claims_30d ?? "—"}</dd></div>
      </dl>
    </div>
  );
}
