import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { Certificate, BACKGROUND_OPTIONS, type CertificateData } from "@/components/certificate";
import { adminSetPassword, adminSendPasswordReset } from "@/lib/admin.functions";
import { AdminOrgsTab } from "@/components/admin-orgs-tab";
import { AdminCoreTab } from "@/components/admin-core-tab";
import { adminListOrders, adminFulfillOrder, adminListRewards, adminCreateReward, adminUpdateReward, adminDeleteReward, adminListPackQueue, adminMarkTeamPacked, adminMarkTeamShipped } from "@/lib/rewards.functions";
import { getRewardBudget } from "@/lib/reward-economy.functions";
import { adminListEvents, adminCreateEvent, adminToggleEvent, adminDeleteEvent } from "@/lib/events.functions";
import { REWARD_CATEGORY_ORDER } from "@/lib/reward-catalog";


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

type Tab = "overview" | "core" | "organizations" | "rewards" | "orders" | "boosters" | "templates" | "settings";

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
                ["core", "Core"],
                ["organizations", "Organisationer"],
                ["rewards", "Belöningskatalog"],
                ["orders", "Beställningar"],
                ["boosters", "Boosters"],
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
                            <td className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{q.user_id ? `${q.user_id.slice(0, 8)}…` : "—"}</td>
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

            {tab === "core" && <AdminCoreTab />}

            {tab === "organizations" && <AdminOrgsTab />}

            {tab === "rewards" && <RewardsCatalogTab />}

            {tab === "orders" && <OrdersTab />}

            {tab === "boosters" && <BoostersTab />}

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

interface Order {
  id: string; status: string; cost_points: number; requested_at: string; fulfilled_at: string | null;
  reward_name: string; reward_category: string; team_name: string; org_name: string;
  seller_name: string; seller_email: string; seller_user_id: string; team_id: string | null;
}

interface PackItem { reward_id: string; reward_name: string; image_url: string | null; count: number; sellers: string[]; order_ids: string[] }
interface PackGroup {
  team_id: string; team_name: string; org_name: string;
  status_summary: { pending: number; packed: number };
  items: PackItem[];
}

function statusLabel(s: string): { label: string; bg: string; fg: string } {
  switch (s) {
    case "pending":   return { label: "Väntar",   bg: "var(--apricot, #fbe3c0)", fg: "var(--forest)" };
    case "packed":    return { label: "Packad",   bg: "#DCEDE1",                 fg: "var(--forest)" };
    case "shipped":   return { label: "Skickad",  bg: "#B4D8FF",                 fg: "#0B3D7A" };
    case "delivered": return { label: "Utdelad ✓", bg: "var(--forest)",          fg: "#fff" };
    default:          return { label: s,          bg: "var(--muted)",            fg: "var(--forest)" };
  }
}

