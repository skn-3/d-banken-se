import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { useAuth } from "@/hooks/use-auth";
import { Certificate, snapshotToTemplate, type CertificateData } from "@/components/certificate";
import { downloadCertificateAsPdf } from "@/lib/download-certificate";
import { getSellerContext, sellerCreatePurchase } from "@/lib/seller.functions";
import { getActiveEvent, getSellerMilestones, type ActiveEvent } from "@/lib/events.functions";
import { EventBanner } from "@/components/event-banner";

const PRICE_PER_TREE_ORE = 3500;
const QUICK_PICKS = [5, 10, 25, 100];
const DAILY_GOAL = 3;

// Plantans tillväxt
const STAGES = [
  { key: "skott", name: "Skott", min: 0, image: "/smaarty/stages/skott.svg" },
  { key: "planta", name: "Planta", min: 10, image: "/smaarty/stages/planta.svg" },
  { key: "ungt", name: "Ungt träd", min: 25, image: "/smaarty/stages/ungt-trad.svg" },
  { key: "stort", name: "Stort träd", min: 50, image: "/smaarty/stages/stort-trad.svg" },
  { key: "fullvuxet", name: "Fullvuxet träd", min: 100, image: "/smaarty/stages/fullvuxet-trad.svg" },
] as const;

const BADGE_DEFS = [
  { key: "forstaTradet", name: "Första trädet", desc: "Sälj ditt första träd", img: "/smaarty/badges/forsta-tradet.svg", threshold: 1, kind: "total" as const },
  { key: "gronTumme", name: "Grön tumme", desc: "Sälj 10 träd", img: "/smaarty/badges/gron-tumme.svg", threshold: 10, kind: "total" as const },
  { key: "skogshjalte", name: "Skogshjälte", desc: "Sälj 50 träd", img: "/smaarty/badges/skogshjalte.svg", threshold: 50, kind: "total" as const },
  { key: "skogsmastare", name: "Skogsmästare", desc: "Sälj 100 träd", img: "/smaarty/badges/skogsmastare.svg", threshold: 100, kind: "total" as const },
  { key: "veckansSaljare", name: "Veckans säljare", desc: "Flest sålda träd i ditt lag denna vecka", img: "/smaarty/badges/veckans-saljare.svg", threshold: 1, kind: "special" as const },
  { key: "eldsjal", name: "Eldsjäl", desc: "Sälj flera dagar i rad (minst 3)", img: "/smaarty/badges/eldsjal.svg", threshold: 3, kind: "streak" as const },
  { key: "lagmarke", name: "Lagmärke", desc: "Laget når 100 sålda träd tillsammans", img: "/smaarty/badges/lagmarke.svg", threshold: 100, kind: "team" as const },
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
  team?: { id: string; name: string };
  organization?: { id: string; name: string; type: string };
  treeCount?: number;
  weekTrees?: number;
  todayTrees?: number;
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

  const [ctx, setCtx] = useState<SellerCtx | null>(null);
  const [loading, setLoading] = useState(true);

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
  const certRef = useRef<HTMLDivElement>(null);

  const total = useMemo(() => count * PRICE_PER_TREE_ORE, [count]);

  const reload = async () => {
    const r = (await ctxFn({ data: { targetUserId: previewAs } })) as SellerCtx;
    setCtx(r);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = (await ctxFn({ data: { targetUserId: previewAs } })) as SellerCtx;
        if (!cancelled) setCtx(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, navigate, ctxFn, previewAs]);


  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError("Ange mottagarens namn."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Ange en giltig e-postadress."); return;
    }
    setSubmitting(true);
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
        ) : view === "done" && certificate ? (
          <DoneView
            certificate={certificate}
            certRef={certRef}
            emailSent={emailSent}
            resultEmail={resultEmail}
            onContinue={() => { setCertificate(null); setName(""); setEmail(""); setCount(10); setView("home"); }}
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
          />
        )}
      </main>
    </div>
  );
}

