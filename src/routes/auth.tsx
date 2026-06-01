import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, Blobs } from "@/components/site-chrome";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Logga in eller skapa konto — SmartKlimat" },
      { name: "description", content: "Logga in eller skapa ett SmartKlimat-konto för att börja plantera träd." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name, account_type: "privat" },
            emailRedirectTo: `${window.location.origin}/konto`,
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/konto" });
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

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-col px-6 pb-20 pt-10">
        <div className="surface-card p-8">
          <h1 className="font-display text-3xl font-semibold">
            {mode === "login" ? "Välkommen tillbaka" : "Skapa konto"}
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
            {mode === "login"
              ? "Logga in för att se din trädbank."
              : "Det tar 30 sekunder. Inget kort behövs nu."}
          </p>

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
            <div>
              <label className="mb-1.5 block text-sm font-medium">Lösenord</label>
              <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
            </div>

            {error && (
              <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--destructive)", color: "var(--destructive)", background: "rgba(179,38,30,0.05)" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Vänta…" : mode === "login" ? "Logga in" : "Skapa konto"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
            {mode === "login" ? (
              <>Ny här?{" "}
                <button onClick={() => { setMode("signup"); setError(null); }} className="font-medium underline" style={{ color: "var(--primary)" }}>
                  Skapa konto
                </button>
              </>
            ) : (
              <>Har du redan ett konto?{" "}
                <button onClick={() => { setMode("login"); setError(null); }} className="font-medium underline" style={{ color: "var(--primary)" }}>
                  Logga in
                </button>
              </>
            )}
          </div>
        </div>
        <Link to="/" className="mx-auto mt-6 text-sm" style={{ color: "var(--muted-foreground)" }}>← Tillbaka till start</Link>
      </main>
    </div>
  );
}
