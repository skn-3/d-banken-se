import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { Certificate, snapshotToTemplate, type CertificateData } from "@/components/certificate";
import { downloadCertificateAsPdf } from "@/lib/download-certificate";
import { createPurchase } from "@/lib/purchases.functions";
import { listActiveTemplates, moderateGreeting } from "@/lib/certificate-templates.functions";
import { listGreetingThemes } from "@/lib/greeting-themes.functions";
import { GreetingThemePicker, type GreetingThemeValue } from "@/components/greeting-theme-picker";
import { CertificateReveal } from "@/components/certificate-reveal";
import { PlantingForm } from "@/components/planting-form";

export const Route = createFileRoute("/kop")({
  head: () => ({
    meta: [
      { title: "Plantera träd — SmartKlimat" },
      { name: "description", content: "Plantera träd åt en kund. Inget konto behövs." },
      { property: "og:title", content: "Plantera träd — SmartKlimat" },
      { property: "og:description", content: "Plantera träd åt en kund. Inget konto behövs." },
      { property: "og:image", content: "https://app.smartklimat.org/kort/kort-collage.jpg" },
      { name: "twitter:image", content: "https://app.smartklimat.org/kort/kort-collage.jpg" },
    ],
  }),
  component: KopPage,
});

interface SnapshotCert {
  verification_id: string;
  recipient_name: string;
  tree_count: number;
  location_name: string;
  latitude: number | string;
  longitude: number | string;
  issued_date: string;
  greeting?: string | null;
  template_snapshot: Record<string, unknown>;
}

interface TemplateOption {
  id: string;
  name: string;
  category: string;
  accent_color: string;
  background_key: string;
  heading_text: string;
  thumbnail_url: string | null;
  allows_greeting: boolean;
  is_default: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
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
    greeting: row.greeting ?? null,
    template: snapshotToTemplate(row.template_snapshot),
  };
}