function OrdersTab() {
  const listFn = useServerFn(adminListOrders);
  const fulfillFn = useServerFn(adminFulfillOrder);
  // Dynamic imports to avoid pulling all pack fns into initial chunk isn't necessary
  const packListFn = useServerFn(adminListPackQueue);
  const packTeamFn = useServerFn(adminMarkTeamPacked);
  const shipTeamFn = useServerFn(adminMarkTeamShipped);

  const [orders, setOrders] = useState<Order[]>([]);
  const [groups, setGroups] = useState<PackGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTeam, setBusyTeam] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "packed" | "shipped" | "delivered">("all");

  const reload = async () => {
    const [r, q] = await Promise.all([listFn({ data: {} }), packListFn({ data: {} })]);
    setOrders(r.orders as Order[]);
    setGroups(q.groups as PackGroup[]);
  };
  useEffect(() => { (async () => { await reload(); setLoading(false); })(); /* eslint-disable-next-line */ }, []);

  const visible = orders.filter(o => filter === "all" ? true : o.status === filter);
  if (loading) return <div className="surface-card mt-6 p-8 text-center" style={{ color: "var(--muted-foreground)" }}>Laddar…</div>;

  const runPack = async (teamId: string) => {
    setBusyTeam(teamId);
    try { const r = await packTeamFn({ data: { teamId } }); setMsg(`Packad — ${r.count} ordrar markerade.`); await reload(); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusyTeam(null); setTimeout(() => setMsg(null), 3500); }
  };
  const runShip = async (teamId: string) => {
    setBusyTeam(teamId);
    try {
      const r = await shipTeamFn({ data: { teamId } });
      setMsg(r.mailOk ? `Skickad — ${r.count} ordrar, packlista mailad till ledaren.` : `Skickad — ${r.count} ordrar (mail till ledaren misslyckades, se logg).`);
      await reload();
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusyTeam(null); setTimeout(() => setMsg(null), 4500); }
  };

  return (
    <>
      <section className="surface-card mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Belöningar — packa &amp; skicka</h2>
            <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              Väntande ordrar grupperade per lag. En sändning per lag — ledaren delar ut.
            </p>
          </div>
        </div>

        {msg && <div className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--mint-paper)", color: "var(--forest)" }}>{msg}</div>}

        {groups.length === 0 ? (
          <div className="mt-6 rounded-xl border p-6 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            Inga öppna beställningar just nu. 🎉
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {groups.map(g => {
              const total = g.items.reduce((s, i) => s + i.count, 0);
              return (
                <div key={g.team_id} className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>{g.team_name}</div>
                      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{g.org_name} · {total} priser · {g.status_summary.pending} väntar / {g.status_summary.packed} packade</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busyTeam === g.team_id || g.status_summary.pending === 0}
                              onClick={() => runPack(g.team_id)}>
                        {busyTeam === g.team_id ? "…" : "Markera packad"}
                      </button>
                      <button className="btn-primary !py-1 !px-3 text-xs" disabled={busyTeam === g.team_id || total === 0}
                              onClick={() => runShip(g.team_id)}>
                        {busyTeam === g.team_id ? "…" : "Markera skickad"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
                    {g.items.map(it => (
                      <div key={it.reward_id} className="flex items-center gap-3 py-2">
                        <div className="admin-reward-thumb shrink-0">
                          {it.image_url ? <img src={it.image_url} alt={it.reward_name} /> : <ImageIcon size={20} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{it.reward_name} <span className="font-mono text-xs" style={{ color: "var(--forest)" }}>× {it.count}</span></div>
                          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Till: {it.sellers.join(", ")}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="surface-card mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Alla beställningar</h2>
          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "packed", "shipped", "delivered"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className="chip"
                style={{ cursor: "pointer", background: filter === f ? "var(--mint)" : undefined }}>
                {f === "all" ? "Alla" : statusLabel(f).label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
              <tr><th className="py-2">Datum</th><th>Säljare</th><th>Org · Team</th><th>Belöning</th><th>Poäng</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {visible.map(o => {
                const sl = statusLabel(o.status);
                return (
                  <tr key={o.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-3 font-mono text-xs">{new Date(o.requested_at).toLocaleString("sv-SE")}</td>
                    <td><div className="font-medium">{o.seller_name}</div><div className="font-mono text-[10px]" style={{ color: "var(--muted-foreground)" }}>{o.seller_email}</div></td>
                    <td className="text-xs">{o.org_name} · {o.team_name}</td>
                    <td><span className="font-medium">{o.reward_name}</span>{o.reward_category && <span className="ml-2 chip !py-0.5 !text-[10px]">{o.reward_category}</span>}</td>
                    <td className="font-mono font-semibold" style={{ color: "var(--forest)" }}>{o.cost_points}</td>
                    <td><span className="chip !py-0.5 !text-[10px]" style={{ background: sl.bg, color: sl.fg }}>{sl.label}</span></td>
                    <td className="text-right">
                      {o.status !== "delivered" && (
                        <button className="btn-secondary !py-1 !px-2 text-xs" onClick={async () => {
                          if (!confirm("Sätt direkt till Utdelad (nödknapp)?")) return;
                          await fulfillFn({ data: { id: o.id } }); await reload();
                        }}>Utdela nu</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && <tr><td colSpan={7} className="py-8 text-center" style={{ color: "var(--muted-foreground)" }}>Inga beställningar i denna vy.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

interface CatalogReward {
  id: string; name: string; description: string | null; cost_points: number; cost_ore: number;
  category: string; image_url: string | null; active: boolean; sort_order: number;
  stock: number | null; is_digital: boolean;
}

const BASE_POINTS_PER_TREE = 1;
function recommendedMinPoints(costOre: number, budgetOre: number): number {
  if (!costOre || !budgetOre) return 0;
  return Math.ceil((costOre * (2 * BASE_POINTS_PER_TREE)) / budgetOre);
}

function PriceGuard({ costOre, costPoints, budgetOre, compact = false }: { costOre: number; costPoints: number; budgetOre: number; compact?: boolean }) {
  const min = recommendedMinPoints(costOre, budgetOre);
  if (!costOre) return null;
  if (!budgetOre) return (
    <div className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
      Sätt en <strong>belöningsbudget</strong> under Core för att se rekommenderat minimipris.
    </div>
  );
  const under = costPoints < min;
  return (
    <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${compact ? "" : ""}`}
      style={{
        background: under ? "#FFF1E8" : "var(--mint-paper)",
        color: under ? "#B45309" : "var(--forest)",
        border: under ? "1px solid #F59E0B" : "1px solid var(--border)",
      }}>
      Rekommenderat minimipris: <strong>{min} p</strong> ({(costOre/100).toLocaleString("sv-SE",{minimumFractionDigits:2,maximumFractionDigits:2})} kr inköp)
      {under && <div className="mt-0.5">⚠ Priset ligger under rekommendation — subventionerar utöver budgeten.</div>}
    </div>
  );
}


function RewardsCatalogTab() {
  const listFn = useServerFn(adminListRewards);
  const createFn = useServerFn(adminCreateReward);
  const updateFn = useServerFn(adminUpdateReward);
  const deleteFn = useServerFn(adminDeleteReward);
  const loadBudget = useServerFn(getRewardBudget);

  const [rewards, setRewards] = useState<CatalogReward[]>([]);
  const [budgetOre, setBudgetOre] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CatalogReward | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState<CatalogReward>({ id: "", name: "", description: "", cost_points: 10, cost_ore: 0, category: "Småpriser", image_url: null, active: true, sort_order: 100, stock: null, is_digital: false });

  const reload = async () => {
    const r = await listFn({ data: {} });
    setRewards(r.rewards as CatalogReward[]);
    try { const b = await loadBudget(); setBudgetOre(b.orePerTree); } catch { /* ignore */ }
  };
  useEffect(() => { (async () => { await reload(); setLoading(false); })(); /* eslint-disable-next-line */ }, []);

  if (loading) return <div className="surface-card mt-6 p-8 text-center" style={{ color: "var(--muted-foreground)" }}>Laddar…</div>;

  const grouped = rewards.reduce<Record<string, CatalogReward[]>>((acc, r) => {
    (acc[r.category] ||= []).push(r);
    return acc;
  }, {});
  const categories = [...REWARD_CATEGORY_ORDER.filter(c => grouped[c]), ...Object.keys(grouped).filter(c => !REWARD_CATEGORY_ORDER.includes(c as never))];

  const saveDraft = async () => {
    await createFn({ data: {
      name: draft.name.trim(),
      description: draft.description || null,
      costPoints: draft.cost_points,
      costOre: draft.cost_ore,
      category: draft.category.trim() || "Övrigt",
      imageUrl: draft.image_url,
      active: draft.active,
      sortOrder: draft.sort_order,
      stock: draft.stock,
      isDigital: draft.is_digital,
    }});
    setShowNew(false);
    setDraft({ id: "", name: "", description: "", cost_points: 10, cost_ore: 0, category: "Småpriser", image_url: null, active: true, sort_order: 100, stock: null, is_digital: false });
    await reload();
  };

  const saveEdit = async (r: CatalogReward) => {
    await updateFn({ data: {
      id: r.id,
      name: r.name.trim(),
      description: r.description || null,
      costPoints: r.cost_points,
      costOre: r.cost_ore,
      category: r.category.trim() || "Övrigt",
      imageUrl: r.image_url,
      active: r.active,
      sortOrder: r.sort_order,
      stock: r.stock,
      isDigital: r.is_digital,
    }});
    setEditing(null);
    await reload();
  };

  return (
    <section className="surface-card mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Belöningskatalog</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Global katalog — alla säljare ser samma belöningar. Admin kan fylla bildplatsen per produkt med kvadratisk PNG.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Ny belöning</button>
      </div>

      {showNew && (
        <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="input-field" placeholder="Namn" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            <select className="input-field" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>
              {REWARD_CATEGORY_ORDER.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input-field font-mono" type="number" min={0} placeholder="Kostnad i poäng"
              value={draft.cost_points} onChange={e => setDraft({ ...draft, cost_points: Math.max(0, Number(e.target.value) || 0) })} />
            <input className="input-field font-mono" type="number" placeholder="Sortering"
              value={draft.sort_order} onChange={e => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })} />
            <label className="text-xs sm:col-span-2" style={{ color: "var(--muted-foreground)" }}>
              Verklig inköpskostnad (öre)
              <input className="input-field font-mono mt-1" type="number" min={0}
                value={draft.cost_ore} onChange={e => setDraft({ ...draft, cost_ore: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <input className="input-field sm:col-span-2" placeholder="Bild-URL (valfri)"
              value={draft.image_url ?? ""} onChange={e => setDraft({ ...draft, image_url: e.target.value || null })} />
            <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Lager (tomt = obegränsat)
              <input className="input-field font-mono mt-1" type="number" min={0}
                value={draft.stock ?? ""}
                onChange={e => setDraft({ ...draft, stock: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
              <input type="checkbox" checked={draft.is_digital}
                onChange={e => setDraft({ ...draft, is_digital: e.target.checked })} />
              Digital belöning (levereras direkt)
            </label>
            <textarea className="input-field sm:col-span-2" rows={2} placeholder="Beskrivning (valfri)"
              value={draft.description ?? ""} onChange={e => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <PriceGuard costOre={draft.cost_ore} costPoints={draft.cost_points} budgetOre={budgetOre} />
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setShowNew(false)}>Avbryt</button>
            <button className="btn-primary" disabled={!draft.name.trim()} onClick={saveDraft}>Skapa</button>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {categories.map(cat => (
          <div key={cat}>
            <h3 className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>{cat}</h3>
            <div className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
              {grouped[cat].map(r => (
                <div key={r.id} className="py-3">
                  {editing?.id === r.id ? (
                    <div className="grid gap-3 lg:grid-cols-[80px_2fr_1fr_140px]">
                      <div className="admin-reward-thumb">
                        {editing.image_url ? <img src={editing.image_url} alt={editing.name} /> : <ImageIcon size={20} />}
                      </div>
                      <div className="grid gap-2">
                        <input className="input-field !py-1 !text-sm" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                        <input className="input-field !py-1 !text-sm" placeholder="Bild-URL"
                          value={editing.image_url ?? ""} onChange={e => setEditing({ ...editing, image_url: e.target.value || null })} />
                        <textarea className="input-field !py-1 !text-sm" rows={2}
                          value={editing.description ?? ""} onChange={e => setEditing({ ...editing, description: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <select className="input-field !py-1 !text-sm" value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })}>
                          {REWARD_CATEGORY_ORDER.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input className="input-field !py-1 !text-sm font-mono" type="number" min={0} placeholder="Poäng" value={editing.cost_points}
                          onChange={e => setEditing({ ...editing, cost_points: Math.max(0, Number(e.target.value) || 0) })} />
                        <input className="input-field !py-1 !text-sm font-mono" type="number" min={0} placeholder="Inköp öre" value={editing.cost_ore}
                          onChange={e => setEditing({ ...editing, cost_ore: Math.max(0, Number(e.target.value) || 0) })} />
                        <input className="input-field !py-1 !text-sm font-mono" type="number" placeholder="Sortering" value={editing.sort_order}
                          onChange={e => setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <PriceGuard costOre={editing.cost_ore} costPoints={editing.cost_points} budgetOre={budgetOre} compact />
                        <button className="btn-primary !py-1 !px-2 text-xs" onClick={() => saveEdit(editing)}>Spara</button>
                        <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setEditing(null)}>Avbryt</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="admin-reward-thumb shrink-0">
                          {r.image_url ? <img src={r.image_url} alt={r.name} /> : <ImageIcon size={20} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{r.name}</span>
                            <span className="chip !py-0.5 !text-[10px] font-mono" style={{ background: "var(--mint)", color: "var(--forest)" }}>{r.cost_points} p</span>
                            {!r.active && <span className="chip !py-0.5 !text-[10px]" style={{ background: "var(--muted)" }}>inaktiv</span>}
                          </div>
                          {r.description && <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{r.description}</div>}
                          <div className="mt-1 text-[11px] font-mono" style={{ color: "var(--muted-foreground)" }}>
                            {r.image_url ? "Bild kopplad" : "Platshållare visas tills bild laddas upp"}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setEditing(r)}>Redigera</button>
                        <button className="btn-secondary !py-1 !px-2 text-xs" onClick={async () => {
                          await updateFn({ data: { id: r.id, name: r.name, description: r.description, costPoints: r.cost_points, category: r.category, imageUrl: r.image_url, active: !r.active, sortOrder: r.sort_order } });
                          await reload();
                        }}>{r.active ? "Inaktivera" : "Aktivera"}</button>
                        <button className="btn-secondary !py-1 !px-2 text-xs" onClick={async () => {
                          if (!confirm(`Ta bort belöningen \"${r.name}\"?`)) return;
                          try {
                            await deleteFn({ data: { id: r.id } });
                            await reload();
                          } catch (e) {
                            alert((e as Error).message);
                          }
                        }}>Ta bort</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {rewards.length === 0 && <p className="py-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Inga belöningar än.</p>}
      </div>
    </section>
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

function PasswordActions({ userId, email }: { userId: string; email: string }) {
  const setPw = useServerFn(adminSetPassword);
  const sendReset = useServerFn(adminSendPasswordReset);
  const [open, setOpen] = useState(false);
  const [pw, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const doSet = async () => {
    if (pw.length < 8) { setMsg("Minst 8 tecken."); return; }
    setBusy(true); setMsg(null); setLink(null);
    try {
      await setPw({ data: { targetUserId: userId, newPassword: pw } });
      setMsg("Nytt lösenord sparat.");
      setPw2("");
      setOpen(false);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };

  const doReset = async () => {
    setBusy(true); setMsg(null); setLink(null);
    try {
      const res = await sendReset({ data: { email, redirectTo: `${window.location.origin}/reset-password` } });
      setMsg("Återställningsmail begärt.");
      if (res?.actionLink) setLink(res.actionLink);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-2">
        <button type="button" className="btn-secondary !py-1 !px-2 text-xs" disabled={busy} onClick={() => setOpen(v => !v)}>
          Sätt nytt
        </button>
        <button type="button" className="btn-secondary !py-1 !px-2 text-xs" disabled={busy} onClick={doReset}>
          Skicka mail
        </button>
      </div>
      {open && (
        <div className="mt-1 flex gap-1">
          <input
            className="input-field !py-1 !text-xs !w-36"
            type="text"
            placeholder="Nytt lösenord"
            value={pw}
            onChange={(e) => setPw2(e.target.value)}
          />
          <button type="button" className="btn-primary !py-1 !px-2 text-xs" disabled={busy} onClick={doSet}>
            Spara
          </button>
        </div>
      )}
      {msg && <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{msg}</div>}
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="text-xs underline break-all" style={{ color: "var(--primary)" }}>
          Öppna återställningslänk
        </a>
      )}
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

interface PointEvent {
  id: string; name: string; start_at: string; end_at: string; multiplier: number; active: boolean;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function BoostersTab() {
  const listFn = useServerFn(adminListEvents);
  const createFn = useServerFn(adminCreateEvent);
  const toggleFn = useServerFn(adminToggleEvent);
  const deleteFn = useServerFn(adminDeleteEvent);

  const [events, setEvents] = useState<PointEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const now = new Date();
  const later = new Date(now.getTime() + 24 * 3600 * 1000);
  const [draft, setDraft] = useState({
    name: "Dubbla poäng",
    startAt: toLocalInput(now.toISOString()),
    endAt: toLocalInput(later.toISOString()),
    multiplier: 2,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = async () => {
    const r = await listFn({ data: {} });
    setEvents(r.events as PointEvent[]);
  };
  useEffect(() => { (async () => { await reload(); setLoading(false); })(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await createFn({ data: {
        name: draft.name.trim(),
        startAt: new Date(draft.startAt).toISOString(),
        endAt: new Date(draft.endAt).toISOString(),
        multiplier: draft.multiplier,
      }});
      setShowNew(false);
      await reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const status = (e: PointEvent): { label: string; bg: string; color: string } => {
    const nowMs = Date.now();
    const s = new Date(e.start_at).getTime();
    const en = new Date(e.end_at).getTime();
    if (!e.active) return { label: "Inaktiverat", bg: "var(--muted)", color: "var(--muted-foreground)" };
    if (nowMs < s) return { label: "Planerat", bg: "var(--mint)", color: "var(--forest)" };
    if (nowMs >= en) return { label: "Avslutat", bg: "var(--muted)", color: "var(--muted-foreground)" };
    return { label: "Pågår nu", bg: "var(--forest)", color: "#fff" };
  };

  if (loading) return <div className="surface-card mt-6 p-8 text-center" style={{ color: "var(--muted-foreground)" }}>Laddar…</div>;

  return (
    <section className="surface-card mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Dubbelpoäng-event</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Slå på en period då varje sålt träd ger flera poäng. Träd och planta påverkas inte — bara poäng.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nytt event</button>
      </div>

      {showNew && (
        <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <div className="mb-1 font-medium">Namn</div>
              <input className="input-field w-full" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="text-sm">
              <div className="mb-1 font-medium">Multiplikator</div>
              <input className="input-field w-full font-mono" type="number" min={2} max={10}
                value={draft.multiplier}
                onChange={e => setDraft({ ...draft, multiplier: Math.max(2, Math.min(10, Number(e.target.value) || 2)) })} />
            </label>
            <label className="text-sm">
              <div className="mb-1 font-medium">Starttid</div>
              <input className="input-field w-full" type="datetime-local"
                value={draft.startAt} onChange={e => setDraft({ ...draft, startAt: e.target.value })} />
            </label>
            <label className="text-sm">
              <div className="mb-1 font-medium">Sluttid</div>
              <input className="input-field w-full" type="datetime-local"
                value={draft.endAt} onChange={e => setDraft({ ...draft, endAt: e.target.value })} />
            </label>
          </div>
          {err && <div className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>{err}</div>}
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setShowNew(false)}>Avbryt</button>
            <button className="btn-primary" disabled={busy || !draft.name.trim()} onClick={save}>
              {busy ? "Sparar…" : "Skapa"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
            <tr>
              <th className="py-2">Namn</th><th>Multiplikator</th><th>Start</th><th>Slut</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {events.map(e => {
              const st = status(e);
              return (
                <tr key={e.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-3 font-medium">{e.name}</td>
                  <td className="font-mono">{e.multiplier}×</td>
                  <td className="font-mono text-xs">{new Date(e.start_at).toLocaleString("sv-SE")}</td>
                  <td className="font-mono text-xs">{new Date(e.end_at).toLocaleString("sv-SE")}</td>
                  <td>
                    <span className="chip !py-0.5 !text-[10px]" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary !py-1 !px-2 text-xs" onClick={async () => {
                        await toggleFn({ data: { id: e.id, active: !e.active } });
                        await reload();
                      }}>{e.active ? "Inaktivera" : "Aktivera"}</button>
                      <button className="btn-secondary !py-1 !px-2 text-xs" onClick={async () => {
                        if (!confirm(`Ta bort eventet "${e.name}"?`)) return;
                        await deleteFn({ data: { id: e.id } });
                        await reload();
                      }}>Ta bort</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center" style={{ color: "var(--muted-foreground)" }}>
                Inga event ännu. Skapa ett för att dubbla poängen under en period.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
