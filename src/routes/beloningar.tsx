import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Gift, Image as ImageIcon, Sparkles, Target } from "lucide-react";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { useAuth } from "@/hooks/use-auth";
import { getSellerRewards, purchaseSellerReward } from "@/lib/rewards.functions";
import { getActiveEvent, type ActiveEvent } from "@/lib/events.functions";
import { EventBanner } from "@/components/event-banner";
import { rewardEmoji, getRewardGoal, setRewardGoal, type RewardGoal } from "@/lib/reward-emoji";
import { REWARD_CATEGORY_EMOJI, REWARD_CATEGORY_ORDER } from "@/lib/reward-catalog";

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
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: "-20px",
              width: size,
              height: size,
              background: color,
              borderRadius: 2,
              transform: `rotate(${rot}deg)`,
              animation: `smaarty-confetti ${dur}s cubic-bezier(.2,.7,.4,1) ${delay}s forwards`,
            }}
          />
        );
      })}
      <style>{`@keyframes smaarty-confetti { to { transform: translateY(110vh) rotate(720deg); opacity: 0.3; } }`}</style>
    </div>
  );
}

function RewardArtwork({ reward, canAfford }: { reward: RewardRow; canAfford: boolean }) {
  const fallback = rewardEmoji(reward.name, reward.category);

  return (
    <div className="reward-art-frame">
      <div className={`reward-art-glow ${canAfford ? "is-afford" : ""}`} aria-hidden />
      <div className="reward-art-shell">
        {reward.image_url ? (
          <img
            src={reward.image_url}
            alt={reward.name}
            className="reward-art-image"
            loading="lazy"
          />
        ) : (
          <div className="reward-art-placeholder">
            <div className="reward-art-placeholder-icon" aria-hidden>
              <ImageIcon size={22} />
            </div>
            <div className="reward-art-placeholder-emoji" aria-hidden>{fallback}</div>
            <div className="reward-art-placeholder-text">Bild kommer snart</div>
          </div>
        )}
      </div>
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
  const [goal, setGoalState] = useState<RewardGoal | null>(null);

  const goalUid = previewAs ?? user?.id ?? null;

  useEffect(() => {
    setGoalState(getRewardGoal(goalUid));
  }, [goalUid]);

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
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, navigate, ctxFn, eventFn, previewAs]);

  const handleBuy = async (r: RewardRow) => {
    setBusyId(r.id);
    try {
      await buyFn({ data: { rewardId: r.id, targetUserId: previewAs } });
      setConfetti(true);
      setToast(`Klart — du löste in ${r.name}. Din lärare ordnar resten.`);
      setTimeout(() => setConfetti(false), 2200);
      setTimeout(() => setToast(null), 4500);
      await reload();
    } catch (e) {
      setToast((e as Error).message);
      setTimeout(() => setToast(null), 4500);
    } finally {
      setBusyId(null);
    }
  };

  const toggleGoal = (r: RewardRow) => {
    if (!goalUid) return;
    if (goal?.rewardId === r.id) {
      setRewardGoal(goalUid, null);
      setGoalState(null);
    } else {
      const next: RewardGoal = { rewardId: r.id, name: r.name, cost: r.cost_points, emoji: rewardEmoji(r.name, r.category) };
      setRewardGoal(goalUid, next);
      setGoalState(next);
    }
  };

  const balance = ctx?.balance ?? 0;
  const rewards = ctx?.rewards ?? [];
  const orders = ctx?.orders ?? [];
  const rewardById = useMemo(() => new Map(rewards.map(r => [r.id, r])), [rewards]);

  const grouped = useMemo(() => {
    const acc: Record<string, RewardRow[]> = {};
    for (const r of rewards) (acc[r.category] ||= []).push(r);
    for (const k of Object.keys(acc)) acc[k].sort((a, b) => a.cost_points - b.cost_points || a.sort_order - b.sort_order);
    return acc;
  }, [rewards]);

  const categories = [
    ...REWARD_CATEGORY_ORDER.filter(c => grouped[c]?.length),
    ...Object.keys(grouped).filter(c => !REWARD_CATEGORY_ORDER.includes(c as never)),
  ];

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <Confetti show={confetti} />
      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24 pt-4">
        {ctx?.isPreview && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 shadow-sm"
            style={{ borderColor: "var(--primary)", background: "rgba(30,158,106,0.08)" }}>
            <div className="text-sm">
              <span className="font-display font-semibold" style={{ color: "var(--forest)" }}>👁 Förhandsvisning:</span>{" "}
              <span style={{ color: "var(--forest)" }}>{ctx.previewName ?? "Säljare"}</span>
              <span className="ml-2 text-xs" style={{ color: "var(--muted-foreground)" }}>(read-only)</span>
            </div>
            <button className="btn-secondary !px-3 !py-1 text-xs" onClick={() => navigate({ to: "/admin" })}>← Tillbaka till admin</button>
          </div>
        )}

        <EventBanner event={activeEvent} />

        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--forest)" }}>Belöningar</h1>
            <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Lös in dina poäng mot belöningar. Det påverkar inte plantan eller topplistan.
            </div>
          </div>
          <Link to="/saljare" search={previewAs ? { as: previewAs } : { as: undefined }} className="btn-secondary !px-3 !py-2 text-sm whitespace-nowrap">← Hem</Link>
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
            <GoalCard
              goal={goal}
              balance={balance}
              onRedeem={() => {
                if (!goal) return;
                const r = rewardById.get(goal.rewardId);
                if (r) handleBuy(r);
              }}
              onClear={() => {
                if (goalUid) {
                  setRewardGoal(goalUid, null);
                  setGoalState(null);
                }
              }}
              busy={!!goal && busyId === goal.rewardId}
            />

            <section className="surface-card belon mb-8 p-6 text-center" style={{ background: "var(--gradient-mint)" }}>
              <div className="text-xs uppercase tracking-wider" style={{ color: "var(--forest)" }}>Ditt saldo</div>
              <div className="mt-2 font-mono text-5xl font-semibold" style={{ color: "var(--forest)" }}>{balance}</div>
              <div className="mt-1 text-sm" style={{ color: "var(--forest)" }}>poäng att handla för</div>
            </section>

            {rewards.length === 0 ? (
              <div className="surface-card p-10 text-center">
                <div className="text-4xl">🎁</div>
                <h2 className="mt-3 font-display text-xl">Inga belöningar ännu</h2>
              </div>
            ) : (
              <div className="space-y-10">
                {categories.map(cat => (
                  <section key={cat}>
                    <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold" style={{ color: "var(--forest)" }}>
                      <span>{REWARD_CATEGORY_EMOJI[cat] ?? "🎁"}</span> {cat}
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {grouped[cat].map(r => (
                        <RewardCard
                          key={r.id}
                          reward={r}
                          balance={balance}
                          busy={busyId === r.id}
                          readOnly={false}
                          onBuy={() => handleBuy(r)}
                          isGoal={goal?.rewardId === r.id}
                          onToggleGoal={() => toggleGoal(r)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {orders.length > 0 && (
              <section className="surface-card mt-8 p-6">
                <h2 className="font-display text-xl font-semibold">Dina inlösen</h2>
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
                          style={{ background: o.status === "uppfylld" ? "var(--forest)" : "var(--apricot)", color: o.status === "uppfylld" ? "#fff" : "var(--forest)" }}>
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

function RewardCard({ reward, balance, busy, readOnly, onBuy, isGoal, onToggleGoal }: {
  reward: RewardRow;
  balance: number;
  busy: boolean;
  readOnly: boolean;
  onBuy: () => void;
  isGoal?: boolean;
  onToggleGoal?: () => void;
}) {
  const canAfford = balance >= reward.cost_points;
  const missing = Math.max(0, reward.cost_points - balance);
  const pct = Math.max(0, Math.min(100, (balance / Math.max(1, reward.cost_points)) * 100));
  const [open, setOpen] = useState(false);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <article
      className={`surface-card rw reward-card cursor-pointer p-4 ${canAfford ? "afford" : ""} ${open ? "open" : ""}`}
      onClick={() => setOpen(o => !o)}
      style={{
        background: canAfford ? "var(--card)" : "linear-gradient(180deg, var(--card) 0%, var(--mint-paper) 100%)",
        opacity: canAfford ? 1 : 0.96,
        outline: isGoal ? "2px solid var(--primary)" : undefined,
        ["--pct" as string]: `${pct}%`,
      } as React.CSSProperties}
    >
      <RewardArtwork reward={reward} canAfford={canAfford} />

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>{reward.name}</div>
          <div className="mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-mono"
            style={{ background: "var(--mint-paper)", color: "var(--forest)" }}>
            <Sparkles size={12} /> {reward.cost_points} p
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {onToggleGoal && (
          <button
            type="button"
            onClick={(e) => { stop(e); onToggleGoal(); }}
            disabled={readOnly}
            className="btn-secondary !px-3 !py-1.5 text-xs whitespace-nowrap"
            style={{
              background: isGoal ? "var(--primary)" : undefined,
              color: isGoal ? "#fff" : undefined,
              borderColor: isGoal ? "var(--primary)" : undefined,
              opacity: readOnly ? 0.6 : 1,
            }}
          >
            {isGoal ? "Ditt mål ✓" : "Sätt som mål"}
          </button>
        )}
        <button
          onClick={(e) => { stop(e); onBuy(); }}
          disabled={!canAfford || busy || readOnly}
          className={canAfford ? "btn-primary !px-3 !py-1.5 text-xs whitespace-nowrap" : "btn-secondary !px-3 !py-1.5 text-xs whitespace-nowrap"}
          title={readOnly ? "Förhandsvisning — inlösen avstängd" : !canAfford ? `Saknar ${missing} poäng` : undefined}
          style={!canAfford ? { cursor: "not-allowed", opacity: 0.7 } : undefined}
        >
          {busy ? "Löser in…" : canAfford ? `Lös in för ${reward.cost_points} p` : `Saknar ${missing} p`}
        </button>
      </div>

      <div className="detail">
        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          {reward.description && (
            <div className="mb-3 text-sm" style={{ color: "var(--muted-foreground)" }}>{reward.description}</div>
          )}
          <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(11,61,46,0.08)" }}>
            <div className="pfill h-full rounded-full"
              style={{ background: canAfford ? "linear-gradient(90deg,#1e9e6a,#3fc78b)" : "linear-gradient(90deg,#ffcf78,#1e9e6a)" }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-mono" style={{ color: "var(--forest)" }}>
            <span>{balance} / {reward.cost_points} poäng</span>
            <span style={{ color: canAfford ? "var(--primary)" : "var(--muted-foreground)" }}>
              {canAfford ? "Du har råd! 🎉" : `${missing} poäng kvar`}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function GoalCard({ goal, balance, onRedeem, onClear, busy }: {
  goal: RewardGoal | null;
  balance: number;
  onRedeem: () => void;
  onClear: () => void;
  busy: boolean;
}) {
  if (!goal) {
    return (
      <section className="surface-card mb-6 p-5 text-center"
        style={{ background: "var(--mint-paper)", border: "1px dashed var(--primary)" }}>
        <div className="text-2xl">🎯</div>
        <div className="mt-1 font-display text-base font-semibold" style={{ color: "var(--forest)" }}>
          Välj en belöning att spara mot
        </div>
        <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
          Tryck "Sätt som mål" på en belöning så ser du hur nära du är.
        </div>
      </section>
    );
  }

  const pct = Math.max(0, Math.min(100, (balance / Math.max(1, goal.cost)) * 100));
  const remaining = Math.max(0, goal.cost - balance);
  const ready = balance >= goal.cost;

  return (
    <section className="surface-card mb-6 overflow-hidden p-5"
      style={{
        background: "linear-gradient(135deg, var(--mint-paper) 0%, #fbe3c0 100%)",
        borderTop: "3px solid #d4af37",
      }}>
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/70 text-4xl shadow-sm">
          <span aria-hidden>{goal.emoji}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>🎯 Ditt mål</div>
          <div className="truncate font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>{goal.name}</div>
          <div className="font-mono text-xs" style={{ color: "var(--forest)" }}>{balance} / {goal.cost} poäng</div>
        </div>
        <button onClick={onClear} className="text-xs underline" style={{ color: "var(--muted-foreground)" }}>Ta bort</button>
      </div>
      <div className="mt-4 h-4 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.7)" }}>
        <div className="goal-bar h-full rounded-full"
          style={{ width: `${pct}%`, background: ready ? "linear-gradient(90deg,#1e9e6a,#3fc78b)" : "linear-gradient(90deg,#ffcf78,#1e9e6a)" }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm" style={{ color: "var(--forest)" }}>
          {ready ? "Klar att lösa in! 🎉" : `${remaining} poäng kvar`}
        </div>
        {ready && (
          <button onClick={onRedeem} disabled={busy} className="btn-primary !px-4 !py-1.5 text-sm">
            {busy ? "Löser in…" : "Lös in nu"}
          </button>
        )}
      </div>
      <style>{`
        .goal-bar { transition: width 900ms cubic-bezier(.2,.9,.3,1.2); }
        @media (prefers-reduced-motion: reduce) { .goal-bar { transition: none; } }
      `}</style>
    </section>
  );
}
