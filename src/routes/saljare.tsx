import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { useAuth } from "@/hooks/use-auth";
import { Certificate, snapshotToTemplate, type CertificateData } from "@/components/certificate";
import { downloadCertificateAsPdf } from "@/lib/download-certificate";
import { getSellerContext, sellerCreatePurchase } from "@/lib/seller.functions";

const PRICE_PER_TREE_ORE = 3500;
const QUICK_PICKS = [5, 10, 25, 100];

export const Route = createFileRoute("/saljare")({
  head: () => ({ meta: [{ title: "Säljarvy — SmartKlimat" }] }),
  component: SellerPage,
});

interface SellerCtx {
  isSeller: boolean;
  role?: string;
  team?: { id: string; name: string };
  organization?: { id: string; name: string; type: string };
  treeCount?: number;
  purchases?: { id: string; tree_count: number; total_amount_ore: number; created_at: string; recipient_name: string | null; recipient_email: string | null }[];
}

function formatKr(ore: number) { return `${(ore / 100).toLocaleString("sv-SE")} kr`; }
function formatDate(iso: string) { return new Date(iso).toLocaleDateString("sv-SE"); }

function SellerPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const ctxFn = useServerFn(getSellerContext);
  const purchaseFn = useServerFn(sellerCreatePurchase);

  const [ctx, setCtx] = useState<SellerCtx | null>(null);
  const [loading, setLoading] = useState(true);

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
    const r = (await ctxFn()) as SellerCtx;
    setCtx(r);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = (await ctxFn()) as SellerCtx;
        if (!cancelled) setCtx(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, navigate, ctxFn]);

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
      <main className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-20 pt-4">
        {loading ? (
          <div className="surface-card p-10 text-center" style={{ color: "var(--muted-foreground)" }}>Laddar…</div>
        ) : !ctx?.isSeller ? (
          <div className="surface-card p-10 text-center">
            <h1 className="font-display text-2xl font-semibold">Ingen säljarprofil</h1>
            <p className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Ditt konto är inte kopplat till något säljarteam. Kontakta administratören.
            </p>
          </div>
        ) : certificate ? (
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
              <button onClick={() => { setCertificate(null); setName(""); setEmail(""); setCount(10); }} className="btn-secondary">Registrera ytterligare</button>
            </div>
          </div>
        ) : (
          <>
            <div className="surface-card overflow-hidden p-8 text-center" style={{ background: "var(--gradient-mint)" }}>
              <div className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                {ctx.organization?.name} · {ctx.team?.name}
              </div>
              <div className="mt-4 font-mono text-6xl font-semibold leading-none" style={{ color: "var(--forest)" }}>
                {(ctx.treeCount ?? 0).toLocaleString("sv-SE")}
              </div>
              <div className="mt-3 text-base" style={{ color: "var(--forest)" }}>träd du har sålt</div>
            </div>

            <section className="surface-card mt-6 p-8">
              <h2 className="font-display text-2xl font-semibold">Registrera försäljning</h2>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Värdebeviset skickas till kundens e-post. Pris per träd: <span className="font-mono">35 kr</span>.
              </p>

              <div className="mt-6">
                <label className="mb-2 block text-sm font-medium">Antal träd</label>
                <div className="flex items-center gap-3">
                  <button type="button" className="btn-secondary !px-4 !py-2" onClick={() => setCount((c) => Math.max(1, c - 1))}>−</button>
                  <input type="number" min={1} max={10000} value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
                    className="input-field text-center font-mono text-lg !w-32" />
                  <button type="button" className="btn-secondary !px-4 !py-2" onClick={() => setCount((c) => Math.min(10000, c + 1))}>+</button>
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

              <button onClick={submit} disabled={submitting} className="btn-primary mt-6 w-full">
                {submitting ? "Bearbetar…" : "Bekräfta försäljning"}
              </button>
              <p className="mt-2 text-center text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>Betalning simuleras.</p>
            </section>

            <section className="surface-card mt-6 p-8">
              <h2 className="font-display text-xl font-semibold">Mina försäljningar</h2>
              {(ctx.purchases ?? []).length === 0 ? (
                <p className="mt-4 text-sm" style={{ color: "var(--muted-foreground)" }}>Inga försäljningar än.</p>
              ) : (
                <div className="mt-4 divide-y" style={{ borderColor: "var(--border)" }}>
                  {(ctx.purchases ?? []).map((p) => (
                    <div key={p.id} className="grid grid-cols-12 items-center gap-3 py-3 text-sm">
                      <div className="col-span-4 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{formatDate(p.created_at)}</div>
                      <div className="col-span-4">{p.recipient_name} <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{p.recipient_email}</span></div>
                      <div className="col-span-2 font-mono font-semibold" style={{ color: "var(--forest)" }}>{p.tree_count} träd</div>
                      <div className="col-span-2 text-right font-mono">{formatKr(p.total_amount_ore)}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
