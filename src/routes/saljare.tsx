import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { useAuth } from "@/hooks/use-auth";
import { Certificate, snapshotToTemplate, type CertificateData } from "@/components/certificate";
import { downloadCertificateAsPdf } from "@/lib/download-certificate";
import { getSellerContext, sellerCreatePurchase } from "@/lib/seller.functions";
import { getActiveEvent, getSellerBonuses, type ActiveEvent, type SellerBonus } from "@/lib/events.functions";
import { getSellerRewards } from "@/lib/rewards.functions";
import { getRewardGoal, type RewardGoal } from "@/lib/reward-emoji";
import { EventBanner } from "@/components/event-banner";
import { Onboarding, hasSeenOnboarding, markOnboardingSeen } from "@/components/onboarding";
import { PlantingForm } from "@/components/planting-form";
import skottAsset from "@/assets/stages/skott.png.asset.json";
import plantaAsset from "@/assets/stages/planta.png.asset.json";
import ungtAsset from "@/assets/stages/ungt-trad.png.asset.json";
import stortAsset from "@/assets/stages/stort-trad.png.asset.json";
import fullvuxetAsset from "@/assets/stages/fullvuxet-trad.png.asset.json";
import forstaTradetAsset from "@/assets/badges/forsta-tradet.png.asset.json";
import gronTummeAsset from "@/assets/badges/gron-tumme.png.asset.json";
import skogshjalteAsset from "@/assets/badges/skogshjalte.png.asset.json";
import skogsmastareAsset from "@/assets/badges/skogsmastare.png.asset.json";
import veckansSaljareAsset from "@/assets/badges/veckans-saljare.png.asset.json";
import eldsjalAsset from "@/assets/badges/eldsjal.png.asset.json";
import { Smaarty } from "@/components/smaarty";

const WEEKEND_SPRINT_GOAL = 5;
const PRICE_PER_TREE_ORE = 3500;
const QUICK_PICKS = [5, 10, 25, 100];
const DAILY_GOAL = 3;

// Plantans tillväxt
const STAGES = [
  { key: "skott", name: "Skott", min: 0, image: skottAsset.url, smaarty: "skott" as const },
  { key: "planta", name: "Planta", min: 10, image: plantaAsset.url, smaarty: "planta" as const },
  { key: "ungt", name: "Ungt träd", min: 25, image: ungtAsset.url, smaarty: "ungt" as const },
  { key: "stort", name: "Stort träd", min: 50, image: stortAsset.url, smaarty: "stort" as const },
  { key: "fullvuxet", name: "Fullvuxet träd", min: 100, image: fullvuxetAsset.url, smaarty: "full" as const },
] as const;

const BADGE_DEFS = [
  { key: "forstaTradet", name: "Första trädet", desc: "Plantera ditt första träd", img: forstaTradetAsset.url, threshold: 1, kind: "total" as const },
  { key: "gronTumme", name: "Grön tumme", desc: "Plantera 10 träd", img: gronTummeAsset.url, threshold: 10, kind: "total" as const },
  { key: "skogshjalte", name: "Skogshjälte", desc: "Plantera 50 träd", img: skogshjalteAsset.url, threshold: 50, kind: "total" as const },
  { key: "skogsmastare", name: "Skogsmästare", desc: "Plantera 100 träd", img: skogsmastareAsset.url, threshold: 100, kind: "total" as const },
  { key: "veckansSaljare", name: "Veckans hjälte", desc: "Flest planterade träd i ditt lag denna vecka", img: veckansSaljareAsset.url, threshold: 1, kind: "special" as const },
  { key: "eldsjal", name: "Eldsjäl", desc: "Plantera flera dagar i rad (minst 3)", img: eldsjalAsset.url, threshold: 3, kind: "streak" as const },
  { key: "lagmarke", name: "Lagmärke", desc: "Laget når 100 planterade träd tillsammans", img: skogshjalteAsset.url, threshold: 100, kind: "team" as const },
] as const;


