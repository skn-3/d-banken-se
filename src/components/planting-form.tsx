import { useEffect, useState } from "react";

const PRICE_PER_TREE_KR = 35;
const CO2_PER_TREE_KG = 20;
const QUICK_PICKS = [5, 10, 25, 100];

export interface PlantingFormProps {
  count: number;
  setCount: (n: number) => void;
  name: string;
  setName: (s: string) => void;
  email: string;
  setEmail: (s: string) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: () => void;
  /** Optional slot under header (e.g. back button) */
  topRight?: React.ReactNode;
  /** Optional footer slot under the CTA */
  footer?: React.ReactNode;
  title?: string;
  intro?: string;
}

export function PlantingForm({
  count, setCount, name, setName, email, setEmail,
  error, submitting, onSubmit, topRight, footer,
  title = "Plantera träd",
  intro = "Välj hur många träd du vill plantera och vem de planteras för. Personen får ett värdebevis på mejlen — inget konto behövs.",
}: PlantingFormProps) {
  const [bump, setBump] = useState(0);
  const co2 = count * CO2_PER_TREE_KG;
  const price = count * PRICE_PER_TREE_KR;

  // Tiny bounce on impact-row when count changes
  useEffect(() => {
    setBump((b) => b + 1);
  }, [count]);

  return (
    <section className="surface-card p-6 sm:p-8 plantform">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src="/smaarty/stages/skott.svg"
            alt=""
            aria-hidden="true"
            className="plantform-mascot h-12 w-12 sm:h-14 sm:w-14"
          />
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">{title}</h1>
        </div>
        {topRight}
      </div>
      <p className="mt-3 text-sm sm:text-base leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
        {intro}
      </p>

      {/* Antal */}
      <div className="mt-7">
        <h2 className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>Hur många träd?</h2>
        <div className="mt-3 flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            aria-label="Minska"
            className="plantform-step"
            onClick={() => setCount(Math.max(1, count - 1))}
          >−</button>
          <div className="plantform-count">
            <input
              type="number" min={1} max={10000} value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
              className="font-mono"
              aria-label="Antal träd"
            />
          </div>
          <button
            type="button"
            aria-label="Öka"
            className="plantform-step"
            onClick={() => setCount(Math.min(10000, count + 1))}
          >+</button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_PICKS.map((n) => {
            const active = count === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={`plantform-chip${active ? " is-active" : ""}`}
              >
                {n} träd
              </button>
            );
          })}
        </div>

        {/* Live impact */}
        <div key={bump} className="plantform-impact mt-4">
          <span aria-hidden>🌍</span>
          <span>
            Binder ungefär <span className="font-mono font-semibold">{co2.toLocaleString("sv-SE")}</span> kg koldioxid varje år.
          </span>
        </div>
      </div>

      {/* Mottagare */}
      <div className="mt-8">
        <h2 className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>Vem planteras träden för?</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Namn</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="t.ex. Sven Svensson" maxLength={120}
              className="plantform-input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">E-post</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="sven@example.se" maxLength={255}
              className="plantform-input"
            />
          </div>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
          Mejlen knyter träden till personen. Samma mejl över tid samlas i samma trädbank.
        </p>
      </div>

      {/* Varm sammanfattning */}
      <div className="plantform-summary mt-7">
        <div className="min-w-0">
          <div className="font-display text-base font-semibold" style={{ color: "var(--forest)" }}>Din plantering</div>
          <div className="mt-0.5 text-sm" style={{ color: "var(--muted-foreground)" }}>
            <span className="font-mono">{count}</span> {count === 1 ? "träd" : "träd"} · ~<span className="font-mono">{co2.toLocaleString("sv-SE")}</span> kg CO₂/år
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-semibold" style={{ color: "var(--forest)" }}>
            <span className="font-mono">{price.toLocaleString("sv-SE")}</span> kr
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}>
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="plantform-cta mt-6 w-full"
      >
        <span className="plantform-cta-sprout" aria-hidden>🌱</span>
        <span className="whitespace-nowrap">
          {submitting ? "Planterar…" : `Plantera ${count} ${count === 1 ? "träd" : "träd"}`}
        </span>
      </button>

      {footer}
    </section>
  );
}
