import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { Certificate, snapshotToTemplate, type CertificateData } from "@/components/certificate";
import { downloadCertificateAsPdf } from "@/lib/download-certificate";
import { createPurchase } from "@/lib/purchases.functions";

const PRICE_PER_TREE_ORE = 3500;

export const Route = createFileRoute("/kop")({
  head: () => ({
    meta: [
      { title: "Plantera träd — SmartKlimat" },
      { name: "description", content: "Registrera en plantering åt en kund. Inloggning krävs inte." },
    ],
  }),
  component: KopPage,
});

const QUICK_PICKS = [5, 10, 25, 100];

function formatKr(ore: number) {
  return `${(ore / 100).toLocaleString("sv-SE")} kr`;
}

interface SnapshotCert {
  verification_id: string;
  recipient_name: string;
  tree_count: number;
  location_name: string;
  latitude: number | string;
  longitude: number | string;
  issued_date: string;
  template_snapshot: Record<string, unknown>;
}

function rowToData(row: SnapshotCert): CertificateData {
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
  const navigate = useNavigate();
  const purchaseFn = useServerFn(createPurchase);

  const [count, setCount] = useState(10);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [certificate, setCertificate] = useState<CertificateData | null>(null);
  const [resultEmail, setResultEmail] = useState<string>("");
  const [emailSent, setEmailSent] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const certRef = useRef<HTMLDivElement>(null);

  const total = useMemo(() => count * PRICE_PER_TREE_ORE, [count]);

  const pay = async () => {
    setError(null);
    if (!name.trim()) { setError("Ange mottagarens namn."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Ange en giltig e-postadress.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await purchaseFn({
        data: { treeCount: count, recipientName: name.trim(), recipientEmail: email.trim() },
      });
      const certData = JSON.parse(res.certificateJson) as SnapshotCert;
      setCertificate(rowToData(certData));
      setResultEmail(res.recipientEmail);
      setEmailSent(res.emailSent);
    } catch (err) {
      setError((err as Error).message || "Något gick fel.");
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
              <h1 className="font-display text-3xl font-semibold">
                Tack! {certificate.tree_count} träd planterade
              </h1>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                {emailSent
                  ? <>Värdebeviset har skickats till <span className="font-mono">{resultEmail}</span>.</>
                  : <>Köpet är registrerat. Mailet kunde inte skickas just nu — du kan ladda ner värdebeviset nedan.</>}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
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
              <button
                onClick={() => {
                  setCertificate(null); setName(""); setEmail(""); setCount(10);
                }}
                className="btn-secondary"
              >Registrera ett till köp</button>
            </div>
          </div>
        ) : (
          <div className="surface-card p-8 max-w-2xl mx-auto">
            <h1 className="font-display text-3xl font-semibold">Registrera en plantering</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Värdebeviset och kvittot skickas till kundens e-post. Ingen inloggning krävs.
              Pris per träd: <span className="font-mono">35 kr</span>.
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

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Mottagarens namn</label>
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Sven Svensson" maxLength={120}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Mottagarens e-post</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="sven@example.se" maxLength={255}
                  className="input-field w-full"
                />
              </div>
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
              E-posten knyter träden till kunden. Samma e-post över tid hamnar i samma trädbank.
            </p>

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

            <button onClick={pay} disabled={submitting} className="btn-primary mt-6 w-full whitespace-nowrap">
              {submitting ? "Planterar…" : `🌱 Plantera ${count} ${count === 1 ? "träd" : "träd"}`}
            </button>
            <p className="mt-3 text-center text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
              Betalning simuleras i detta byggsteg.
            </p>
            <p className="mt-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
              Vill du se en kunds trädbank? <button onClick={() => navigate({ to: "/auth" })} className="underline" style={{ color: "var(--primary)" }}>Logga in med kundens e-post</button>.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
