import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestTeamSignupConfirmation } from "@/lib/auth-email.functions";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import {
  lookupTeamByCode,
  joinTeamByCode,
  notifyGuardian,
  type TeamLookup,
} from "@/lib/seller-onboarding.functions";

const searchSchema = z.object({
  lag: fallback(z.string().max(24), "").default(""),
});

export const Route = createFileRoute("/aktivera")({
  head: () => ({ meta: [{ title: "Välkommen till Smaarty — aktivera ditt konto" }] }),
  validateSearch: zodValidator(searchSchema),
  component: ActivatePage,
});

const PROJECT_IMAGES: Record<string, string> = {
  "Khasi Hills, Indien": "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=800&q=70",
  "Copperbelt, Zambia": "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=800&q=70",
  "Pontal, Brasilien": "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=70",
};

function ActivatePage() {
  const navigate = useNavigate();
  const { lag } = Route.useSearch();
  const rawCode = (lag || "").toUpperCase();

  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [team, setTeam] = useState<NonNullable<TeamLookup> | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [joining, setJoining] = useState(false);

  const doLookup = useServerFn(lookupTeamByCode);
  const joinExisting = useServerFn(joinTeamByCode);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      setIsRecovery(hash.includes("type=recovery") || hash.includes("access_token"));
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!rawCode) return;
    doLookup({ data: { code: rawCode } })
      .then((r) => { if (r.team) setTeam(r.team); else setTeamError("Vi hittade inget lag med den koden."); })
      .catch((e) => setTeamError((e as Error).message));
  }, [rawCode, doLookup]);

  useEffect(() => {
    if (!hasSession || !rawCode || !team || joining) return;
    setJoining(true);
    joinExisting({ data: { code: rawCode } })
      .catch(() => { /* membership may already exist */ })
      .finally(() => setJoining(false));
  }, [hasSession, rawCode, team, joining, joinExisting]);

  if (!ready) {
    return <Shell><p className="text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Laddar…</p></Shell>;
  }

  // Existing invitation flow: recovery hash present → keep original set-password UI
  if (isRecovery || (hasSession && !rawCode && !team)) {
    return <Shell><InvitePasswordCard /></Shell>;
  }

  if (hasSession && rawCode && team) {
    return <Shell wide><IntroCarousel team={team} onDone={() => navigate({ to: "/saljare" })} /></Shell>;
  }

  // Team code present in URL
  if (rawCode && team) {
    return <Shell wide><SellerSignup team={team} /></Shell>;
  }
  if (rawCode && teamError) {
    return <Shell><ErrorCard message={teamError} /></Shell>;
  }
  if (rawCode) {
    return <Shell><p className="text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Hämtar laginformation…</p></Shell>;
  }

  // No code, no session, no recovery → let them enter a code
  return (
    <Shell>
      <div className="surface-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
             style={{ background: "var(--mint-paper, #EAF7EE)", color: "var(--forest, #0B3D2E)" }}>🌱</div>
        <h1 className="font-display text-3xl font-semibold">Välkommen till Smaarty!</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Har du en lagkod? Ange den så kopplar vi dig till rätt lag.</p>
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (manualCode.trim()) window.location.assign(`/aktivera?lag=${encodeURIComponent(manualCode.trim().toUpperCase())}`); }}
        >
          <input
            className="input-field text-center font-mono text-2xl tracking-widest uppercase"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
            placeholder="ABC123"
            maxLength={12}
            autoFocus
          />
          <button className="btn-primary w-full" type="submit">Fortsätt</button>
        </form>
        <p className="mt-6 text-xs" style={{ color: "var(--muted-foreground)" }}>
          Har du redan ett konto? <Link to="/auth" className="underline" style={{ color: "var(--primary)" }}>Logga in</Link>
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className={`relative z-10 mx-auto flex w-full ${wide ? "max-w-lg" : "max-w-md"} flex-col px-6 pb-20 pt-10`}>
        {children}
      </main>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="surface-card p-8 text-center">
      <h1 className="font-display text-2xl font-semibold" style={{ color: "var(--forest, #0B3D2E)" }}>Något gick fel</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>{message}</p>
      <Link to="/aktivera" className="btn-ghost mt-4 inline-block">Försök igen</Link>
    </div>
  );
}