function HomeView({
  ctx, lbScope, setLbScope, lbKind, setLbKind, onRegister, readOnly = false,
}: {
  ctx: SellerCtx;
  lbScope: "week" | "total"; setLbScope: (s: "week" | "total") => void;
  lbKind: "sellers" | "teams"; setLbKind: (k: "sellers" | "teams") => void;
  onRegister: () => void;
  readOnly?: boolean;
}) {
  const total = ctx.treeCount ?? 0;
  const week = ctx.weekTrees ?? 0;
  const today = ctx.todayTrees ?? 0;
  const streak = ctx.streak ?? 0;
  const teamTotal = ctx.teamTotal ?? 0;
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
            <img src={stage.current.image} alt={stage.current.name}
              className="h-44 w-44 select-none"
              style={{ animation: "smaarty-pop 600ms cubic-bezier(.2,.9,.3,1.4)" }} />
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

      {/* Dagens utmaning */}
      <section className="surface-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Dagens utmaning</div>
            <div className="mt-1 font-display text-lg font-semibold">Sälj {DAILY_GOAL} träd idag</div>
          </div>
          <div className="font-mono text-lg" style={{ color: "var(--forest)" }}>
            {Math.min(today, DAILY_GOAL)} / {DAILY_GOAL}
            {today >= DAILY_GOAL && <span className="ml-2">🎉</span>}
          </div>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--mint)" }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, (today / DAILY_GOAL) * 100)}%`, background: "var(--primary)" }} />
        </div>
        {today >= DAILY_GOAL
          ? <div className="mt-3 text-sm" style={{ color: "var(--forest)" }}>Klart! Du klarade dagens utmaning. ⭐</div>
          : <div className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>Varje träd räknas — kör på!</div>}
      </section>

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
              ? <div className="py-4 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Inga försäljningar än — du kan bli först!</div>
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
          {BADGE_DEFS.map((b) => {
            const earned = !!ctx.badges?.[b.key];
            return (
              <div key={b.key} className="flex flex-col items-center text-center" title={b.desc}>
                <img src={b.img} alt={b.name}
                  className="h-16 w-16 transition"
                  style={{ filter: earned ? "none" : "grayscale(1)", opacity: earned ? 1 : 0.4 }} />
                <div className="mt-1 text-[10px] font-medium leading-tight" style={{ color: earned ? "var(--forest)" : "var(--muted-foreground)" }}>{b.name}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Belöningar-CTA */}
      <Link
        to="/belonigar"
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
                  Sälj flest träd i ditt lag denna vecka för att vinna.
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Registrera försäljning */}
      {!readOnly && (
        <div className="sticky bottom-4 z-20">
          <button onClick={onRegister}
            className="btn-primary w-full !py-4 text-lg shadow-lg"
            style={{ boxShadow: "0 12px 30px -10px rgba(30,158,106,.55)" }}>
            🌱 Registrera försäljning
          </button>
        </div>
      )}

      <style>{`
        @keyframes smaarty-pop {
          0% { transform: scale(0.85); opacity: 0; }
          60% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function RegisterView({
  count, setCount, name, setName, email, setEmail, total, error, submitting, onBack, onSubmit,
}: {
  count: number; setCount: (n: number) => void;
  name: string; setName: (s: string) => void;
  email: string; setEmail: (s: string) => void;
  total: number; error: string | null; submitting: boolean;
  onBack: () => void; onSubmit: () => void;
}) {
  return (
    <section className="surface-card p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Registrera försäljning</h1>
        <button onClick={onBack} className="btn-secondary !px-4 !py-2 text-sm">← Tillbaka</button>
      </div>
      <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
        Värdebeviset skickas till kundens e-post. Pris per träd: <span className="font-mono">35 kr</span>.
      </p>

      <div className="mt-6">
        <label className="mb-2 block text-sm font-medium">Antal träd</label>
        <div className="flex items-center gap-3">
          <button type="button" className="btn-secondary !px-4 !py-2" onClick={() => setCount(Math.max(1, count - 1))}>−</button>
          <input type="number" min={1} max={10000} value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
            className="input-field text-center font-mono text-lg !w-32" />
          <button type="button" className="btn-secondary !px-4 !py-2" onClick={() => setCount(Math.min(10000, count + 1))}>+</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_PICKS.map((n) => (
            <button key={n} type="button" onClick={() => setCount(n)} className="chip"
              style={{ cursor: "pointer", background: count === n ? "var(--mint)" : undefined }}>
              {n} träd
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium">Mottagarens namn</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="input-field w-full" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">Mottagarens e-post</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} className="input-field w-full" />
        </div>
      </div>

      <div className="mt-6 rounded-2xl p-5" style={{ background: "var(--mint-paper)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Totalt</span>
          <span className="font-mono text-2xl font-semibold" style={{ color: "var(--forest)" }}>{formatKr(total)}</span>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}>{error}</div>
      )}

      <button onClick={onSubmit} disabled={submitting} className="btn-primary mt-6 w-full">
        {submitting ? "Bearbetar…" : "Bekräfta försäljning"}
      </button>
      <p className="mt-2 text-center text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>Betalning simuleras.</p>
    </section>
  );
}

function DoneView({
  certificate, certRef, emailSent, resultEmail, onContinue,
}: {
  certificate: CertificateData;
  certRef: React.RefObject<HTMLDivElement | null>;
  emailSent: boolean;
  resultEmail: string;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="surface-card p-8 text-center">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--gradient-mint)" }}>
          <span className="font-display text-2xl" style={{ color: "var(--forest)" }}>✓</span>
        </div>
        <h1 className="font-display text-3xl font-semibold">
          Tack! {certificate.tree_count} träd registrerade
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          {emailSent
            ? <>Värdebeviset har skickats till <span className="font-mono">{resultEmail}</span>.</>
            : <>Köpet är registrerat. Mailet kunde inte skickas just nu.</>}
        </p>
      </div>
      <div className="flex justify-center overflow-x-auto">
        <Certificate ref={certRef} data={certificate} />
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button onClick={() => certRef.current && downloadCertificateAsPdf(certRef.current, certificate.verification_id)} className="btn-primary">Ladda ner PDF</button>
        <Link to="/v/$id" params={{ id: certificate.verification_id }} className="btn-secondary">Öppna publik sida</Link>
        <button onClick={onContinue} className="btn-secondary">Tillbaka till hemmet</button>
      </div>
    </div>
  );
}
