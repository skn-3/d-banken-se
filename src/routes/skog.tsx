import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyForest, createBillingPortalSession, type MyForestData } from "@/lib/skog.functions";
import { SiteHeader, SiteFooter, Blobs } from "@/components/site-chrome";

const SkogMap = lazy(() => import("@/components/skog-map").then((m) => ({ default: m.SkogMap })));

export const Route = createFileRoute("/skog")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Min skog — SmartKlimat" },
      { name: "description", content: "Se dina planterade träd, bevis och kartan över dina planteringsplatser." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SkogPage,
});

type AuthState = "loading" | "signed_out" | "signed_in";

function SkogPage() {
  const [auth, setAuth] = useState<AuthState>("loading");

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setAuth(data.user ? "signed_in" : "signed_out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuth(session?.user ? "signed_in" : "signed_out");
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className="relative z-10 mx-auto w-full max-w-4xl px-6 pb-20 pt-6">
        {auth === "loading" && <div className="mt-16 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Laddar…</div>}
        {auth === "signed_out" && <SignInCard />}
        {auth === "signed_in" && <ForestView />}
      </main>
      <SiteFooter />
    </div>
  );
}

function SignInCard() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/skog`,
        },
      });
      if (error) throw error;
      setInfo("Kolla din inkorg — vi har skickat en inloggningslänk till " + email + ".");
    } catch (err) {
      setError((err as Error).message);
    } finally { setLoading(false); }
  }

  return (
    <div className="mx-auto mt-8 max-w-md">
      <div className="surface-card p-8">
        <h1 className="font-display text-3xl font-semibold">Min skog</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          Ange din e-post så skickar vi en inloggningslänk. Ingen lösenord behövs.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">E-post</label>
            <input className="input-field" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}>{error}</div>}
          {info && <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--forest)" }}>{info}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Skickar…" : "Skicka länk"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ForestView() {
  const fetchForest = useServerFn(getMyForest);
  const openPortal = useServerFn(createBillingPortalSession);
  const [data, setData] = useState<MyForestData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchForest({})
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr((e as Error).message); });
    return () => { cancelled = true; };
  }, [fetchForest]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const res = await openPortal({});
      window.location.href = res.url;
    } catch (e) {
      alert("Kunde inte öppna prenumerations-portal: " + (e as Error).message);
    } finally { setPortalLoading(false); }
  }

  if (err) return <div className="mt-16 text-center text-sm" style={{ color: "var(--destructive)" }}>{err}</div>;
  if (!data) return <div className="mt-16 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Laddar din skog…</div>;

  const memberSince = data.firstPurchaseAt
    ? new Date(data.firstPurchaseAt).toLocaleDateString("sv-SE", { year: "numeric", month: "long" })
    : "—";

  const points = data.certificates
    .filter((c) => c.latitude != null && c.longitude != null)
    .map((c) => ({
      id: c.id,
      lat: c.latitude as number,
      lng: c.longitude as number,
      label: `${c.tree_count} träd`,
      sublabel: c.location_name ?? undefined,
    }));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Din skog</div>
          <h1 className="font-display text-4xl font-semibold" style={{ color: "var(--forest)" }}>Hej {data.email}</h1>
        </div>
        <button onClick={signOut} className="text-xs underline" style={{ color: "var(--muted-foreground)" }}>Logga ut</button>
      </header>

      {/* Hero stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Träd planterade" value={data.totalTrees.toLocaleString("sv-SE")} />
        <StatCard label="CO₂ bundet / år" value={`${(data.totalCo2Kg).toLocaleString("sv-SE")} kg`} />
        <StatCard label="Medlem sedan" value={memberSince} />
      </div>

      {/* Subscription */}
      {data.subscription.active && (
        <section className="surface-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Din månadsplantering</div>
              <div className="mt-1 font-display text-xl font-semibold" style={{ color: "var(--forest)" }}>
                {data.subscription.nextChargeAt
                  ? `Nästa dragning: ${new Date(data.subscription.nextChargeAt * 1000).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" })}`
                  : "Aktiv prenumeration"}
              </div>
            </div>
            <button onClick={handlePortal} disabled={portalLoading} className="btn-primary">
              {portalLoading ? "Öppnar…" : "Hantera prenumeration"}
            </button>
          </div>
        </section>
      )}

      {/* Map */}
      {points.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-2xl font-semibold" style={{ color: "var(--forest)" }}>Dina planteringar</h2>
          <Suspense fallback={<div className="h-[360px] w-full rounded-2xl border" style={{ borderColor: "var(--border)" }} />}>
            <SkogMap points={points} />
          </Suspense>
        </section>
      )}

      {/* Certificate gallery */}
      <section>
        <h2 className="mb-3 font-display text-2xl font-semibold" style={{ color: "var(--forest)" }}>Dina bevis ({data.certificates.length})</h2>
        {data.certificates.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Inga bevis än — plantera dina första träd nedan.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {data.certificates.map((c) => (
              <CertCard key={c.id} cert={c} />
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="surface-card flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <div className="font-display text-xl font-semibold" style={{ color: "var(--forest)" }}>Plantera fler träd</div>
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Din skog växer med varje träd — ge bort eller plantera själv.</div>
        </div>
        <div className="flex gap-3">
          <Link to="/plantera" className="btn-primary">Plantera fler</Link>
          <Link to="/plantera" className="btn-primary" style={{ background: "var(--gold, #DCBE6E)", color: "#0B3D2E" }}>Ge bort träd</Link>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-6 text-center">
      <div className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="mt-2 font-display text-3xl font-semibold" style={{ color: "var(--forest)" }}>{value}</div>
    </div>
  );
}

function CertCard({ cert }: { cert: { id: string; verification_id: string; theme_slug: string | null; tree_count: number; issued_date: string } }) {
  const slug = cert.theme_slug;
  const thumb = slug ? `/kort/kort-${slug}.jpg` : "/kort/kort-collage.jpg";

  const shareUrl = `/v/${cert.verification_id}`;
  const [copied, setCopied] = useState(false);

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  return (
    <div className="surface-card overflow-hidden p-0">
      <Link to="/v/$id" params={{ id: cert.verification_id }} className="block">
        <img
          src={thumb}
          alt={`Bevis ${cert.verification_id}`}
          className="aspect-[3/4] w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/kort/kort-standard.jpg"; }}
        />
      </Link>
      <div className="p-3">
        <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{cert.verification_id}</div>
        <div className="mt-1 text-sm font-medium">{cert.tree_count} träd</div>
        <div className="mt-2 flex gap-2">
          <Link to="/v/$id" params={{ id: cert.verification_id }} className="text-xs underline" style={{ color: "var(--primary)" }}>Ladda ner</Link>
          <button onClick={copyShare} className="text-xs underline" style={{ color: "var(--primary)" }}>
            {copied ? "Kopierad!" : "Dela"}
          </button>
        </div>
      </div>
    </div>
  );
}
