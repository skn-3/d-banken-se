import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { getSellerContext } from "@/lib/seller.functions";
import { useAuth } from "@/hooks/use-auth";
import { Onboarding, resetOnboarding } from "@/components/onboarding";
import { VarforTradStory } from "@/components/varfor-trad-story";

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
  const [showStory, setShowStory] = useState(false);

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

  if (showStory) {
    return <VarforTradStory onClose={() => setShowStory(false)} />;
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
            <h1 className="font-display text-3xl font-semibold">Sälj-hjälp</h1>
            <p className="mt-2" style={{ color: "var(--muted-foreground)" }}>
              Här får du hjälp när du pratar med kunden — och något fint att visa.
            </p>

            <div className="mt-6 grid gap-4">
              <button
                onClick={() => setView("guide")}
                className="surface-card flex items-center gap-4 p-5 text-left transition hover:scale-[1.01] active:scale-[0.99]"
              >
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: "var(--mint)" }}>📘</div>
                <div className="flex-1">
                  <div className="font-display text-lg font-semibold">Så pratar du med kunden</div>
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
                  <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Snyggt material att vända mot kunden</div>
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
  { emoji: "🌱", title: "Berätta vad du gör", text: "”Jag är med och planterar träd för min klass. Träden planteras genom WeForest.”" },
  { emoji: "🌍", title: "Visa varför det är bra", text: "Öppna ”Visa kunden”-materialet. ”Ett träd binder ungefär 20 kg koldioxid per år.”" },
  { emoji: "🤝", title: "Fråga vänligt", text: "”Vill du vara med och plantera ett träd? 35 kr per träd, och du får ett personligt värdebevis.”" },
  { emoji: "💚", title: "Säg tack — oavsett svar", text: "”Tack så mycket!” eller ”Tack ändå, ha en fin dag.”" },
];

function SalesGuide({ onShowCustomer, onBack }: { onShowCustomer: () => void; onBack: () => void }) {
  return (
    <div>
      <button onClick={onBack} className="text-sm" style={{ color: "var(--muted-foreground)" }}>← Sälj-hjälp</button>
      <h1 className="mt-2 font-display text-3xl font-semibold">Så pratar du med kunden</h1>
      <p className="mt-2" style={{ color: "var(--muted-foreground)" }}>Följ stegen i din egen takt.</p>

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
          <li>💛 Var lugn och vänlig — tjata aldrig.</li>
          <li>🙂 Det är okej om någon säger nej. Säg tack och gå vidare.</li>
          <li>🌳 Varje träd räknas — också det du inte fick.</li>
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

function ImagePlaceholder({ label, ratio = "16 / 10" }: { label: string; ratio?: string }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-3xl"
      style={{
        aspectRatio: ratio,
        background:
          "linear-gradient(160deg, #EAF7EE 0%, #C7EAD4 60%, #9FD9B6 100%)",
        border: "1px solid #E2EDE6",
      }}
      aria-label={label}
    >
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#15784F" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="1.6" />
            <path d="M3 17l5-5 4 4 3-3 6 6" />
          </svg>
          <div className="text-xs uppercase tracking-[0.18em]" style={{ color: "#15784F" }}>
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}

function Leaf() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E9E6A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 4C12 4 4 9 4 18c0 1 .2 2 .5 2.5C12 21 20 14 20 4z" />
      <path d="M4 20c4-6 9-10 15-12" />
    </svg>
  );
}
function Globe() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E9E6A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
    </svg>
  );
}
function Hands() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E9E6A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v6" />
      <path d="M9 6l3-3 3 3" />
      <path d="M4 13c2-2 5-2 8 0 3-2 6-2 8 0v3c0 3-3 5-8 5s-8-2-8-5z" />
    </svg>
  );
}

