import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader, Blobs } from "@/components/site-chrome";

const PRICE_PER_TREE_ORE = 3500; // 35 kr

export const Route = createFileRoute("/kop")({
  head: () => ({
    meta: [
      { title: "Plantera träd — SmartKlimat" },
      { name: "description", content: "Välj antal träd och bidra till riktig plantering." },
    ],
  }),
  component: KopPage,
});

const QUICK_PICKS = [5, 10, 25, 100];

function formatKr(ore: number) {
  return `${(ore / 100).toLocaleString("sv-SE")} kr`;
}

function KopPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => count * PRICE_PER_TREE_ORE, [count]);

  const pay = async () => {
    setError(null);
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setSubmitting(true);
    try {
      // Simulated payment: create a paid purchase directly.
      // Stripe-koppling läggs in i ett senare byggsteg.
      const { error } = await supabase.from("purchases").insert({
        user_id: user.id,
        tree_count: count,
        unit_price_ore: PRICE_PER_TREE_ORE,
        total_amount_ore: total,
        status: "paid",
        paid_at: new Date().toISOString(),
      });
      if (error) throw error;
      setDone(count);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />

      <main className="relative z-10 mx-auto w-full max-w-2xl px-6 pb-20 pt-8">
        {done !== null ? (
          <div className="surface-card p-10 text-center">
            <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "var(--gradient-mint)" }}>
              <span className="font-display text-3xl" style={{ color: "var(--forest)" }}>✓</span>
            </div>
            <h1 className="font-display text-3xl font-semibold">Tack!</h1>
            <p className="mt-3 text-base" style={{ color: "var(--muted-foreground)" }}>
              Du har planterat <span className="font-mono font-semibold" style={{ color: "var(--forest)" }}>{done}</span> träd.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button onClick={() => navigate({ to: "/konto" })} className="btn-primary">Till min trädbank</button>
              <button onClick={() => { setDone(null); setCount(10); }} className="btn-secondary">Plantera fler</button>
            </div>
          </div>
        ) : (
          <div className="surface-card p-8">
            <h1 className="font-display text-3xl font-semibold">Plantera träd</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Välj antal. Pris per träd: <span className="font-mono">35 kr</span>.
            </p>

            <div className="mt-8">
              <label className="mb-2 block text-sm font-medium">Antal träd</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn-secondary !px-4 !py-2"
                  onClick={() => setCount((c) => Math.max(1, c - 1))}
                >−</button>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
                  className="input-field text-center font-mono text-lg !w-32"
                />
                <button
                  type="button"
                  className="btn-secondary !px-4 !py-2"
                  onClick={() => setCount((c) => Math.min(10000, c + 1))}
                >+</button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {QUICK_PICKS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    className="chip hover:!bg-[color:var(--mint)]"
                    style={{ cursor: "pointer", background: count === n ? "var(--mint)" : undefined }}
                  >
                    {n} träd
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 rounded-2xl p-6" style={{ background: "var(--mint-paper)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Totalt</span>
                <span className="font-mono text-3xl font-semibold" style={{ color: "var(--forest)" }}>
                  {formatKr(total)}
                </span>
              </div>
              <div className="mt-1 text-right text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                {count} × 35,00 kr
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}>
                {error}
              </div>
            )}

            <button
              onClick={pay}
              disabled={submitting || authLoading}
              className="btn-primary mt-6 w-full"
            >
              {submitting ? "Bearbetar…" : user ? "Bekräfta köp" : "Logga in för att fortsätta"}
            </button>
            <p className="mt-3 text-center text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
              Betalning simuleras i detta byggsteg.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
