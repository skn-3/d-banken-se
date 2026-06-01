import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, Blobs } from "@/components/site-chrome";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Sätt nytt lösenord — SmartKlimat" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash automatically and emits PASSWORD_RECOVERY.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setHasSession(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasSession(true);
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
    setTimeout(() => navigate({ to: "/konto" }), 1500);
  };

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-col px-6 pb-20 pt-10">
        <div className="surface-card p-8">
          <h1 className="font-display text-3xl font-semibold">Sätt nytt lösenord</h1>

          {!ready && <p className="mt-4 text-sm" style={{ color: "var(--muted-foreground)" }}>Laddar…</p>}

          {ready && !hasSession && (
            <p className="mt-4 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Länken är ogiltig eller har gått ut. Begär en ny återställning på{" "}
              <Link to="/auth" className="underline" style={{ color: "var(--primary)" }}>inloggningssidan</Link>.
            </p>
          )}

          {ready && hasSession && !done && (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Nytt lösenord</label>
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
                {saving ? "Sparar…" : "Spara nytt lösenord"}
              </button>
            </form>
          )}

          {done && (
            <p className="mt-6 text-sm" style={{ color: "var(--forest)" }}>
              Lösenordet är uppdaterat. Tar dig till ditt konto…
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
