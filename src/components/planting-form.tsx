import { useEffect, useState } from "react";
import { Smaarty } from "@/components/smaarty";

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
  topRight?: React.ReactNode;
  footer?: React.ReactNode;
  title?: string;
  intro?: string;
}

type Dir = "fwd" | "back";

export function PlantingForm({
  count, setCount, name, setName, email, setEmail,
  error, submitting, onSubmit, topRight, footer,
}: PlantingFormProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [dir, setDir] = useState<Dir>("fwd");
  const [animKey, setAnimKey] = useState(0);

  const co2 = count * CO2_PER_TREE_KG;
  const price = count * PRICE_PER_TREE_KR;

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canNext = step === 1 ? count >= 1 : step === 2 ? name.trim().length > 0 && emailValid : true;

  const go = (next: 1 | 2 | 3, d: Dir) => {
    setDir(d);
    setStep(next);
    setAnimKey((k) => k + 1);
  };
  const next = () => step < 3 && canNext && go((step + 1) as 1 | 2 | 3, "fwd");
  const back = () => step > 1 && go((step - 1) as 1 | 2 | 3, "back");

  // Reset to step 1 if external state cleared (e.g., parent resets count to default after submit not used here)
  useEffect(() => { /* noop */ }, []);

  const bubble =
    step === 1 ? "Hur många träd vill du plantera?" :
    step === 2 ? "Vem ska få träden?" :
                 "Redo? Nu planterar vi!";

  const animClass = dir === "fwd" ? "wizard-step-in-right" : "wizard-step-in-left";

  return (
    <section className="surface-card p-6 sm:p-8 plantform">
      {topRight && (
        <div className="mb-2 flex justify-end">{topRight}</div>
      )}

      {/* Mascot + bubble */}
      <div className="flex flex-col items-center text-center">
        <Smaarty size={104} />
        <div key={`b-${animKey}`} className={`mt-3 ${animClass}`}>
          <span className="wizard-bubble font-display">{bubble}</span>
        </div>

        {/* Dots */}
        <div className="mt-5 flex items-center gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`wizard-dot${n === step ? " is-active" : n < step ? " is-done" : ""}`}
              aria-label={`Steg ${n}`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div key={`s-${animKey}`} className={`mt-7 ${animClass}`}>
        {step === 1 && (
          <div>
            <div className="flex items-center justify-center gap-4 sm:gap-5">
              <button type="button" aria-label="Minska" className="plantform-step"
                onClick={() => setCount(Math.max(1, count - 1))}>−</button>
              <div className="plantform-count">
                <input
                  type="number" min={1} max={10000} value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
                  className="font-mono" aria-label="Antal träd"
                />
              </div>
              <button type="button" aria-label="Öka" className="plantform-step"
                onClick={() => setCount(Math.min(10000, count + 1))}>+</button>
            </div>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {QUICK_PICKS.map((n) => {
                const active = count === n;
                return (
                  <button key={n} type="button" onClick={() => setCount(n)}
                    className={`plantform-chip${active ? " is-active" : ""}`}>
                    {n} träd
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex justify-center">
              <div className="plantform-impact">
                <span aria-hidden>🌍</span>
                <span>
                  Binder ungefär <span className="font-mono font-semibold">{co2.toLocaleString("sv-SE")}</span> kg koldioxid varje år.
                </span>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mx-auto max-w-md">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Namn</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="t.ex. Sven Svensson" maxLength={120} className="plantform-input" />
            </div>
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium">E-post</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="sven@example.se" maxLength={255} className="plantform-input" />
            </div>
            <p className="mt-3 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
              Hen får sitt värdebevis på mejlen.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="mx-auto max-w-md">
            <div className="plantform-summary">
              <div className="min-w-0">
                <div className="font-display text-base font-semibold" style={{ color: "var(--forest)" }}>Din plantering</div>
                <div className="mt-0.5 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  <span className="font-mono">{count}</span> träd · ~<span className="font-mono">{co2.toLocaleString("sv-SE")}</span> kg CO₂/år
                </div>
                <div className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Till <span className="font-medium" style={{ color: "var(--forest)" }}>{name || "—"}</span>
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

            <button type="button" onClick={onSubmit} disabled={submitting} className="plantform-cta mt-5 w-full">
              <span className="plantform-cta-sprout" aria-hidden>🌱</span>
              <span className="whitespace-nowrap">
                {submitting ? "Planterar…" : `Plantera ${count} ${count === 1 ? "träd" : "träd"}`}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      {step < 3 && (
        <div className="mt-7 flex items-center justify-between gap-3">
          {step > 1 ? (
            <button type="button" onClick={back} className="btn-secondary !px-5 !py-2.5">← Tillbaka</button>
          ) : <span />}
          <button
            type="button" onClick={next} disabled={!canNext}
            className="btn-primary !px-6 !py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Nästa →
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" onClick={back} className="btn-secondary !px-5 !py-2.5">← Tillbaka</button>
          <span />
        </div>
      )}

      {footer}
    </section>
  );
}