export const Route = createFileRoute("/saljare")({
  head: () => ({ meta: [{ title: "Smaarty — säljarvy" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    as: typeof s.as === "string" && s.as.length > 0 ? (s.as as string) : undefined,
  }),
  component: SellerPage,
});

type LbSeller = { userId: string; name: string; trees: number };
type LbTeam = { teamId: string; name: string; trees: number };
interface SellerCtx {
  isSeller: boolean;
  isPreview?: boolean;
  previewName?: string | null;
  previewUserId?: string;
  userId?: string;
  role?: string;
  team?: { id: string; name: string; weeklyGoal?: number; bonusPoints?: number };
  organization?: { id: string; name: string; type: string };
  treeCount?: number;
  weekTrees?: number;
  todayTrees?: number;
  weekendTrees?: number;
  isWeekendNow?: boolean;
  isoWeek?: string;
  teamWeekTrees?: number;
  streak?: number;
  teamTotal?: number;
  badges?: Record<string, boolean>;

  leaderboards?: {
    sellersWeek: LbSeller[];
    sellersTotal: LbSeller[];
    teamsWeek: LbTeam[];
    teamsTotal: LbTeam[];
  };
  purchases?: { id: string; tree_count: number; total_amount_ore: number; created_at: string; recipient_name: string | null; recipient_email: string | null }[];
}

function formatKr(ore: number) { return `${(ore / 100).toLocaleString("sv-SE")} kr`; }
function getStage(total: number) {
  let idx = 0;
  for (let i = 0; i < STAGES.length; i++) if (total >= STAGES[i].min) idx = i;
  const current = STAGES[idx];
  const next = STAGES[idx + 1] ?? null;
  return { current, next, idx };
}

function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const from = 0;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{n.toLocaleString("sv-SE")}</>;
}

function ProgressRing({ value, max, size = 240, stroke = 14, children }: { value: number; max: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max <= 0 ? 1 : Math.max(0, Math.min(1, value / max));
  const [dash, setDash] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDash(c * pct));
    return () => cancelAnimationFrame(id);
  }, [pct, c]);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--mint)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="var(--primary)" strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.9,.3,1.2)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function MedalIcon({ rank }: { rank: number }) {
  const colors = ["#F6B27A", "#C0C0C0", "#CD7F32"];
  const labels = ["1", "2", "3"];
  if (rank > 3) return <span className="font-mono text-sm" style={{ color: "var(--muted-foreground)" }}>#{rank}</span>;
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full font-display text-sm font-bold"
      style={{ background: colors[rank - 1], color: "#fff", boxShadow: "0 4px 12px -4px rgba(0,0,0,.25)" }}>
      {labels[rank - 1]}
    </span>
  );
}

function SellerPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { as: previewAs } = Route.useSearch();
  const ctxFn = useServerFn(getSellerContext);
  const purchaseFn = useServerFn(sellerCreatePurchase);
  const eventFn = useServerFn(getActiveEvent);
  const bonusesFn = useServerFn(getSellerBonuses);
  const rewardsFn = useServerFn(getSellerRewards);

  const [ctx, setCtx] = useState<SellerCtx | null>(null);
  const [rewardBalance, setRewardBalance] = useState<number>(0);
  const [rewardGoal, setRewardGoalState] = useState<RewardGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent>(null);
  const [celebration, setCelebration] = useState<{ title: string; subtitle: string; bonus: number } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [view, setView] = useState<"home" | "register" | "done">("home");
  const [lbScope, setLbScope] = useState<"week" | "total">("week");
  const [lbKind, setLbKind] = useState<"sellers" | "teams">("sellers");

  const [count, setCount] = useState(10);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<CertificateData | null>(null);
  const [resultEmail, setResultEmail] = useState("");
  const [emailSent, setEmailSent] = useState(true);
  const [plantingResult, setPlantingResult] = useState<{ trees: number; prevTotal: number; points: number } | null>(null);
  const certRef = useRef<HTMLDivElement>(null);


  const total = useMemo(() => count * PRICE_PER_TREE_ORE, [count]);

  const bonusStorageKey = (uid: string) => `smaarty:bonuses-seen:${uid}`;

  const describeBonus = (b: SellerBonus): { title: string; subtitle: string } => {
    const desc = b.description ?? "";
    if (b.type === "bonus_milestone") {
      const m = desc.match(/(\d+)/);
      return { title: `Du nådde ${m ? m[1] : ""} planterade träd`, subtitle: "Milstolpe-bonus" };
    }
    if (b.type === "bonus_sprint") {
      return { title: "Helg-sprint klarad", subtitle: `5 träd under helgen` };
    }
    if (b.type === "bonus_team") {
      return { title: "Laget nådde veckomålet", subtitle: "Alla i laget får bonus" };
    }
    if (b.type === "bonus_streak") {
      const m = desc.match(/(\d+)/);
      return { title: `${m ? m[1] : ""} dagar i rad`, subtitle: "Streak-bonus" };
    }
    return { title: "Bonus", subtitle: desc };
  };

  const detectNewBonus = async (uid: string) => {
    try {
      const r = await bonusesFn({ data: { targetUserId: previewAs } });
      const seenRaw = typeof window !== "undefined" ? window.localStorage.getItem(bonusStorageKey(uid)) : null;
      const seen: string[] = seenRaw ? JSON.parse(seenRaw) : [];
      const list = r.bonuses;
      const fresh = list.find((m) => !seen.includes(m.id));
      if (fresh) {
        const { title, subtitle } = describeBonus(fresh);
        setCelebration({ title, subtitle, bonus: fresh.delta });
        const next = Array.from(new Set([...seen, ...list.map((m) => m.id)])).slice(-50);
        window.localStorage.setItem(bonusStorageKey(uid), JSON.stringify(next));
        setTimeout(() => setCelebration(null), 6000);
      } else if (list.length && !seenRaw) {
        window.localStorage.setItem(bonusStorageKey(uid), JSON.stringify(list.map((m) => m.id)));
      }
    } catch {/* ignore */}
  };

  const reload = async () => {
    const r = (await ctxFn({ data: { targetUserId: previewAs } })) as SellerCtx;
    setCtx(r);
    const ev = await eventFn({ data: {} });
    setActiveEvent(ev.event);
    const uid = r.userId ?? r.previewUserId;
    if (uid) {
      await detectNewBonus(uid);
      setRewardGoalState(getRewardGoal(uid));
      try {
        const rw = await rewardsFn({ data: { targetUserId: previewAs } });
        if (rw.isSeller) setRewardBalance(rw.balance ?? 0);
      } catch { /* ignore */ }
    }
  };



  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = (await ctxFn({ data: { targetUserId: previewAs } })) as SellerCtx;
        if (cancelled) return;
        setCtx(r);
        const ev = await eventFn({ data: {} });
        if (!cancelled) setActiveEvent(ev.event);
        const uid = r.userId ?? r.previewUserId;
        if (uid && !cancelled) {
          setRewardGoalState(getRewardGoal(uid));
          try {
            const rw = await rewardsFn({ data: { targetUserId: previewAs } });
            if (!cancelled && rw.isSeller) setRewardBalance(rw.balance ?? 0);
          } catch {/* ignore */}
          // Mark existing bonuses as seen on first load (no toast)
          try {
            const mr = await bonusesFn({ data: { targetUserId: previewAs } });
            const seenRaw = window.localStorage.getItem(bonusStorageKey(uid));
            if (!seenRaw) {
              window.localStorage.setItem(
                bonusStorageKey(uid),
                JSON.stringify(mr.bonuses.map((m) => m.id)),
              );
            }
          } catch {/* ignore */}
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, navigate, ctxFn, eventFn, bonusesFn, rewardsFn, previewAs]);

  // Listen for goal changes from rewards page
  useEffect(() => {
    const uid = ctx?.userId ?? ctx?.previewUserId;
    if (!uid) return;
    const handler = () => setRewardGoalState(getRewardGoal(uid));
    window.addEventListener("smaarty:reward-goal-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("smaarty:reward-goal-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, [ctx?.userId, ctx?.previewUserId]);

  // First-login onboarding (only for real seller, not preview)
  useEffect(() => {
    if (!ctx?.isSeller || ctx.isPreview) return;
    const uid = ctx.userId;
    if (!uid) return;
    if (!hasSeenOnboarding(uid)) setShowOnboarding(true);
  }, [ctx]);

  const closeOnboarding = () => {
    setShowOnboarding(false);
    if (ctx?.userId) markOnboardingSeen(ctx.userId);
  };



  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError("Ange mottagarens namn."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Ange en giltig e-postadress."); return;
    }
    setSubmitting(true);
    const prevTotal = ctx?.treeCount ?? 0;
    const multiplier = activeEvent?.multiplier ?? 1;
    const treesPlanted = count;
    try {
      const res = await purchaseFn({
        data: { treeCount: count, recipientName: name.trim(), recipientEmail: email.trim() },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cert = JSON.parse(res.certificateJson) as any;
      setCertificate({
        verification_id: cert.verification_id,
        recipient_name: cert.recipient_name,
        tree_count: cert.tree_count,
        location_name: cert.location_name,
        latitude: cert.latitude,
        longitude: cert.longitude,
        issued_date: cert.issued_date,
        template: snapshotToTemplate(cert.template_snapshot),
      });
      setResultEmail(res.recipientEmail);
      setEmailSent(res.emailSent);
      setPlantingResult({ trees: treesPlanted, prevTotal, points: treesPlanted * multiplier });
      setView("done");
      await reload();
    } catch (e) {
      setError((e as Error).message || "Något gick fel.");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-24 pt-4">
        {showOnboarding && <Onboarding onClose={closeOnboarding} />}
        {ctx?.isPreview && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 shadow-sm"
            style={{ borderColor: "var(--primary)", background: "rgba(30,158,106,0.08)" }}>
            <div className="text-sm">
              <span className="font-display font-semibold" style={{ color: "var(--forest)" }}>
                👁 Förhandsvisning:
              </span>{" "}
              <span style={{ color: "var(--forest)" }}>{ctx.previewName ?? "Säljare"}</span>
              <span className="ml-2 text-xs" style={{ color: "var(--muted-foreground)" }}>(read-only)</span>
            </div>
            <button className="btn-secondary !py-1 !px-3 text-xs" onClick={() => navigate({ to: "/admin" })}>
              ← Tillbaka till admin
            </button>
          </div>
        )}
        <EventBanner event={activeEvent} />
        {celebration && (
          <div className="fixed inset-x-0 top-20 z-50 flex justify-center px-4">
            <div
              className="max-w-md rounded-2xl px-5 py-4 text-center shadow-xl"
              style={{
                background: "linear-gradient(135deg, #1e9e6a 0%, #3fc78b 100%)",
                color: "#fff",
                animation: "smaarty-pop 500ms cubic-bezier(.2,.9,.3,1.6)",
              }}
            >
              <div className="text-2xl">🎉</div>
              <div className="mt-1 font-display text-lg font-semibold">{celebration.title}</div>
              <div className="text-xs opacity-90">{celebration.subtitle}</div>
              <div className="mt-1 font-mono text-sm">+{celebration.bonus} bonuspoäng</div>

            </div>
          </div>
        )}
        {loading ? (
          <div className="surface-card p-10 text-center" style={{ color: "var(--muted-foreground)" }}>Laddar…</div>
        ) : !ctx?.isSeller ? (
          <div className="surface-card p-10 text-center">
            <h1 className="font-display text-2xl font-semibold">Ingen säljarprofil</h1>
            <p className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
              {ctx?.isPreview
                ? "Den valda användaren är inte kopplad till något säljarteam."
                : "Ditt konto är inte kopplat till något säljarteam. Kontakta administratören."}
            </p>
          </div>
        ) : view === "done" && certificate && plantingResult ? (
          <DoneView
            certificate={certificate}
            certRef={certRef}
            emailSent={emailSent}
            resultEmail={resultEmail}
            result={plantingResult}
            onContinue={() => { setCertificate(null); setPlantingResult(null); setName(""); setEmail(""); setCount(10); setView("home"); }}
            onPlantMore={() => { setCertificate(null); setPlantingResult(null); setName(""); setEmail(""); setCount(10); setView("register"); }}
          />

        ) : view === "register" && !ctx.isPreview ? (
          <RegisterView
            count={count} setCount={setCount}
            name={name} setName={setName}
            email={email} setEmail={setEmail}
            total={total} error={error} submitting={submitting}
            onBack={() => setView("home")}
            onSubmit={submit}
          />
        ) : (
          <HomeView
            ctx={ctx}
            lbScope={lbScope} setLbScope={setLbScope}
            lbKind={lbKind} setLbKind={setLbKind}
            onRegister={() => setView("register")}
            readOnly={!!ctx.isPreview}
            rewardGoal={rewardGoal}
            rewardBalance={rewardBalance}
          />
        )}
      </main>
    </div>
  );
}

function HomeView({
  ctx, lbScope, setLbScope, lbKind, setLbKind, onRegister, readOnly = false,
  rewardGoal = null, rewardBalance = 0,
}: {
  ctx: SellerCtx;
  lbScope: "week" | "total"; setLbScope: (s: "week" | "total") => void;
  lbKind: "sellers" | "teams"; setLbKind: (k: "sellers" | "teams") => void;
  onRegister: () => void;
  readOnly?: boolean;
  rewardGoal?: RewardGoal | null;
  rewardBalance?: number;
}) {
  const total = ctx.treeCount ?? 0;
  const week = ctx.weekTrees ?? 0;
  const today = ctx.todayTrees ?? 0;
  const streak = ctx.streak ?? 0;
  const teamTotal = ctx.teamTotal ?? 0;
  const weekendTrees = ctx.weekendTrees ?? 0;
  const isWeekendNow = !!ctx.isWeekendNow;
  const teamGoal = ctx.team?.weeklyGoal ?? 0;
  const teamBonusPts = ctx.team?.bonusPoints ?? 0;
  const teamWeekTrees = ctx.teamWeekTrees ?? 0;

  const stage = getStage(total);
  const stageStart = stage.current.min;
  const stageEnd = stage.next?.min ?? stage.current.min;
  const stageSpan = Math.max(1, stageEnd - stageStart);
  const stageProgress = stage.next ? total - stageStart : stageSpan;
  const remaining = stage.next ? Math.max(0, stageEnd - total) : 0;

  const nextBadge = BADGE_DEFS.find((b) => !ctx.badges?.[b.key]);

  const sellers = lbScope === "week" ? ctx.leaderboards?.sellersWeek ?? [] : ctx.leaderboards?.sellersTotal ?? [];
  const teams = lbScope === "week" ? ctx.leaderboards?.teamsWeek ?? [] : ctx.leaderboards?.teamsTotal ?? [];
  const maxSeller = Math.max(1, ...sellers.map((s) => s.trees));
  const maxTeam = Math.max(1, ...teams.map((t) => t.trees));

  const bubble = !stage.next
    ? "Du är fullvuxen — vilken skog du har skapat! 🌳"
    : remaining <= 1
      ? `Bara ${remaining} träd kvar till ${stage.next.name}!`
      : `Bra jobbat! ${remaining} träd kvar till ${stage.next.name}.`;

  return (
    <div className="space-y-6">
      {/* Topp */}
      <header className="flex items-center justify-between">
        <div>
          <div className="font-display text-2xl font-semibold" style={{ color: "var(--forest)" }}>Smaarty</div>
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {ctx.organization?.name} · {ctx.team?.name}
          </div>
        </div>
        <div className="chip" title={`Du har sålt ${streak} dagar i rad`}>
          <span>🔥</span><span className="font-mono">{streak}</span>
          <span style={{ color: "var(--muted-foreground)" }}>dagar i rad</span>
        </div>
      </header>

      {/* Plantan i framstegs-ring */}
      <section className="surface-card p-8 text-center" style={{ background: "var(--gradient-mint)" }}>
        <div className="flex justify-center">
          <ProgressRing value={stageProgress} max={stageSpan} size={260} stroke={16}>
            <Smaarty stage={stage.current.smaarty} size={180} />
          </ProgressRing>
        </div>
        <div className="mt-4 font-display text-xl font-semibold" style={{ color: "var(--forest)" }}>
          {stage.current.name}
        </div>
        <div className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          {stage.next ? <>{remaining} träd kvar till <strong>{stage.next.name}</strong></> : "Högsta stadiet uppnått"}
        </div>
        <div className="mx-auto mt-4 inline-block max-w-sm rounded-2xl bg-white/70 px-4 py-2 text-sm shadow-sm" style={{ color: "var(--forest)" }}>
          {bubble}
        </div>
      </section>

      {/* Statistik */}
      <section className="grid grid-cols-2 gap-4">
        <div className="surface-card p-6 text-center">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Du har sålt</div>
          <div className="mt-2 font-mono text-4xl font-semibold" style={{ color: "var(--forest)" }}>
            <CountUp value={total} />
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>träd totalt</div>
        </div>
        <div className="surface-card p-6 text-center">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Den här veckan</div>
          <div className="mt-2 font-mono text-4xl font-semibold" style={{ color: "var(--primary)" }}>
            <CountUp value={week} />
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>träd</div>
        </div>
      </section>

      {/* Sälj-hjälp */}
      <section>
        <Link
          to="/salj-hjalp"
          search={ctx.isPreview && ctx.previewUserId ? { as: ctx.previewUserId } : { as: undefined }}
          className="surface-card flex items-center gap-4 p-5 transition hover:scale-[1.01] active:scale-[0.99]"
        >
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: "var(--mint)" }}>
            💬
          </div>
          <div className="flex-1">
            <div className="font-display text-lg font-semibold">Sälj-hjälp</div>
            <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Guide för dig + snyggt material att visa kunden
            </div>
          </div>
          <div className="text-xl" style={{ color: "var(--muted-foreground)" }}>→</div>
        </Link>
      </section>

      {/* Dagens utmaning */}
      <section className="surface-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Dagens utmaning</div>
            <div className="mt-1 font-display text-lg font-semibold">Plantera {DAILY_GOAL} träd idag</div>
          </div>
          <div className="font-mono text-lg" style={{ color: "var(--forest)" }}>
            {Math.min(today, DAILY_GOAL)} / {DAILY_GOAL}
            {today >= DAILY_GOAL && <span className="ml-2">⭐</span>}
          </div>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--mint)" }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, (today / DAILY_GOAL) * 100)}%`, background: "var(--primary)" }} />
        </div>
        {today >= DAILY_GOAL
          ? <div className="mt-3 text-sm" style={{ color: "var(--forest)" }}>Klart för idag. Fint jobbat.</div>
          : <div className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>Ett träd i taget — det räcker långt.</div>}
      </section>

      {/* Helg-sprint */}
      <section className="surface-card p-6" style={{ opacity: isWeekendNow ? 1 : 0.85 }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Helg-sprint</div>
            <div className="mt-1 font-display text-lg font-semibold">
              {isWeekendNow
                ? <>Plantera {WEEKEND_SPRINT_GOAL} träd i helgen → <span style={{ color: "var(--primary)" }}>+10 poäng</span></>
                : <>Helg-sprinten kommer i helgen</>}
            </div>
          </div>
          <div className="font-mono text-lg" style={{ color: "var(--forest)" }}>
            {Math.min(weekendTrees, WEEKEND_SPRINT_GOAL)} / {WEEKEND_SPRINT_GOAL}
            {weekendTrees >= WEEKEND_SPRINT_GOAL && <span className="ml-2">⚡</span>}
          </div>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--mint)" }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, (weekendTrees / WEEKEND_SPRINT_GOAL) * 100)}%`, background: "linear-gradient(90deg,#ffcf78,#ff9a3c)" }} />
        </div>
        <div className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
          {isWeekendNow
            ? (weekendTrees >= WEEKEND_SPRINT_GOAL
                ? "Helg-sprinten är klar — snyggt jobbat! ⚡"
                : "Lördag + söndag räknas. Bonusen ges en gång per helg.")
            : "Spara energin till lördag–söndag och kör då. ✨"}
        </div>
      </section>

      {/* Lagets veckomål */}
      {teamGoal > 0 && (
        <section className="surface-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Lagets veckomål</div>
              <div className="mt-1 font-display text-lg font-semibold">
                {teamWeekTrees >= teamGoal
                  ? <>Målet nått. Alla i laget fick <span style={{ color: "var(--primary)" }}>+{teamBonusPts} poäng</span></>
                  : <>Plantera {teamGoal} träd tillsammans → alla får <span style={{ color: "var(--primary)" }}>+{teamBonusPts} poäng</span></>}
              </div>
            </div>
            <div className="font-mono text-lg" style={{ color: "var(--forest)" }}>
              {Math.min(teamWeekTrees, teamGoal)} / {teamGoal}
            </div>
          </div>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--mint)" }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, (teamWeekTrees / teamGoal) * 100)}%`, background: "var(--primary)" }} />
          </div>
          <div className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Hela <strong>{ctx.team?.name}</strong> jobbar mot samma mål — peppa varandra.
          </div>
        </section>
      )}


      {/* Topplista */}
      <section className="surface-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Topplista</h2>
          <div className="flex gap-2">
            <div className="flex rounded-full p-1" style={{ background: "var(--mint-paper)" }}>
              {(["week", "total"] as const).map((s) => (
                <button key={s} onClick={() => setLbScope(s)}
                  className="rounded-full px-3 py-1 text-xs font-medium transition"
                  style={{ background: lbScope === s ? "var(--card)" : "transparent", color: "var(--forest)" }}>
                  {s === "week" ? "Veckans" : "Totalt"}
                </button>
              ))}
            </div>
            <div className="flex rounded-full p-1" style={{ background: "var(--mint-paper)" }}>
              {(["sellers", "teams"] as const).map((k) => (
                <button key={k} onClick={() => setLbKind(k)}
                  className="rounded-full px-3 py-1 text-xs font-medium transition"
                  style={{ background: lbKind === k ? "var(--card)" : "transparent", color: "var(--forest)" }}>
                  {k === "sellers" ? "Säljare" : "Lag"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {lbKind === "sellers"
            ? sellers.length === 0
              ? <div className="py-4 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Inga planteringar än — du kan bli först.</div>
              : sellers.map((s, i) => {
                  const me = s.userId === ctx.userId;
                  const w = (s.trees / maxSeller) * 100;
                  return (
                    <div key={s.userId} className="relative overflow-hidden rounded-xl border px-3 py-2"
                      style={{ borderColor: me ? "var(--primary)" : "var(--border)", background: me ? "var(--mint-paper)" : "var(--card)" }}>
                      <div className="absolute inset-y-0 left-0 rounded-l-xl transition-all duration-700"
                        style={{ width: `${w}%`, background: me ? "rgba(30,158,106,0.18)" : "rgba(159,217,182,0.35)" }} />
                      <div className="relative flex items-center gap-3">
                        <MedalIcon rank={i + 1} />
                        <div className="flex-1 truncate text-sm font-medium" style={{ color: "var(--forest)" }}>
                          {s.name}{me && <span className="ml-2 text-xs" style={{ color: "var(--primary)" }}>(du)</span>}
                        </div>
                        <div className="font-mono text-sm font-semibold" style={{ color: "var(--forest)" }}>{s.trees}</div>
                      </div>
                    </div>
                  );
                })
            : teams.length === 0
              ? <div className="py-4 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Inga lag att visa än.</div>
              : teams.map((t, i) => {
                  const mine = t.teamId === ctx.team?.id;
                  const w = (t.trees / maxTeam) * 100;
                  return (
                    <div key={t.teamId} className="relative overflow-hidden rounded-xl border px-3 py-2"
                      style={{ borderColor: mine ? "var(--primary)" : "var(--border)", background: mine ? "var(--mint-paper)" : "var(--card)" }}>
                      <div className="absolute inset-y-0 left-0 rounded-l-xl transition-all duration-700"
                        style={{ width: `${w}%`, background: mine ? "rgba(30,158,106,0.18)" : "rgba(251,227,192,0.45)" }} />
                      <div className="relative flex items-center gap-3">
                        <MedalIcon rank={i + 1} />
                        <div className="flex-1 truncate text-sm font-medium" style={{ color: "var(--forest)" }}>
                          {t.name}{mine && <span className="ml-2 text-xs" style={{ color: "var(--primary)" }}>(ditt lag)</span>}
                        </div>
                        <div className="font-mono text-sm font-semibold" style={{ color: "var(--forest)" }}>{t.trees}</div>
                      </div>
                    </div>
                  );
                })}
        </div>

        <div className="mt-5 rounded-xl p-4 text-center text-sm" style={{ background: "var(--gradient-mint)", color: "var(--forest)" }}>
          🌿 Tillsammans har <strong>{ctx.team?.name}</strong> planterat <span className="font-mono font-semibold"><CountUp value={teamTotal} /></span> träd!
        </div>
      </section>

      {/* Märken — översikt */}
      <section className="surface-card p-6">
        <h2 className="font-display text-xl font-semibold">Dina märken</h2>
        <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-7">
          {BADGE_DEFS.map((b, i) => {
            const earned = !!ctx.badges?.[b.key];
            return (
              <div key={b.key} className="flex flex-col items-center text-center" title={b.desc}>
                <span className={`badge ${earned ? "unlocked" : ""}`} style={{ ["--glimmer-delay" as string]: `${i * 0.5}s` } as React.CSSProperties}>
                  <img src={b.img} alt={b.name}
                    className="h-16 w-16 block transition"
                    style={{ background: "transparent", filter: earned ? "none" : "grayscale(1)", opacity: earned ? 1 : 0.4 }} />
                </span>
                <div className="mt-1 text-[10px] font-medium leading-tight" style={{ color: earned ? "var(--forest)" : "var(--muted-foreground)" }}>{b.name}</div>
              </div>
            );
          })}
        </div>

      </section>

      {/* Mål-påminnelse */}
      {rewardGoal && (() => {
        const pct = Math.max(0, Math.min(100, (rewardBalance / Math.max(1, rewardGoal.cost)) * 100));
        const ready = rewardBalance >= rewardGoal.cost;
        return (
          <Link
            to="/beloningar"
            search={ctx.isPreview && ctx.previewUserId ? { as: ctx.previewUserId } : { as: undefined }}
            className="surface-card block p-3 transition hover:shadow-md"
            style={{ background: "var(--mint-paper)", borderTop: "2px solid #d4af37" }}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl" aria-hidden>{rewardGoal.emoji}</span>
              <div className="min-w-0 flex-1 text-xs" style={{ color: "var(--forest)" }}>
                Du sparar mot <strong>{rewardGoal.name}</strong> — <span className="font-mono">{rewardBalance}/{rewardGoal.cost}</span>
              </div>
              <span className="text-xs" style={{ color: ready ? "var(--primary)" : "var(--muted-foreground)" }}>
                {ready ? "Klar! 🎉" : `${rewardGoal.cost - rewardBalance} kvar`}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.7)" }}>
              <div className="goal-mini-bar h-full rounded-full"
                style={{ width: `${pct}%`, background: ready ? "var(--primary)" : "linear-gradient(90deg,#ffcf78,#1e9e6a)" }} />
            </div>
            <style>{`
              .goal-mini-bar { transition: width 800ms cubic-bezier(.2,.9,.3,1.2); }
              @media (prefers-reduced-motion: reduce) { .goal-mini-bar { transition: none; } }
            `}</style>
          </Link>
        );
      })()}

      {/* Belöningar-CTA */}
      <Link
        to="/beloningar"
        search={ctx.isPreview && ctx.previewUserId ? { as: ctx.previewUserId } : { as: undefined }}
        className="surface-card flex items-center justify-between p-5 transition hover:shadow-md"
        style={{ background: "var(--gradient-mint)" }}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ background: "rgba(255,255,255,.7)" }}>🎁</div>
          <div>
            <div className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>Belöningar</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Handla med dina poäng</div>
          </div>
        </div>
        <span className="font-mono text-xl" style={{ color: "var(--forest)" }}>→</span>
      </Link>

      {/* Nästa märke */}
      {nextBadge && (
        <section className="surface-card p-6">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Nästa märke</div>
          <div className="mt-3 flex items-center gap-4">
            <img src={nextBadge.img} alt={nextBadge.name} className="h-20 w-20" style={{ filter: "grayscale(1)", opacity: 0.55 }} />
            <div className="flex-1">
              <div className="font-display text-lg font-semibold">{nextBadge.name}</div>
              <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{nextBadge.desc}</div>
              {nextBadge.kind === "total" && (
                <div className="mt-2">
                  <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--mint)" }}>
                    <div className="h-full rounded-full"
                      style={{ width: `${Math.min(100, (total / nextBadge.threshold) * 100)}%`, background: "var(--primary)" }} />
                  </div>
                  <div className="mt-1 text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                    {total} / {nextBadge.threshold} träd
                  </div>
                </div>
              )}
              {nextBadge.kind === "streak" && (
                <div className="mt-1 text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                  Streak: {streak} / {nextBadge.threshold} dagar
                </div>
              )}
              {nextBadge.kind === "team" && (
                <div className="mt-1 text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                  Laget: {teamTotal} / {nextBadge.threshold} träd
                </div>
              )}
              {nextBadge.kind === "special" && (
                <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Plantera flest träd i ditt lag denna vecka.
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Plantera träd — huvudknapp */}
      {!readOnly && (
        <div className="sticky bottom-4 z-20">
          <button onClick={onRegister}
            className="btn-primary w-full !py-5 text-lg shadow-lg"
            style={{ boxShadow: "0 14px 36px -10px rgba(30,158,106,.6)" }}>
            🌱 Plantera träd
          </button>
        </div>
      )}


      <style>{`
        @keyframes smaarty-pop {
          0% { transform: scale(0.85); opacity: 0; }
          60% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes smaarty-idle {
          0%   { transform: translateY(0) scale(1); }
          50%  { transform: translateY(-4px) scale(1.03); }
          100% { transform: translateY(0) scale(1); }
        }
        .smaarty-idle { will-change: transform; transform-origin: 50% 60%; }
        @media (prefers-reduced-motion: reduce) {
          .smaarty-idle { animation: none !important; transform: none !important; }
        }
      `}</style>
    </div>
  );
}

function RegisterView({
  count, setCount, name, setName, email, setEmail, total: _total, error, submitting, onBack, onSubmit,
}: {
  count: number; setCount: (n: number) => void;
  name: string; setName: (s: string) => void;
  email: string; setEmail: (s: string) => void;
  total: number; error: string | null; submitting: boolean;
  onBack: () => void; onSubmit: () => void;
}) {
  return (
    <PlantingForm
      count={count} setCount={setCount}
      name={name} setName={setName}
      email={email} setEmail={setEmail}
      error={error} submitting={submitting}
      onSubmit={onSubmit}
      title="Plantera träd"
      intro="Välj hur många träd du vill plantera och vem de planteras för. Personen får ett värdebevis på mejlen — inget konto behövs."
      topRight={
        <button onClick={onBack} className="btn-secondary !px-4 !py-2 text-sm whitespace-nowrap">← Tillbaka</button>
      }
      footer={
        <p className="mt-3 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          Värdebeviset skickas direkt till mottagaren.
        </p>
      }
    />
  );
}



function Confetti() {
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return null;
  const colors = ["#1e9e6a", "#3fc78b", "#9FD9B6", "#FBE3C0", "#F6B27A", "#C7EAD4"];
  const pieces = Array.from({ length: 60 }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const duration = 1.8 + Math.random() * 1.6;
    const size = 6 + Math.random() * 8;
    const rot = Math.random() * 360;
    const color = colors[i % colors.length];
    const drift = (Math.random() - 0.5) * 120;
    return (
      <span
        key={i}
        style={{
          position: "absolute",
          left: `${left}%`,
          top: "-20px",
          width: size,
          height: size * 0.4,
          background: color,
          borderRadius: 2,
          transform: `rotate(${rot}deg)`,
          animation: `smaarty-confetti ${duration}s cubic-bezier(.2,.7,.4,1) ${delay}s forwards`,
          // @ts-expect-error CSS var
          "--drift": `${drift}px`,
        }}
      />
    );
  });
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">{pieces}</div>
  );
}

