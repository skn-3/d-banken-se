import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Package, CheckCircle2 } from "lucide-react";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { useAuth } from "@/hooks/use-auth";
import { leaderListDeliverables, leaderMarkDelivered } from "@/lib/rewards.functions";

export const Route = createFileRoute("/priser")({
  head: () => ({ meta: [
    { title: "Priser att dela ut — Smaarty" },
    { name: "description", content: "Ledarens vy för utdelning av inlösta priser." },
  ] }),
  component: LeaderRewardsPage,
});

interface Row {
  id: string; status: "shipped" | "delivered"; cost_points: number;
  requested_at: string; shipped_at: string | null; delivered_at: string | null;
  reward_name: string; reward_image: string | null;
  seller_user_id: string; seller_first: string; seller_full: string; seller_avatar: string | null;
}

interface Ctx { isLeader: boolean; teamId?: string; teamName?: string; orders?: Row[] }

function LeaderRewardsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(leaderListDeliverables);
  const deliverFn = useServerFn(leaderMarkDelivered);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = async () => {
    const r = (await listFn({ data: {} })) as unknown as Ctx;
    setCtx(r);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    (async () => { await reload(); setLoading(false); })();
    // eslint-disable-next-line
  }, [user, authLoading]);

  const runDeliver = async (row: Row) => {
    setBusy(row.id);
    try {
      await deliverFn({ data: { orderId: row.id } });
      setMsg(`Utdelat till ${row.seller_first}. En push har skickats.`);
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
      setTimeout(() => setMsg(null), 3500);
    }
  };

  const shipped = (ctx?.orders ?? []).filter(o => o.status === "shipped");
  const delivered = (ctx?.orders ?? []).filter(o => o.status === "delivered").slice(0, 30);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className="relative z-10 mx-auto w-full max-w-4xl px-6 pb-24 pt-4">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--forest)" }}>Priser att dela ut</h1>
            <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {ctx?.teamName ? `${ctx.teamName} — kvittera när barnet fått sitt pris.` : "Kvittera när barnet fått sitt pris."}
            </div>
          </div>
          <Link to="/saljare" search={{}} className="btn-secondary !px-3 !py-2 text-sm">← Hem</Link>
        </header>

        {loading ? (
          <div className="surface-card p-10 text-center" style={{ color: "var(--muted-foreground)" }}>Laddar…</div>
        ) : !ctx?.isLeader ? (
          <div className="surface-card p-10 text-center">
            <h2 className="font-display text-xl">Endast för lagledare</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Denna sida är för dig som leder ett lag.</p>
          </div>
        ) : (
          <>
            {msg && (
              <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--mint-paper)", color: "var(--forest)" }}>{msg}</div>
            )}

            <section className="surface-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <Package size={18} style={{ color: "var(--forest)" }} />
                <h2 className="font-display text-xl font-semibold">Att dela ut ({shipped.length})</h2>
              </div>
              {shipped.length === 0 ? (
                <div className="rounded-xl border p-6 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  Inget att dela ut just nu. När vi skickar en sändning ser du den här.
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {shipped.map(o => (
                    <div key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white shadow-sm" style={{ border: "1px solid var(--border)" }}>
                        {o.reward_image ? <img src={o.reward_image} alt="" className="h-full w-full rounded-xl object-cover" /> : <span className="text-2xl">🎁</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{o.seller_first} <span style={{ color: "var(--muted-foreground)" }}>— {o.reward_name}</span></div>
                        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          Skickad {o.shipped_at ? new Date(o.shipped_at).toLocaleDateString("sv-SE") : "—"}
                        </div>
                      </div>
                      <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy === o.id} onClick={() => runDeliver(o)}>
                        {busy === o.id ? "…" : "Utdelat"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {delivered.length > 0 && (
              <section className="surface-card mt-6 p-6">
                <div className="mb-4 flex items-center gap-2">
                  <CheckCircle2 size={18} style={{ color: "var(--forest)" }} />
                  <h2 className="font-display text-lg font-semibold">Senast utdelade</h2>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {delivered.map(o => (
                    <div key={o.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="chip !py-0.5 !text-[10px]" style={{ background: "var(--forest)", color: "#fff" }}>Utdelad ✓</span>
                      <span className="min-w-0 flex-1 truncate">{o.seller_first} — {o.reward_name}</span>
                      <span className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {o.delivered_at ? new Date(o.delivered_at).toLocaleDateString("sv-SE") : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
