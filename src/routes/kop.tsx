import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { Certificate, snapshotToTemplate, type CertificateData } from "@/components/certificate";
import { downloadCertificateAsPdf } from "@/lib/download-certificate";

const PRICE_PER_TREE_ORE = 3500;

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

interface CertificateRow {
  verification_id: string;
  recipient_name: string;
  tree_count: number;
  location_name: string;
  latitude: number | string;
  longitude: number | string;
  issued_date: string;
  template_snapshot: Record<string, unknown>;
}

function rowToData(row: CertificateRow): CertificateData {
  return {
    verification_id: row.verification_id,
    recipient_name: row.recipient_name,
    tree_count: row.tree_count,
    location_name: row.location_name,
    latitude: row.latitude,
    longitude: row.longitude,
    issued_date: row.issued_date,
    template: snapshotToTemplate(row.template_snapshot),
  };
}

function KopPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [certificate, setCertificate] = useState<CertificateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const certRef = useRef<HTMLDivElement>(null);

  const total = useMemo(() => count * PRICE_PER_TREE_ORE, [count]);

  const pay = async () => {
    setError(null);
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setSubmitting(true);
    try {
      const { data: purchase, error: purchaseErr } = await supabase
        .from("purchases")
        .insert({
          user_id: user.id,
          tree_count: count,
          unit_price_ore: PRICE_PER_TREE_ORE,
          total_amount_ore: total,
          status: "paid",
          paid_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (purchaseErr) throw purchaseErr;

      const { data: cert, error: certErr } = await supabase.rpc("generate_certificate", {
        _purchase_id: purchase.id,
      });
      if (certErr) throw certErr;
      setCertificate(rowToData(cert as CertificateRow));
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

      <main className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-20 pt-8">
        {certificate ? (
          <div className="space-y-6">
            <div className="surface-card p-8 text-center">
              <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--gradient-mint)" }}>
                <span className="font-display text-2xl" style={{ color: "var(--forest)" }}>✓</span>
              </div>
              <h1 className="font-display text-3xl font-semibold">Tack — här är ditt värdebevis</h1>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Verifierings-ID: <span className="font-mono">{certificate.verification_id}</span>
              </p>
            </div>

            <div className="overflow-x-auto flex justify-center">
              <Certificate ref={certRef} data={certificate} />
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => certRef.current && downloadCertificateAsPdf(certRef.current, certificate.verification_id)}
                className="btn-primary"
              >Ladda ner som PDF</button>
              <Link to="/v/$id" params={{ id: certificate.verification_id }} className="btn-secondary">Öppna publik sida</Link>
              <button onClick={() => navigate({ to: "/konto" })} className="btn-secondary">Till min trädbank</button>
            </div>
          </div>
        ) : (
          <div className="surface-card p-8 max-w-2xl mx-auto">
            <h1 className="font-display text-3xl font-semibold">Plantera träd</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Välj antal. Pris per träd: <span className="font-mono">35 kr</span>.
            </p>

            <div className="mt-8">
              <label className="mb-2 block text-sm font-medium">Antal träd</label>
              <div className="flex items-center gap-3">
                <button type="button" className="btn-secondary !px-4 !py-2" onClick={() => setCount((c) => Math.max(1, c - 1))}>−</button>
                <input
                  type="number" min={1} max={10000} value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
                  className="input-field text-center font-mono text-lg !w-32"
                />
                <button type="button" className="btn-secondary !px-4 !py-2" onClick={() => setCount((c) => Math.min(10000, c + 1))}>+</button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {QUICK_PICKS.map((n) => (
                  <button key={n} type="button" onClick={() => setCount(n)} className="chip hover:!bg-[color:var(--mint)]"
                    style={{ cursor: "pointer", background: count === n ? "var(--mint)" : undefined }}>
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

            <button onClick={pay} disabled={submitting || authLoading} className="btn-primary mt-6 w-full">
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
