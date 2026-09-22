import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getClaimInfo, claimCertificate, type ClaimStatus } from "@/lib/claim.functions";

export const Route = createFileRoute("/h/$code")({
  head: ({ params }) => ({
    meta: [
      { title: "Hämta ditt värdebevis — SmartKlimat" },
      { name: "description", content: "Dina träd är redan planterade. Hämta ditt personliga värdebevis från SmartKlimat." },
      { property: "og:title", content: "Hämta ditt värdebevis — SmartKlimat" },
      { property: "og:description", content: "Dina träd är redan planterade. Hämta ditt personliga värdebevis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    ...(params.code ? {} : {}),
  }),
  component: ClaimPage,
});

const CONSENT_TEXT =
  "Jag godkänner att SmartKlimatKompensera på Tellus AB (SmartKlimat) behandlar mitt namn och min e-postadress för att utfärda mitt digitala värdebevis och skicka det via e-post. Jag kan när som helst återkalla samtycket via länk i mailet eller på smartklimat.org/integritet.";

const INK = "#0B3D2E";
const MUTED = "#4F6B5E";
const GOLD = "#DCBE6E";

function ClaimPage() {
  const { code } = Route.useParams();
  const fetchInfo = useServerFn(getClaimInfo);
  const doClaim = useServerFn(claimCertificate);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ClaimStatus>("unknown");
  const [trees, setTrees] = useState(0);
  const [verificationId, setVerificationId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [updates, setUpdates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await fetchInfo({ data: { code } });
        if (cancelled) return;
        setStatus(info.status);
        setTrees(info.trees);
        setVerificationId(info.verification_id);
      } catch (err) {
        console.error("[h/$code] kunde inte läsa hämtningskod", err);
        if (!cancelled) setStatus("unknown");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code, fetchInfo]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) { setError("Ange ditt namn."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError("Ange en giltig e-postadress."); return; }
    if (!consent) { setError("Du behöver godkänna hanteringen av namn och e-post."); return; }
    setSaving(true);
    try {
      const res = await doClaim({
        data: { code, name: name.trim(), email: email.trim(), consentCertificate: true, consentUpdates: updates },
      });
      setVerificationId(res.verification_id);
      setStatus("claimed");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel. Försök igen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen w-full" style={{ background: "#EAF7EE" }}>
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
        <div className="rounded-3xl border bg-white p-6 shadow-sm" style={{ borderColor: "rgba(11,61,46,0.10)" }}>
          <div className="flex items-center justify-between gap-4">
            <img src="/brand/mockfjards-badge.png" alt="Mockfjärds" style={{ height: 48, width: "auto", objectFit: "contain" }} />
            <div className="text-right">
              <div className="font-display text-base font-semibold" style={{ color: INK }}>SmartKlimat</div>
              <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: MUTED }}>Värdebevis</div>
            </div>
          </div>

          <div className="mt-5 h-px w-full" style={{ background: GOLD }} />

          {loading && <p className="mt-6 text-sm" style={{ color: MUTED }}>Hämtar ditt ärende…</p>}

          {!loading && status === "unknown" && (
            <div className="mt-6">
              <h1 className="font-display text-2xl font-semibold" style={{ color: INK }}>Koden hittades inte</h1>
              <p className="mt-2 text-sm" style={{ color: MUTED }}>
                Kontrollera länken eller QR-koden du fick. Koden <span className="font-mono">{code}</span> finns inte i vårt register.
              </p>
            </div>
          )}

          {!loading && (status === "claimed" || status === "revoked") && !done && (
            <div className="mt-6">
              <h1 className="font-display text-2xl font-semibold" style={{ color: INK }}>
                {status === "revoked" ? "Samtycket är återkallat" : "Beviset är redan hämtat"}
              </h1>
              <p className="mt-2 text-sm" style={{ color: MUTED }}>
                {status === "revoked"
                  ? "Ditt namn och din e-post är borttagna. Beviset finns kvar anonymt."
                  : "Det här ärendets värdebevis är redan personaliserat."}
              </p>
              {verificationId && (
                <Link
                  to="/v/$id"
                  params={{ id: verificationId }}
                  className="mt-5 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold text-white"
                  style={{ background: INK }}
                >
                  Visa värdebeviset
                </Link>
              )}
            </div>
          )}

          {!loading && done && verificationId && (
            <div className="mt-6">
              <h1 className="font-display text-2xl font-semibold" style={{ color: INK }}>Tack, {name.trim()}!</h1>
              <p className="mt-2 text-sm" style={{ color: MUTED }}>
                Ditt värdebevis är utfärdat och skickat till {email.trim()}.
              </p>
              <Link
                to="/v/$id"
                params={{ id: verificationId }}
                className="mt-5 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold text-white"
                style={{ background: INK }}
              >
                Visa värdebeviset
              </Link>
            </div>
          )}

          {!loading && status === "open" && !done && (
            <>
              <div className="mt-6 text-center">
                <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: MUTED }}>Planterade träd</div>
                <div className="font-display text-6xl font-bold leading-none" style={{ color: INK }}>{trees.toLocaleString("sv-SE")}</div>
                <h1 className="mt-4 font-display text-xl font-semibold" style={{ color: INK }}>
                  Dina träd är redan planterade — hämta ditt personliga värdebevis
                </h1>
              </div>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-xs font-semibold" style={{ color: INK }}>Namn</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    className="mt-1 w-full rounded-xl border px-3 py-3 text-base outline-none"
                    style={{ borderColor: "rgba(11,61,46,0.18)" }}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold" style={{ color: INK }}>E-post</span>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className="mt-1 w-full rounded-xl border px-3 py-3 text-base outline-none"
                    style={{ borderColor: "rgba(11,61,46,0.18)" }}
                  />
                </label>

                <label className="flex gap-3 text-xs leading-relaxed" style={{ color: MUTED }}>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    aria-label="Samtycke till behandling av namn och e-post"
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>{CONSENT_TEXT}</span>
                </label>

                <label className="flex gap-3 text-xs leading-relaxed" style={{ color: MUTED }}>
                  <input
                    type="checkbox"
                    checked={updates}
                    onChange={(e) => setUpdates(e.target.checked)}
                    aria-label="Få uppdateringar om trädens utveckling"
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>Följ dina träd — jag vill få uppdateringar om trädens utveckling.</span>
                </label>

                <p className="text-xs" style={{ color: MUTED }}>
                  Läs mer i vår <Link to="/integritet" className="underline">integritetspolicy</Link>.
                </p>

                {error && <p className="text-sm" style={{ color: "#B3261E" }}>{error}</p>}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-full px-5 py-3.5 text-sm font-semibold text-white"
                  style={{ background: INK, opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? "Hämtar…" : "Hämta mitt värdebevis"}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