function DoneView({
  certificate, certRef, emailSent, resultEmail, result, onContinue, onPlantMore,
}: {
  certificate: CertificateData;
  certRef: React.RefObject<HTMLDivElement | null>;
  emailSent: boolean;
  resultEmail: string;
  result: { trees: number; prevTotal: number; points: number };
  onContinue: () => void;
  onPlantMore: () => void;
}) {
  const [showCert, setShowCert] = useState(false);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const newTotal = result.prevTotal + result.trees;
  const prevStage = getStage(result.prevTotal);
  const newStage = getStage(newTotal);
  const grewStage = newStage.idx > prevStage.idx;
  const co2Kg = Math.round(result.trees * 20); // ~20 kg CO2 / träd / år

  return (
    <div className="relative space-y-6">
      <section className="relative overflow-hidden surface-card p-8 text-center"
        style={{ background: "var(--gradient-mint)" }}>
        <Confetti />

        <div className="relative">
          <div className="flex justify-center">
            <img
              src={newStage.current.image}
              alt={newStage.current.name}
              className="smaarty-idle h-48 w-48 select-none"
              style={{
                background: "transparent",
                animation: reduced
                  ? undefined
                  : (grewStage
                      ? "smaarty-grow 900ms cubic-bezier(.2,.9,.3,1.6), smaarty-idle 3800ms ease-in-out 1000ms infinite"
                      : "smaarty-cheer 1200ms ease-in-out, smaarty-idle 3800ms ease-in-out 1300ms infinite"),
              }}
            />
          </div>

          {grewStage && (
            <div className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: "var(--primary)", color: "#fff" }}>
              ✨ Din planta växte till {newStage.current.name}!
            </div>
          )}

          <h1 className="mt-4 font-display text-3xl font-semibold" style={{ color: "var(--forest)" }}>
            Du planterade {result.trees} {result.trees === 1 ? "träd" : "träd"}! 🌱
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--forest)" }}>
            Smaarty hejar: <em>"Snyggt jobbat — din planta växer!"</em>
          </p>

          <div className="mx-auto mt-5 inline-flex items-center gap-4 rounded-2xl bg-white/80 px-5 py-3 shadow-sm">
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Poäng</div>
              <div className="font-mono text-2xl font-semibold" style={{ color: "var(--primary)" }}>
                +<CountUp value={result.points} duration={900} />
              </div>
            </div>
            <div className="h-8 w-px" style={{ background: "var(--border)" }} />
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Träd totalt</div>
              <div className="font-mono text-2xl font-semibold" style={{ color: "var(--forest)" }}>
                <CountUp value={newTotal} duration={900} />
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs" style={{ color: "var(--muted-foreground)" }}>
            🌍 {result.trees} {result.trees === 1 ? "träd" : "träd"} ≈ {co2Kg.toLocaleString("sv-SE")} kg koldioxid per år.
          </p>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={onPlantMore} className="btn-primary !py-4 text-lg"
          style={{ boxShadow: "0 12px 30px -10px rgba(30,158,106,.55)" }}>
          🌱 Plantera fler
        </button>
        <button onClick={onContinue} className="btn-secondary !py-4 text-lg">
          ← Tillbaka till hemmet
        </button>
      </div>

      <div className="surface-card p-5 text-sm" style={{ color: "var(--muted-foreground)" }}>
        {emailSent
          ? <>Värdebeviset har skickats till <span className="font-mono" style={{ color: "var(--forest)" }}>{resultEmail}</span>.</>
          : <>Planteringen är registrerad. Mejlet kunde inte skickas just nu — du kan ladda ner värdebeviset nedan.</>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setShowCert((v) => !v)} className="btn-secondary !py-2 !px-3 text-xs">
            {showCert ? "Dölj värdebevis" : "Visa värdebevis"}
          </button>
          <button onClick={() => certRef.current && downloadCertificateAsPdf(certRef.current, certificate.verification_id)} className="btn-secondary !py-2 !px-3 text-xs">
            Ladda ner PDF
          </button>
          <Link to="/v/$id" params={{ id: certificate.verification_id }} className="btn-secondary !py-2 !px-3 text-xs">
            Öppna publik sida
          </Link>
        </div>
        <div className={showCert ? "mt-4 flex justify-center overflow-x-auto" : "h-0 overflow-hidden"}>
          <Certificate ref={certRef} data={certificate} />
        </div>
      </div>

      <style>{`
        @keyframes smaarty-confetti {
          0%   { transform: translate(0,0) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--drift,0), 110vh) rotate(720deg); opacity: 0.9; }
        }
        @keyframes smaarty-grow {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes smaarty-cheer {
          0%, 100% { transform: translateY(0) rotate(0); }
          25%      { transform: translateY(-8px) rotate(-4deg); }
          50%      { transform: translateY(0) rotate(0); }
          75%      { transform: translateY(-6px) rotate(4deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes smaarty-confetti { from,to { opacity: 0; } }
        }
      `}</style>
    </div>
  );
}