function KopPage() {
  const navigate = useNavigate();
  const purchaseFn = useServerFn(createPurchase);
  const listTemplates = useServerFn(listActiveTemplates);
  const moderateFn = useServerFn(moderateGreeting);

  const [count, setCount] = useState(10);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [certificate, setCertificate] = useState<CertificateData | null>(null);
  const [resultEmail, setResultEmail] = useState<string>("");
  const [emailSent, setEmailSent] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const certRef = useRef<HTMLDivElement>(null);

  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<string>("");
  const [greetingIssue, setGreetingIssue] = useState<string | null>(null);
  const [themeValue, setThemeValue] = useState<GreetingThemeValue>({ themeId: null, greeting: "" });
  const [themeResolved, setThemeResolved] = useState<Record<string, unknown> | null>(null);
  
  const loadThemes = useServerFn(listGreetingThemes);

  useEffect(() => {
    listTemplates().then((r) => {
      const opts = (r.templates ?? []) as TemplateOption[];
      setTemplates(opts);
      if (!templateId) {
        const def = opts.find((t) => t.is_default) ?? opts[0];
        if (def) setTemplateId(def.id);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = templates.find((t) => t.id === templateId) ?? null;
  const allowsGreeting = selected?.allows_greeting ?? false;

  const pay = async () => {
    setError(null);
    if (!name.trim()) { setError("Ange mottagarens namn."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError("Ange en giltig e-postadress."); return; }
    const effectiveGreeting = (themeValue.greeting.trim() || (allowsGreeting ? greeting.trim() : "")) || "";
    if (effectiveGreeting) {
      const check = await moderateFn({ data: { text: effectiveGreeting } });
      if (!check.ok) { setGreetingIssue(check.reason || "Ogiltig hälsning"); return; }
    }
    setSubmitting(true);
    try {
      const res = await purchaseFn({
        data: {
          treeCount: count,
          recipientName: name.trim(),
          recipientEmail: email.trim(),
          templateId,
          themeId: themeValue.themeId,
          greeting: effectiveGreeting || null,
        },
      });
      const certData = JSON.parse(res.certificateJson) as SnapshotCert & { theme?: unknown };
      setCertificate(rowToData(certData));
      setResultEmail(res.recipientEmail);
      setEmailSent(res.emailSent);
      // Resolve theme for reveal animation
      try {
        const list = await loadThemes();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = (list.themes as any[]).find((x) => x.id === themeValue.themeId) ?? null;
        setThemeResolved(t);
      } catch { /* ignore */ }
      
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
          <CertificateReveal theme={themeResolved} >
            <div className="space-y-6">
              <div className="surface-card p-8 text-center">
                <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--gradient-mint)" }}>
                  <span className="font-display text-2xl" style={{ color: "var(--forest)" }}>✓</span>
                </div>
                <h1 className="font-display text-3xl font-semibold">
                  Tack! {certificate.tree_count} {certificate.tree_count === 1 ? "träd planterat" : "träd planterade"}
                </h1>
                <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {emailSent
                    ? <>Värdebeviset har skickats till <span className="font-mono">{resultEmail}</span>.</>
                    : <>Planteringen är registrerad. Mejlet kunde inte skickas just nu — du kan ladda ner värdebeviset nedan.</>}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Verifierings-ID: <span className="font-mono">{certificate.verification_id}</span>
                </p>
              </div>

              <div className="overflow-x-auto flex justify-center">
                <Certificate ref={certRef} data={certificate} />
              </div>

              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={() => certRef.current && downloadCertificateAsPdf(certRef.current, certificate.verification_id)} className="btn-primary">Ladda ner som PDF</button>
                <Link to="/v/$id" params={{ id: certificate.verification_id }} className="btn-secondary">Öppna publik sida</Link>
                <button
                  onClick={() => { setCertificate(null); setName(""); setEmail(""); setCount(10); setGreeting(""); setThemeValue({ themeId: themeValue.themeId, greeting: "" }); }}
                  className="btn-secondary"
                >Plantera fler träd</button>
              </div>
            </div>
          </CertificateReveal>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            <PlantingForm
              count={count} setCount={setCount}
              name={name} setName={setName}
              email={email} setEmail={setEmail}
              error={error} submitting={submitting}
              onSubmit={pay}
              footer={
                <>
                  <p className="mt-3 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
                    35 kr per träd. Betalning simuleras i detta steg.
                  </p>
                  <p className="mt-2 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
                    <button onClick={() => navigate({ to: "/auth" })} className="underline" style={{ color: "var(--primary)" }}>
                      Se en kunds trädbank
                    </button>
                  </p>
                </>
              }
            />

            <GreetingThemePicker value={themeValue} onChange={setThemeValue} />


            {templates.length > 0 && (
              <section className="surface-card p-6">
                <h2 className="font-display text-lg font-semibold">Välj ditt bevis</h2>
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Standardbeviset ingår. Tillvalen ger beviset personlighet.
                </p>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {templates.map((t) => {
                    const active = t.id === templateId;
                    return (
                      <button
                        key={t.id} type="button" onClick={() => setTemplateId(t.id)}
                        className="rounded-2xl p-3 text-left transition"
                        style={{
                          border: active ? `2px solid ${t.accent_color}` : "1px solid var(--border)",
                          background: active ? "var(--mint-paper)" : "var(--card)",
                        }}
                      >
                        <div className="aspect-[4/5] rounded-lg mb-2 flex items-center justify-center overflow-hidden" style={{ background: t.accent_color + "22" }}>
                          {t.thumbnail_url
                            ? <img src={t.thumbnail_url} alt={t.name} className="w-full h-full object-cover" />
                            : <span className="font-display text-3xl" style={{ color: t.accent_color }}>🌳</span>}
                        </div>
                        <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                          {t.category === "tillval" ? "Tillval" : "Standard"}
                        </div>
                        <div className="font-medium text-sm mt-0.5">{t.name}</div>
                      </button>
                    );
                  })}
                </div>

                {allowsGreeting && (
                  <div className="mt-5">
                    <label className="mb-1.5 block text-sm font-medium">Personlig hälsning (valfritt)</label>
                    <textarea
                      value={greeting}
                      onChange={(e) => { setGreeting(e.target.value.slice(0, 120)); setGreetingIssue(null); }}
                      placeholder="T.ex. Grattis på födelsedagen från oss alla!"
                      maxLength={120}
                      rows={2}
                      className="plantform-input w-full resize-none"
                    />
                    <div className="mt-1 flex justify-between text-xs" style={{ color: "var(--muted-foreground)" }}>
                      <span>{greetingIssue ? <span style={{ color: "var(--destructive)" }}>{greetingIssue}</span> : "Renderas synligt på beviset."}</span>
                      <span>{greeting.length}/120</span>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

