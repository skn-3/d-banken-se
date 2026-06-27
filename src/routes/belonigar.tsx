import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { useAuth } from "@/hooks/use-auth";
import { getSellerRewards, purchaseSellerReward } from "@/lib/rewards.functions";
import { getActiveEvent, type ActiveEvent } from "@/lib/events.functions";
import { EventBanner } from "@/components/event-banner";

export const Route = createFileRoute("/belonigar")({
  head: () => ({ meta: [{ title: "Belöningar — Smaarty" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    as: typeof s.as === "string" && s.as.length > 0 ? (s.as as string) : undefined,
  }),
  component: RewardsPage,
});

type RewardRow = {
  id: string;
  name: string;
  description: string | null;
  cost_points: number;
  category: string;
  image_url: string | null;
  sort_order: number;
};

type OrderRow = {
  id: string;
  reward_id: string;
  cost_points: number;
  status: string;
  requested_at: string;
  fulfilled_at: string | null;
};

type Ctx = {
  isSeller: boolean;
  isPreview?: boolean;
  previewName?: string | null;
  balance?: number;
  rewards?: RewardRow[];
  orders?: OrderRow[];
};

const CATEGORY_ORDER = ["Småpriser", "Mellanpriser", "Storpriser", "Drömpriser"];
const CATEGORY_EMOJI: Record<string, string> = {
  Småpriser: "🍬", Mellanpriser: "🎬", Storpriser: "🎧", Drömpriser: "✨",
};

function Confetti({ show }: { show: boolean }) {
  if (!show) return null;
  const pieces = Array.from({ length: 28 });
  const colors = ["#1e9e6a", "#9fd9b6", "#fbe3c0", "#3fc78b", "#ffcf78"];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const dur = 1.2 + Math.random() * 0.9;
        const size = 8 + Math.random() * 8;
        const color = colors[i % colors.length];
        const rot = Math.random() * 360;
        return (
          <span key={i}
            style={{
              position: "absolute", left: `${left}%`, top: "-20px",
              width: size, height: size, background: color, borderRadius: 2,
              transform: `rotate(${rot}deg)`,
              animation: `smaarty-confetti ${dur}s cubic-bezier(.2,.7,.4,1) ${delay}s forwards`,
            }} />
        );
      })}
      <style>{`@keyframes smaarty-confetti { to { transform: translateY(110vh) rotate(720deg); opacity: 0.3; } }`}</style>
    </div>
  );
}

function RewardsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { as: previewAs } = Route.useSearch();
  const ctxFn = useServerFn(getSellerRewards);
  const buyFn = useServerFn(purchaseSellerReward);
  const eventFn = useServerFn(getActiveEvent);

  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent>(null);

  const reload = async () => {
    setCtx((await ctxFn({ data: { targetUserId: previewAs } })) as Ctx);
    const ev = await eventFn({ data: {} });
    setActiveEvent(ev.event);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = (await ctxFn({ data: { targetUserId: previewAs } })) as Ctx;
        if (!cancelled) setCtx(r);
        const ev = await eventFn({ data: {} });
        if (!cancelled) setActiveEvent(ev.event);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, navigate, ctxFn, eventFn, previewAs]);

  const handleBuy = async (r: RewardRow) => {
    setBusyId(r.id);
    try {
      await buyFn({ data: { rewardId: r.id, targetUserId: previewAs } });
      setConfetti(true);
      setToast(`🎉 Du köpte ${r.name}! Din lärare ordnar den.`);
      setTimeout(() => setConfetti(false), 2200);
      setTimeout(() => setToast(null), 4500);
      await reload();
    } catch (e) {
      setToast((e as Error).message);
      setTimeout(() => setToast(null), 4500);
    } finally { setBusyId(null); }
  };

  const balance = ctx?.balance ?? 0;
  const rewards = ctx?.rewards ?? [];
  const orders = ctx?.orders ?? [];
  const rewardById = useMemo(() => new Map(rewards.map(r => [r.id, r])), [rewards]);

  const grouped = useMemo(() => {
    const acc: Record<string, RewardRow[]> = {};
    for (const r of rewards) (acc[r.category] ||= []).push(r);
    for (const k of Object.keys(acc)) acc[k].sort((a, b) => a.cost_points - b.cost_points);
    return acc;
  }, [rewards]);
  const categories = [...CATEGORY_ORDER.filter(c => grouped[c]?.length), ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c))];

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <Confetti show={confetti} />
      <main className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-24 pt-4">
        {ctx?.isPreview && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 shadow-sm"
            style={{ borderColor: "var(--primary)", background: "rgba(30,158,106,0.08)" }}>
            <div className="text-sm">
              <span className="font-display font-semibold" style={{ color: "var(--forest)" }}>👁 Förhandsvisning:</span>{" "}
              <span style={{ color: "var(--forest)" }}>{ctx.previewName ?? "Säljare"}</span>
              <span className="ml-2 text-xs" style={{ color: "var(--muted-foreground)" }}>(read-only)</span>
            </div>
            <button className="btn-secondary !py-1 !px-3 text-xs" onClick={() => navigate({ to: "/admin" })}>← Tillbaka till admin</button>
          </div>
        )}

        <EventBanner event={activeEvent} />

        <header className="mb-6 flex items-center justify-between">
          <div>
            <div className="font-display text-3xl font-semibold" style={{ color: "var(--forest)" }}>Belöningar</div>
            <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Köp belöningar med dina poäng. Köp påverkar inte plantan eller topplistan.
            </div>
          </div>
          <Link to="/saljare" search={previewAs ? { as: previewAs } : { as: undefined }} className="btn-secondary !py-2 !px-3 text-sm">← Hem</Link>
        </header>

        {loading ? (
          <div className="surface-card p-10 text-center" style={{ color: "var(--muted-foreground)" }}>Laddar…</div>
        ) : !ctx?.isSeller ? (
          <div className="surface-card p-10 text-center">
            <h2 className="font-display text-xl">Ingen säljarprofil</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
              {ctx?.isPreview ? "Den valda användaren är inte kopplad till något team." : "Ditt konto är inte kopplat till något team."}
            </p>
          </div>
        ) : (
          <>
            {/* Saldo */}
            <section className="surface-card mb-6 p-6 text-center" style={{ background: "var(--gradient-mint)" }}>
              <div className="text-xs uppercase tracking-wider" style={{ color: "var(--forest)" }}>Ditt saldo</div>
              <div className="mt-2 font-mono text-5xl font-semibold" style={{ color: "var(--forest)" }}>{balance}</div>
              <div className="mt-1 text-sm" style={{ color: "var(--forest)" }}>poäng att handla för</div>
            </section>

            {/* Katalog */}
            {rewards.length === 0 ? (
              <div className="surface-card p-10 text-center">
                <div className="text-4xl">🎁</div>
                <h2 className="mt-3 font-display text-xl">Inga belöningar ännu</h2>
              </div>
            ) : (
              <div className="space-y-8">
                {categories.map(cat => (
                  <section key={cat}>
                    <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold" style={{ color: "var(--forest)" }}>
                      <span>{CATEGORY_EMOJI[cat] ?? "🎁"}</span> {cat}
                    </h2>
                    <div className="grid gap-3">
                      {grouped[cat].map(r => (
                        <RewardCard key={r.id} reward={r} balance={balance} busy={busyId === r.id}
                          readOnly={false} onBuy={() => handleBuy(r)} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* Egna beställningar */}
            {orders.length > 0 && (
              <section className="surface-card mt-8 p-6">
                <h2 className="font-display text-xl font-semibold">Dina köp</h2>
                <div className="mt-4 divide-y" style={{ borderColor: "var(--border)" }}>
                  {orders.map(o => {
                    const r = rewardById.get(o.reward_id);
                    return (
                      <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div>
                          <div className="font-medium">{r?.name ?? "Belöning"}</div>
                          <div className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                            {new Date(o.requested_at).toLocaleString("sv-SE")} · {o.cost_points} p
                          </div>
                        </div>
                        <span className="chip !py-0.5 !text-[10px]"
                          style={{ background: o.status === "uppfylld" ? "var(--forest)" : "var(--apricot, #fbe3c0)", color: o.status === "uppfylld" ? "#fff" : "var(--forest)" }}>
                          {o.status === "uppfylld" ? "Uppfylld ✓" : "Väntar på lärare"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {toast && (
          <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
            <div className="surface-card max-w-md px-5 py-3 text-center text-sm shadow-lg"
              style={{ background: "var(--card)", color: "var(--forest)", animation: "smaarty-pop 400ms cubic-bezier(.2,.9,.3,1.4)" }}>
              {toast}
            </div>
          </div>
        )}

        <style>{`@keyframes smaarty-pop { 0% { transform: scale(.85); opacity: 0; } 60% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }`}</style>
      </main>
    </div>
  );
}

function RewardCard({ reward, balance, busy, readOnly, onBuy }: {
  reward: RewardRow; balance: number; busy: boolean; readOnly: boolean; onBuy: () => void;
}) {
  const canAfford = balance >= reward.cost_points;
  const missing = Math.max(0, reward.cost_points - balance);

  return (
    <article className="surface-card flex items-center gap-4 p-4"
      style={{ background: canAfford ? "var(--card)" : "var(--mint-paper)", opacity: canAfford ? 1 : 0.85 }}>
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl"
        style={{ background: canAfford ? "var(--mint)" : "rgba(0,0,0,0.04)" }}>
        {reward.image_url
          ? <img src={reward.image_url} alt="" className="h-10 w-10 rounded-xl object-cover" />
          : <span>🎁</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium" style={{ color: "var(--forest)" }}>{reward.name}</div>
        {reward.description && <div className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{reward.description}</div>}
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="font-mono text-lg font-semibold" style={{ color: "var(--forest)" }}>{reward.cost_points} p</div>
        <button
          onClick={onBuy}
          disabled={!canAfford || busy || readOnly}
          className={canAfford ? "btn-primary !py-1 !px-3 text-xs" : "btn-secondary !py-1 !px-3 text-xs"}
          title={readOnly ? "Förhandsvisning — köp avstängt" : !canAfford ? `Saknar ${missing} poäng` : undefined}
          style={!canAfford ? { cursor: "not-allowed", opacity: 0.6 } : undefined}
        >
          {busy ? "Köper…" : canAfford ? `Köp för ${reward.cost_points} p` : `Saknar ${missing} p`}
        </button>
      </div>
    </article>
  );
}
