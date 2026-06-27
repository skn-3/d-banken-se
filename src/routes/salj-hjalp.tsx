import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useCallback } from "react";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { getSellerContext } from "@/lib/seller.functions";
import { useAuth } from "@/hooks/use-auth";
import { Onboarding, resetOnboarding } from "@/components/onboarding";

export const Route = createFileRoute("/salj-hjalp")({
  head: () => ({ meta: [{ title: "Smaarty — Sälj-hjälp" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    as: typeof s.as === "string" && s.as.length > 0 ? (s.as as string) : undefined,
  }),
  component: SaljHjalpPage,
});

type Ctx = {
  teamTotal?: number;
  team?: { name: string };
  isPreview?: boolean;
  previewUserId?: string;
};

function SaljHjalpPage() {
  const { as: previewAs } = Route.useSearch();
  const { user } = useAuth();
  const fetchCtx = useServerFn(getSellerContext);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [view, setView] = useState<"home" | "guide" | "present">("home");
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchCtx({ data: previewAs ? { targetUserId: previewAs } : {} })
      .then((r) => { if (alive) setCtx(r as Ctx); })
      .catch(() => { if (alive) setCtx({}); });
    return () => { alive = false; };
  }, [fetchCtx, previewAs]);

  const backSearch = ctx?.isPreview && ctx.previewUserId ? { as: ctx.previewUserId } : { as: undefined };

  if (view === "present") {
    return <CustomerPresentation onClose={() => setView("home")} teamName={ctx?.team?.name} teamTotal={ctx?.teamTotal} />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Blobs />
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-6">
        <div className="mb-4">
          <Link to="/saljare" search={backSearch} className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            ← Tillbaka
          </Link>
        </div>

        {view === "home" && (
          <>
            <h1 className="font-display text-3xl font-semibold">Sälj-hjälp 🌱</h1>
            <p className="mt-2" style={{ color: "var(--muted-foreground)" }}>
              Här får du hjälp att sälja träd — och något fint att visa kunden.
            </p>

            <div className="mt-6 grid gap-4">
              <button
                onClick={() => setView("guide")}
                className="surface-card flex items-center gap-4 p-5 text-left transition hover:scale-[1.01] active:scale-[0.99]"
              >
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: "var(--mint)" }}>📘</div>
                <div className="flex-1">
                  <div className="font-display text-lg font-semibold">Så säljer du ett träd</div>
                  <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Fem enkla steg + tips</div>
                </div>
                <div className="text-xl" style={{ color: "var(--muted-foreground)" }}>→</div>
              </button>

              <button
                onClick={() => setView("present")}
                className="surface-card flex items-center gap-4 p-5 text-left transition hover:scale-[1.01] active:scale-[0.99]"
              >
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: "var(--apricot, #ffd9b3)" }}>🌳</div>
                <div className="flex-1">
                  <div className="font-display text-lg font-semibold">Visa kunden</div>
                  <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Snyggt material att vända mot köparen</div>
                </div>
                <div className="text-xl" style={{ color: "var(--muted-foreground)" }}>→</div>
              </button>

              <button
                onClick={() => {
                  if (user?.id) resetOnboarding(user.id);
                  setShowIntro(true);
                }}
                className="surface-card flex items-center gap-4 p-5 text-left transition hover:scale-[1.01] active:scale-[0.99]"
              >
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: "var(--mint)" }}>✨</div>
                <div className="flex-1">
                  <div className="font-display text-lg font-semibold">Visa introduktionen igen</div>
                  <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>De korta välkomst-slidesen</div>
                </div>
                <div className="text-xl" style={{ color: "var(--muted-foreground)" }}>→</div>
              </button>
            </div>
          </>
        )}

        {showIntro && <Onboarding onClose={() => setShowIntro(false)} />}

        {view === "guide" && <SalesGuide onShowCustomer={() => setView("present")} onBack={() => setView("home")} />}
      </main>
    </div>
  );
}

const STEPS = [
  { emoji: "👋", title: "Le och säg hej", text: "”Hej! Jag heter [namn] och jag går i klass [klass].”" },
  { emoji: "🌱", title: "Berätta vad du gör", text: "”Jag säljer träd för min klass. Varje träd planteras på riktigt och hjälper klimatet.”" },
  { emoji: "🌍", title: "Visa varför det är bra", text: "Öppna ”Visa kunden”-materialet. ”Ett träd suger upp ungefär 20 kg koldioxid varje år.”" },
  { emoji: "🤝", title: "Fråga snällt", text: "”Vill du vara med och köpa ett träd? Det kostar 35 kronor, och du får ett fint värdebevis.”" },
  { emoji: "💚", title: "Säg tack — oavsett svar", text: "”Tack så mycket!” eller ”Tack ändå, ha en fin dag!”" },
];