function CustomerPresentation({ onClose, teamTotal }: { onClose: () => void; teamName?: string; teamTotal?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const text = "#0B3D2E";
  const muted = "#3A5A4A";
  const line = "#E2EDE6";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#F4FAF5", color: text }}>
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3" style={{ background: "rgba(244,250,245,0.92)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${line}` }}>
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: muted }}>SmartKlimat × WeForest</div>
        <button onClick={onClose} className="rounded-full px-4 py-1.5 text-sm font-medium" style={{ border: `1px solid ${line}`, background: "white", color: text }}>
          ✕ Stäng
        </button>
      </div>

      <article className="mx-auto max-w-xl px-5 pb-16 presentation-fade">
        {/* HERO */}
        <section className="pt-6">
          <ImagePlaceholder label="WeForest-foto — skog / plantering" ratio="4 / 5" />
          <div className="mt-6">
            <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: muted }}>SmartKlimat × WeForest</div>
            <h1 className="mt-3 font-display text-[34px] font-semibold leading-[1.1] tracking-tight" style={{ color: text }}>
              Plantera ett träd.<br />Återställ en skog.
            </h1>
            <p className="mt-4 text-[17px] leading-relaxed" style={{ color: muted }}>
              Träd som planteras där de behövs som mest.
            </p>
          </div>
        </section>

        <div className="my-10 h-px" style={{ background: line }} />

        {/* THREE PILLARS */}
        <section>
          <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: muted }}>Vad ditt träd gör</div>
          <h2 className="mt-2 font-display text-[26px] font-semibold leading-tight" style={{ color: text }}>
            Ett träd gör mer än du tror.
          </h2>

          <ul className="mt-8 space-y-7">
            {[
              { icon: <Globe />, title: "Svalkar planeten", text: "Träd binder koldioxid och hjälper till att kyla jorden — ungefär 20 kg CO₂ per träd och år." },
              { icon: <Leaf />, title: "Återställer ekosystem", text: "Skogar hyser upp till 90% av alla landlevande arter och skyddar mark och vatten." },
              { icon: <Hands />, title: "Minskar fattigdom", text: "Planteringen skapar jobb och inkomst — särskilt för kvinnor, som kan skicka sina barn till skolan." },
            ].map((p, i) => (
              <li key={i} className="flex gap-4">
                <div className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-2xl" style={{ background: "#EAF7EE", border: `1px solid ${line}` }}>
                  {p.icon}
                </div>
                <div className="flex-1">
                  <div className="font-display text-[18px] font-semibold" style={{ color: text }}>{p.title}</div>
                  <p className="mt-1.5 text-[15px] leading-relaxed" style={{ color: muted }}>{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="my-10 h-px" style={{ background: line }} />

        {/* WEFOREST BAND (dark) */}
        <section className="rounded-[28px] p-7" style={{ background: "linear-gradient(160deg, #0B3D2E 0%, #15784F 120%)", color: "#EAF7EE" }}>
          <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "#9FD9B6" }}>Var träden planteras</div>
          <h2 className="mt-2 font-display text-[24px] font-semibold leading-tight">Skogar under återställning.</h2>
          <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "#C7EAD4" }}>
            Träden planteras tillsammans med WeForest och lokala partners, i pågående projekt.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-2.5">
            {[
              { v: "1 265", l: "hektar under återställning" },
              { v: "211", l: "arter återställda" },
              { v: "37", l: "djurarter bevarade" },
            ].map((s, i) => (
              <div key={i} className="rounded-2xl p-3.5 text-center" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(159,217,182,0.18)" }}>
                <div className="font-mono text-[20px] font-semibold" style={{ color: "white" }}>{s.v}</div>
                <div className="mt-1 text-[10px] leading-tight" style={{ color: "#9FD9B6" }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[10px]" style={{ color: "rgba(199,234,212,0.7)" }}>Exempelvärden — uppdateras per projekt.</div>

          <div className="mt-6">
            <ImagePlaceholder label="WeForest-projektfoto" ratio="16 / 10" />
          </div>
        </section>

        <div className="my-10 h-px" style={{ background: line }} />

        {/* CERTIFICATE */}
        <section>
          <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: muted }}>Ditt bevis</div>
          <h2 className="mt-2 font-display text-[26px] font-semibold leading-tight" style={{ color: text }}>
            Ett personligt värdebevis.
          </h2>

          <div className="mt-6 rounded-3xl p-5" style={{ background: "white", border: `1px solid ${line}` }}>
            <div className="rounded-2xl p-5" style={{ background: "#F4FAF5", border: `1px dashed ${line}` }}>
              <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: muted }}>Värdebevis</div>
              <div className="mt-2 font-display text-[18px] font-semibold" style={{ color: text }}>För ditt bidrag till skogen</div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="font-mono text-[12px]" style={{ color: muted }}>SK-•••• ••••</div>
                  <div className="mt-1 text-[12px]" style={{ color: muted }}>SmartKlimat × WeForest</div>
                </div>
                <Leaf />
              </div>
            </div>
            <p className="mt-4 text-[15px] leading-relaxed" style={{ color: muted }}>
              Varje träd dedikeras till dig. Du får ett personligt värdebevis på mejlen och kan följa din påverkan över tid.
            </p>
          </div>
        </section>

        <div className="my-10 h-px" style={{ background: line }} />

        {/* CLOSING */}
        <section>
          <div className="rounded-[28px] p-8 text-center" style={{ background: "#EAF7EE", border: `1px solid ${line}` }}>
            <div className="font-mono text-[56px] font-semibold leading-none" style={{ color: text }}>35 kr</div>
            <div className="mt-2 text-[13px] uppercase tracking-[0.18em]" style={{ color: muted }}>per träd</div>
            <p className="mt-6 font-display text-[18px] leading-snug" style={{ color: text }}>
              Ett litet steg för dig — ett träd i en skog som behöver det.
            </p>
            {teamTotal && teamTotal > 0 ? (
              <p className="mt-4 text-[13px]" style={{ color: muted }}>
                Vår klass har redan planterat <span className="font-mono font-semibold" style={{ color: text }}>{teamTotal}</span> träd.
              </p>
            ) : null}
          </div>

          <p className="mt-8 text-center font-display text-[15px]" style={{ color: muted }}>
            Tänk smart. Vi har ett gemensamt klimat.
          </p>
        </section>
      </article>
    </div>
  );
}

