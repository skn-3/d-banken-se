import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, Blobs } from "@/components/site-chrome";

export const Route = createFileRoute("/aktivera")({
  head: () => ({ meta: [{ title: "Välkommen till Smaarty — aktivera ditt konto" }] }),
  component: ActivatePage,
});

function ActivatePage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [alreadyActivated, setAlreadyActivated] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setHasSession(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasSession(true);
      // If the URL had no hash tokens AND there's no session, link is likely consumed or invalid.
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const hasRecovery = hash.includes("type=recovery") || hash.includes("access_token");
      if (!data.session && !hasRecovery) setAlreadyActivated(true);
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError("Lösenorden matchar inte."); return; }
    if (password.length < 8) { setError("Minst 8 tecken."); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => navigate({ to: "/saljare" }), 1500);
  };

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-col px-6 pb-20 pt-10">
        <div className="surface-card p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
               style={{ background: "var(--mint-paper, #EAF7EE)", color: "var(--forest, #0B3D2E)" }}>
            🌱
          </div>
          <h1 className="text-center font-display text-3xl font-semibold">Välkommen till Smaarty!</h1>
          <p className="mt-2 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
            Sätt ditt lösenord för att komma igång och plantera ditt första träd.
          </p>

          {!ready && <p className="mt-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Laddar…</p>}

          {ready && !hasSession && alreadyActivated && (
            <div className="mt-6 space-y-3 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
              <p>Den här länken är redan använd eller har gått ut.</p>
              <p>
                Om du redan har aktiverat ditt konto,{" "}
                <Link to="/auth" className="font-medium underline" style={{ color: "var(--primary)" }}>logga in här</Link>.
              </p>
              <p className="text-xs">
                Annars: be din admin/lärare att skicka en ny inbjudan.
              </p>
            </div>
          )}

          {ready && !hasSession && !alreadyActivated && (
            <p className="mt-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
              Länken kunde inte verifieras. Be din admin/lärare att skicka en ny inbjudan, eller{" "}
              <Link to="/auth" className="underline" style={{ color: "var(--primary)" }}>logga in</Link> om du redan har ett konto.
            </p>
          )}

          {ready && hasSession && !done && (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Välj lösenord</label>
                <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Bekräfta lösenord</label>
                <input className="input-field" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" />
              </div>
              {error && (
                <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--destructive)", color: "var(--destructive)", background: "rgba(179,38,30,0.05)" }}>
                  {error}
                </div>
              )}
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? "Aktiverar…" : "Aktivera mitt konto"}
              </button>
            </form>
          )}

          {done && (
            <p className="mt-6 text-center text-sm" style={{ color: "var(--forest)" }}>
              Klart! Tar dig till din säljarvy…
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