function SalesGuide({ onShowCustomer, onBack }: { onShowCustomer: () => void; onBack: () => void }) {
  return (
    <div>
      <button onClick={onBack} className="text-sm" style={{ color: "var(--muted-foreground)" }}>← Sälj-hjälp</button>
      <h1 className="mt-2 font-display text-3xl font-semibold">Så säljer du ett träd 🌱</h1>
      <p className="mt-2" style={{ color: "var(--muted-foreground)" }}>Följ de här stegen — du klarar det här!</p>

      <ol className="mt-6 grid gap-4">
        {STEPS.map((s, i) => (
          <li key={i} className="surface-card flex gap-4 p-5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: "var(--mint)" }}>{s.emoji}</div>
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Steg {i + 1}</div>
              <div className="mt-1 font-display text-lg font-semibold">{s.title}</div>
              <div className="mt-1 text-sm" style={{ color: "var(--forest)" }}>{s.text}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 surface-card p-5">
        <div className="font-display text-lg font-semibold">Bra att tänka på</div>
        <ul className="mt-3 space-y-2 text-sm">
          <li>💛 Var snäll och lugn — tjata aldrig.</li>
          <li>🙂 Det är okej om någon säger nej. Då säger du bara tack och går vidare.</li>
          <li>🎉 Ha kul! Du gör något riktigt bra för klimatet.</li>
        </ul>
      </div>

      <button
        onClick={onShowCustomer}
        className="mt-6 w-full rounded-2xl px-5 py-4 font-display text-lg font-semibold text-white transition active:scale-[0.98]"
        style={{ background: "var(--forest)" }}
      >
        Visa kunden →
      </button>
    </div>
  );
}

type Section = { kicker: string; title: string; body: React.ReactNode; bg: string };

function CustomerPresentation({ onClose, teamName, teamTotal }: { onClose: () => void; teamName?: string; teamTotal?: number }) {
  const [idx, setIdx] = useState(0);

  const sections: Section[] = [
    {
      kicker: "På riktigt",
      title: "Plantera ett träd, på riktigt.",
      bg: "linear-gradient(160deg, #d6efd8, #a8d5a0)",
      body: (
        <div className="mt-6 grid h-64 place-items-center rounded-3xl bg-white/40 text-7xl">🌲</div>
      ),
    },
    {
      kicker: "Vad gör ett träd?",
      title: "Mer än bara grönt.",
      bg: "linear-gradient(160deg, #e7f5e9, #cfe9d3)",
      body: (
        <ul className="mt-6 space-y-4 text-lg">
          <li className="flex items-center gap-4"><span className="text-3xl">🌬️</span> Suger upp ungefär 20 kg koldioxid per år</li>
          <li className="flex items-center gap-4"><span className="text-3xl">💨</span> Ger renare luft</li>
          <li className="flex items-center gap-4"><span className="text-3xl">🐦</span> Blir hem för djur och insekter</li>
        </ul>
      ),
    },
    {
      kicker: "Var planteras träden?",
      title: "Riktiga planteringsprojekt.",
      bg: "linear-gradient(160deg, #e2f0e4, #b9dcc0)",
      body: (
        <div className="mt-6 space-y-4">
          <div className="grid h-44 place-items-center rounded-3xl bg-white/40 text-6xl">🗺️</div>
          <p className="text-lg">
            Träden planteras genom <strong>WeForest</strong>, i etablerade planteringsprojekt runt om i världen.
          </p>
        </div>
      ),
    },
    {
      kicker: "Vad kostar det?",
      title: "35 kr per träd.",
      bg: "linear-gradient(160deg, #fdebd3, #f7d3a6)",
      body: (
        <div className="mt-6 space-y-4 text-lg">
          <p>Du får ett <strong>värdebevis</strong> som visar ditt bidrag — fint att spara eller ge bort.</p>
          <div className="rounded-3xl bg-white/60 p-6 text-center">
            <div className="font-mono text-5xl font-semibold" style={{ color: "var(--forest)" }}>35 kr</div>
            <div className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>per träd</div>
          </div>
        </div>
      ),
    },
    {
      kicker: teamName ? `Vår klass — ${teamName}` : "Vår klass",
      title: teamTotal && teamTotal > 0
        ? `Vi har redan planterat ${teamTotal} träd!`
        : "Vill du vara med?",
      bg: "linear-gradient(160deg, #d8ecdb, #a5cfac)",
      body: (
        <div className="mt-8 space-y-6 text-center">
          {teamTotal && teamTotal > 0 ? (
            <div className="font-mono text-7xl font-semibold" style={{ color: "var(--forest)" }}>{teamTotal}</div>
          ) : (
            <div className="text-7xl">🌱</div>
          )}
          <p className="text-2xl font-display">Vill du köpa ett träd?</p>
        </div>
      ),
    },
  ];

  const total = sections.length;
  const go = useCallback((d: number) => setIdx((i) => Math.max(0, Math.min(total - 1, i + d))), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const s = sections[idx];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: s.bg, transition: "background 400ms ease" }}>
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={onClose} className="rounded-full bg-white/60 px-4 py-2 text-sm font-medium">✕ Stäng</button>
        <div className="font-mono text-sm" style={{ color: "var(--forest)" }}>{idx + 1} / {total}</div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-xl">
          <div className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--forest)" }}>{s.kicker}</div>
          <h2 className="mt-2 font-display text-4xl font-semibold leading-tight" style={{ color: "var(--forest)" }}>{s.title}</h2>
          <div style={{ color: "var(--forest)" }}>{s.body}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 px-5 py-5">
        <button
          onClick={() => go(-1)}
          disabled={idx === 0}
          className="rounded-full bg-white/70 px-6 py-3 font-medium disabled:opacity-40"
        >
          ← Bakåt
        </button>
        <div className="flex gap-2">
          {sections.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className="h-2 rounded-full transition-all"
              style={{ width: i === idx ? 24 : 8, background: i === idx ? "var(--forest)" : "rgba(0,0,0,0.2)" }}
              aria-label={`Gå till sektion ${i + 1}`}
            />
          ))}
        </div>
        <button
          onClick={() => go(1)}
          disabled={idx === total - 1}
          className="rounded-full px-6 py-3 font-medium text-white disabled:opacity-40"
          style={{ background: "var(--forest)" }}
        >
          Nästa →
        </button>
      </div>
    </div>
  );
}