/* -------- Existing invitation flow (unchanged behavior) -------- */
function InvitePasswordCard() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

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
    setTimeout(() => navigate({ to: "/saljare" }), 1200);
  };

  return (
    <div className="surface-card p-8">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
           style={{ background: "var(--mint-paper, #EAF7EE)", color: "var(--forest, #0B3D2E)" }}>🌱</div>
      <h1 className="text-center font-display text-3xl font-semibold">Välkommen till Smaarty!</h1>
      <p className="mt-2 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
        Sätt ditt lösenord för att komma igång.
      </p>
      {!done && (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Välj lösenord</label>
            <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Bekräfta lösenord</label>
            <input className="input-field" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          {error && <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}>{error}</div>}
          <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? "Aktiverar…" : "Aktivera mitt konto"}</button>
        </form>
      )}
      {done && <p className="mt-6 text-center text-sm" style={{ color: "var(--forest)" }}>Klart! Tar dig till din säljarvy…</p>}
    </div>
  );
}

/* -------- Seller signup via team code -------- */
function SellerSignup({ team }: { team: NonNullable<TeamLookup> }) {
  const navigate = useNavigate();
  const signup = useServerFn(requestTeamSignupConfirmation);
  const notify = useServerFn(notifyGuardian);

  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [under13, setUnder13] = useState<null | boolean>(null);
  const [guardianEmail, setGuardianEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<"form" | "confirm">("form");

  const canSubmit = useMemo(() => {
    if (!firstName.trim() || !email.trim() || password.length < 8) return false;
    if (under13 === null) return false;
    if (under13 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guardianEmail)) return false;
    return true;
  }, [firstName, email, password, under13, guardianEmail]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setSubmitting(true);
    try {
      const code = new URL(window.location.href).searchParams.get("lag") ?? "";
      await signup({
        data: {
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          teamCode: code,
          redirectTo: `${window.location.origin}/aktivera?lag=${encodeURIComponent(code)}`,
          under13: !!under13,
          guardianEmail: under13 ? guardianEmail.trim() : null,
        },
      });

      if (under13) {
        await notify({
          data: {
            guardianEmail: guardianEmail.trim(),
            childFirstName: firstName.trim(),
            teamName: team.name,
            teamCode: code,
          },
        }).catch(() => { /* non-blocking */ });
      }

      setPhase("confirm");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === "confirm") {
    return (
      <div className="surface-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
             style={{ background: "var(--mint-paper, #EAF7EE)", color: "var(--forest, #0B3D2E)" }}>✉️</div>
        <h1 className="font-display text-3xl font-semibold">Kolla din e-post</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          Vi har skickat en bekräftelselänk. Öppna den för att aktivera kontot och gå vidare till laget.
        </p>
      </div>
    );
  }

  return (
    <div className="surface-card p-7 animate-fade-in">
      <div className="rounded-2xl p-5 text-center" style={{ background: "#0B3D2E", color: "#fff" }}>
        <p className="text-[10px] font-mono uppercase tracking-[0.25em]" style={{ color: "#9FD9B6" }}>Du går med i</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">{team.name}!</h1>
        {team.organization_name && (
          <p className="mt-1 text-sm" style={{ color: "#9FD9B6" }}>{team.organization_name}</p>
        )}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Ditt förnamn</label>
          <input className="input-field" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={80} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">E-post</label>
          <input className="input-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Välj lösenord</label>
          <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Minst 8 tecken.</p>
        </div>

        <fieldset className="rounded-xl border p-3" style={{ borderColor: "var(--border, #D9EBE0)", background: "#F4FAF5" }}>
          <legend className="px-2 text-sm font-medium">Är du under 13 år?</legend>
          <div className="mt-2 flex gap-2">
            {[
              { v: false, label: "Nej" },
              { v: true, label: "Ja" },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                onClick={() => setUnder13(o.v)}
                className="flex-1 rounded-full border px-4 py-2 text-sm"
                style={{
                  borderColor: under13 === o.v ? "var(--forest, #0B3D2E)" : "var(--border, #D9EBE0)",
                  background: under13 === o.v ? "var(--forest, #0B3D2E)" : "transparent",
                  color: under13 === o.v ? "#fff" : "var(--foreground)",
                }}
              >{o.label}</button>
            ))}
          </div>
          {under13 && (
            <div className="mt-3 animate-fade-in">
              <label className="mb-1.5 block text-sm font-medium">Vårdnadshavares e-post</label>
              <input className="input-field" type="email" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} required maxLength={255} />
              <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Vi skickar dit ett kort mejl som förklarar kontot.</p>
            </div>
          )}
        </fieldset>

        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Vi sparar bara ditt förnamn och e-post. Inget mer.
        </p>

        {error && <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}>{error}</div>}

        <button type="submit" disabled={!canSubmit || submitting} className="btn-primary w-full">
          {submitting ? "Skapar…" : "Kör igång!"}
        </button>
      </form>
    </div>
  );
}

