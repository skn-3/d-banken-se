import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, Blobs } from "@/components/site-chrome";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmartKlimat — Klimatkompensation, byggd som teknik" },
      { name: "description", content: "Planera träd och bygg upp ditt klimatkonto. SmartKlimat är bryggan mellan dig och riktig trädplantering." },
      { property: "og:title", content: "SmartKlimat — Klimatkompensation, byggd som teknik" },
      { property: "og:description", content: "Planera träd och bygg upp ditt klimatkonto." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 pb-32 pt-16 text-center sm:pt-24">
        <span className="chip mb-8">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--primary)" }} />
          Klimatkompensation på riktigt
        </span>

        <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl" style={{ color: "var(--forest)" }}>
          Klimatkompensation,
          <br />
          <span style={{ background: "linear-gradient(135deg, #1E9E6A, #0B3D2E)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            byggd som teknik.
          </span>
        </h1>

        <p className="mt-8 max-w-xl text-lg leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
          Köp träd. Få dem planterade. Följ ditt klimatkonto växa — som ett banksaldo,
          fast i skog.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link to="/kop" className="btn-primary">Plantera träd</Link>
          <Link to="/auth" className="btn-secondary">Logga in</Link>
        </div>

        <div className="mt-24 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { kpi: "35 kr", label: "per träd" },
            { kpi: "100%", label: "av träden planteras" },
            { kpi: "∞", label: "ditt saldo minskar aldrig" },
          ].map((c) => (
            <div key={c.label} className="surface-card px-6 py-7 text-left">
              <div className="font-mono text-2xl font-semibold" style={{ color: "var(--forest)" }}>{c.kpi}</div>
              <div className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{c.label}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
