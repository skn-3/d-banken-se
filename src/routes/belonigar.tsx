import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { useAuth } from "@/hooks/use-auth";
import { getSellerRewards, claimSellerReward } from "@/lib/rewards.functions";

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
  threshold_trees: number;
  category: string | null;
  image_url: string | null;
  unlocked: boolean;
  claim: { id: string; status: string; requested_at: string; fulfilled_at: string | null } | null;
};

type Ctx = {
  isSeller: boolean;
  isPreview?: boolean;
  previewName?: string | null;
  treeCount?: number;
  rewards?: RewardRow[];
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
  const claimFn = useServerFn(claimSellerReward);

  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reload = async () => setCtx((await ctxFn({ data: { targetUserId: previewAs } })) as Ctx);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = (await ctxFn({ data: { targetUserId: previewAs } })) as Ctx;
        if (!cancelled) setCtx(r);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, navigate, ctxFn, previewAs]);

  const handleClaim = async (r: RewardRow) => {
    if (ctx?.isPreview) return;
    setBusyId(r.id);
    try {
      await claimFn({ data: { rewardId: r.id } });
      setConfetti(true);
      setToast(`🎉 Du har löst in ${r.name}! Din lärare ger dig den.`);
      setTimeout(() => setConfetti(false), 2200);
      setTimeout(() => setToast(null), 4000);
      await reload();
    } catch (e) {
      setToast((e as Error).message);
      setTimeout(() => setToast(null), 4000);
    } finally { setBusyId(null); }
  };

  const rewards = (ctx?.rewards ?? []).slice().sort((a, b) => {
    // unlocked first, then closest to unlock
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    return a.threshold_trees - b.threshold_trees;
  });
  const total = ctx?.treeCount ?? 0;

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

        <header className="mb-6 flex items-center justify-between">
          <div>
            <div className="font-display text-3xl font-semibold" style={{ color: "var(--forest)" }}>Belöningar</div>
            <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Du har sålt <span className="font-mono font-semibold" style={{ color: "var(--forest)" }}>{total}</span> träd.
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
        ) : rewards.length === 0 ? (
          <div className="surface-card p-10 text-center">
            <div className="text-4xl">🎁</div>
            <h2 className="mt-3 font-display text-xl">Inga belöningar än</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Din lärare har inte lagt upp några belöningar ännu.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {rewards.map(r => (
              <RewardCard key={r.id} reward={r} total={total} busy={busyId === r.id}
                readOnly={!!ctx.isPreview} onClaim={() => handleClaim(r)} />
            ))}
          </div>
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

function RewardCard({ reward, total, busy, readOnly, onClaim }: {
  reward: RewardRow; total: number; busy: boolean; readOnly: boolean; onClaim: () => void;
}) {
  const pct = Math.min(100, (total / Math.max(1, reward.threshold_trees)) * 100);
  const remaining = Math.max(0, reward.threshold_trees - total);
  const claimed = !!reward.claim;
  const status = reward.claim?.status;

  return (
    <article className="surface-card overflow-hidden p-5"
      style={{ background: reward.unlocked ? "var(--gradient-mint)" : "var(--card)" }}>
      <div className="flex gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl"
          style={{ background: reward.unlocked ? "rgba(255,255,255,.7)" : "var(--mint-paper)",
                   filter: reward.unlocked ? "none" : "grayscale(.5)", opacity: reward.unlocked ? 1 : .75 }}>
          {reward.image_url
            ? <img src={reward.image_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
            : <span>🎁</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>{reward.name}</h3>
            {reward.category && <span className="chip !py-0.5 !text-[10px]">{reward.category}</span>}
            {reward.unlocked && !claimed && (
              <span className="chip !py-0.5 !text-[10px]" style={{ background: "var(--primary)", color: "#fff" }}>Upplåst ✨</span>
            )}
            {claimed && (
              <span className="chip !py-0.5 !text-[10px]" style={{ background: status === "uppfylld" ? "var(--forest)" : "var(--apricot, #fbe3c0)", color: status === "uppfylld" ? "#fff" : "var(--forest)" }}>
                {status === "uppfylld" ? "Uppfylld ✓" : "Inlöst — väntar"}
              </span>
            )}
          </div>
          {reward.description && (
            <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{reward.description}</p>
          )}

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--mint)" }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: reward.unlocked ? "var(--primary)" : "var(--forest)" }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
            <span>{Math.min(total, reward.threshold_trees)} / {reward.threshold_trees} träd</span>
            {!reward.unlocked && <span>{remaining} kvar</span>}
          </div>

          {reward.unlocked && !claimed && (
            <button
              onClick={onClaim}
              disabled={busy || readOnly}
              className="btn-primary mt-4 w-full sm:w-auto"
              title={readOnly ? "Förhandsvisning — inlösning avstängd" : undefined}
            >
              {busy ? "Löser in…" : "🎉 Lös in belöningen"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