/* -------- Intro carousel (only first time via localStorage) -------- */
function IntroCarousel({ team, onDone }: { team: NonNullable<TeamLookup>; onDone: () => void }) {
  const seenKey = "smaarty-intro-seen";
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(seenKey)) onDone();
  }, [onDone]);

  const finish = () => {
    if (typeof window !== "undefined") localStorage.setItem(seenKey, "1");
    onDone();
  };

  const slides = [
    <SlideHow key="s1" />,
    <SlideTeam key="s2" team={team} />,
    <SlideGo key="s3" onGo={finish} />,
  ];

  return (
    <div className="surface-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <span key={i} className="h-1.5 w-6 rounded-full transition-all"
                  style={{ background: i <= step ? "var(--forest, #0B3D2E)" : "var(--border, #D9EBE0)" }} />
          ))}
        </div>
        <button onClick={finish} className="text-xs underline" style={{ color: "var(--muted-foreground)" }}>Hoppa över</button>
      </div>

      <div key={step} className="mt-6 animate-scale-in">
        {slides[step]}
      </div>

      {step < slides.length - 1 && (
        <div className="mt-6 flex justify-end">
          <button className="btn-primary" onClick={() => setStep((s) => s + 1)}>Nästa</button>
        </div>
      )}
    </div>
  );
}

function Bouncy({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{ animation: "smaarty-bounce 1.6s cubic-bezier(.34,1.56,.64,1) infinite" }}
    >
      {children}
      <style>{`@keyframes smaarty-bounce { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }`}</style>
    </div>
  );
}

function SlideHow() {
  return (
    <div className="text-center">
      <Bouncy className="mx-auto mb-3 text-5xl">🌱</Bouncy>
      <h2 className="font-display text-2xl font-bold" style={{ color: "var(--forest, #0B3D2E)" }}>Så funkar det</h2>
      <ol className="mx-auto mt-5 max-w-sm space-y-3 text-left text-sm">
        {[
          { icon: "🛒", text: "Du säljer trädplanteringar." },
          { icon: "🌳", text: "Riktiga träd planteras i lagets projekt." },
          { icon: "⭐️", text: "Du får poäng för varje sålt träd." },
          { icon: "🚀", text: "Ditt nivåträd växer när poängen ökar." },
        ].map((r) => (
          <li key={r.text} className="flex items-start gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border, #D9EBE0)", background: "#F4FAF5" }}>
            <span className="text-xl">{r.icon}</span>
            <span>{r.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SlideTeam({ team }: { team: NonNullable<TeamLookup> }) {
  const img = team.project_location ? PROJECT_IMAGES[team.project_location] : null;
  const goal = team.goal_trees ?? 0;
  const progressPct = 0; // ny säljare – ännu inget
  return (
    <div className="text-center">
      <Bouncy className="mx-auto mb-3 text-5xl">👥</Bouncy>
      <h2 className="font-display text-2xl font-bold" style={{ color: "var(--forest, #0B3D2E)" }}>Ditt lag</h2>
      <p className="mt-1 text-lg font-semibold">{team.name}</p>

      {team.project_location && (
        <div className="mx-auto mt-4 overflow-hidden rounded-2xl border text-left" style={{ borderColor: "var(--border, #D9EBE0)", maxWidth: 360 }}>
          {img && <div className="aspect-[16/9] w-full bg-cover bg-center" style={{ backgroundImage: `url(${img})` }} />}
          <div className="p-3">
            <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Projekt</p>
            <p className="font-display text-base font-semibold" style={{ color: "var(--forest, #0B3D2E)" }}>{team.project_location}</p>
          </div>
        </div>
      )}

      {goal > 0 && (
        <div className="mx-auto mt-4 max-w-sm">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Kampanjmål</span>
            <span className="font-mono">{goal.toLocaleString("sv-SE")} träd</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--border, #D9EBE0)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: "var(--forest, #0B3D2E)" }} />
          </div>
        </div>
      )}
    </div>
  );
}

function SlideGo({ onGo }: { onGo: () => void }) {
  return (
    <div className="py-6 text-center">
      <Bouncy className="mx-auto mb-4 text-6xl">🚀</Bouncy>
      <h2 className="font-display text-3xl font-bold" style={{ color: "var(--forest, #0B3D2E)" }}>Kör!</h2>
      <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Nu är du redo att sälja ditt första träd.</p>
      <button onClick={onGo} className="btn-primary mt-6 h-14 w-full text-lg">Till säljvyn</button>
    </div>
  );
}
