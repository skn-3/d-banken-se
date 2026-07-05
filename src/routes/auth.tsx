import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestPasswordReset, requestSignupConfirmation } from "@/lib/auth-email.functions";
import { SiteHeader, SiteFooter, Blobs, TAGLINE } from "@/components/site-chrome";
import logo3d from "@/assets/logos/smartklimat-3d.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Logga in eller skapa konto — SmartKlimat" },
      { name: "description", content: "Logga in eller skapa ett SmartKlimat-konto för att börja plantera träd." },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sendReset = useServerFn(requestPasswordReset);
  const sendSignupConfirmation = useServerFn(requestSignupConfirmation);

  const switchMode = (m: Mode) => { setMode(m); setError(null); setInfo(null); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        await sendSignupConfirmation({
          data: { email, password, name, accountType: "privat", redirectTo: `${window.location.origin}/konto` },
        });
        setInfo("Vi har skickat ett bekräftelsemail. Öppna länken för att aktivera kontot.");
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/konto" });
      } else {
        const res = await sendReset({
          data: { email, redirectTo: `${window.location.origin}/reset-password` },
        });
        setInfo(res.message);
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("already registered") || msg.includes("already been registered")) {
        setError("E-postadressen används redan.");
      } else if (msg.includes("Invalid login")) {
        setError("Fel e-postadress eller lösenord.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === "login" ? "Välkommen tillbaka"
    : mode === "signup" ? "Skapa konto"
    : "Återställ lösenord";

  const subtitle =
    mode === "login" ? "Logga in för att se din trädbank."
    : mode === "signup" ? "Det tar 30 sekunder. Inget kort behövs nu."
    : "Ange din e-post så skickar vi en länk för att sätta ett nytt lösenord.";

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-col px-6 pb-20 pt-6">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={logo3d.url} alt="SmartKlimat" className="h-28 w-auto select-none" draggable={false} />
          <p className="mt-3 font-display text-sm" style={{ color: "var(--muted-foreground)" }}>{TAGLINE}</p>
        </div>
        <div className="surface-card p-8">
          <h1 className="font-display text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>{subtitle}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium">Namn</label>
                <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium">E-post</label>
              <input className="input-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            {mode !== "forgot" && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-sm font-medium">Lösenord</label>
                  {mode === "login" && (
                    <button type="button" onClick={() => switchMode("forgot")} className="text-xs font-medium underline" style={{ color: "var(--primary)" }}>
                      Glömt lösenord?
                    </button>
                  )}
                </div>
                <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
              </div>
            )}

            {error && (
              <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--destructive)", color: "var(--destructive)", background: "rgba(179,38,30,0.05)" }}>
                {error}
              </div>
            )}
            {info && (
              <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--forest)", background: "rgba(30,158,106,0.06)" }}>
                {info}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Vänta…"
                : mode === "login" ? "Logga in"
                : mode === "signup" ? "Skapa konto"
                : "Skicka återställningslänk"}
            </button>
          </form>

          <div className="mt-6 space-y-2 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
            {mode === "login" && (
              <>
                <div>
                  Ny här?{" "}
                  <button onClick={() => switchMode("signup")} className="font-medium underline" style={{ color: "var(--primary)" }}>
                    Skapa konto
                  </button>
                </div>
              </>
            )}
            {mode === "signup" && (
              <div>
                Har du redan ett konto?{" "}
                <button onClick={() => switchMode("login")} className="font-medium underline" style={{ color: "var(--primary)" }}>
                  Logga in
                </button>
              </div>
            )}
            {mode === "forgot" && (
              <div>
                <button onClick={() => switchMode("login")} className="font-medium underline" style={{ color: "var(--primary)" }}>
                  ← Tillbaka till inloggning
                </button>
              </div>
            )}
          </div>
        </div>
        <Link to="/" className="mx-auto mt-6 text-sm" style={{ color: "var(--muted-foreground)" }}>← Tillbaka till start</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
