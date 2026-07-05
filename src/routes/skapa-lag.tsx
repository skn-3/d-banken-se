import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, SiteFooter, Blobs } from "@/components/site-chrome";
import {
  searchOrganizations,
  listCertificateTemplatesPublic,
  createTeamSelfService,
} from "@/lib/team-signup.functions";

export const Route = createFileRoute("/skapa-lag")({
  head: () => ({
    meta: [
      { title: "Skapa lag — SmartKlimat" },
      { name: "description", content: "Registrera ditt lag och kom igång med SmartKlimat på fyra steg." },
    ],
  }),
  component: SkapaLagPage,
});

type Project = { key: string; title: string; country: string; description: string; image: string };
const PROJECTS: Project[] = [
  {
    key: "Khasi Hills, Indien",
    title: "Khasi Hills",
    country: "Indien",
    description: "Återplantering med lokala samhällen som skyddar heliga skogar.",
    image: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=800&q=70",
  },
  {
    key: "Copperbelt, Zambia",
    title: "Copperbelt",
    country: "Zambia",
    description: "Miombo-skogar återställs med hjälp av småbrukare.",
    image: "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=800&q=70",
  },
  {
    key: "Pontal, Brasilien",
    title: "Pontal",
    country: "Brasilien",
    description: "Atlantregnskog knyter ihop fragment till en levande korridor.",
    image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=70",
  },
];

type Step = 0 | 1 | 2 | 3;
type Org = { id: string; name: string; type: string };
type Tmpl = { id: string; name: string; logo_url: string | null; accent_color: string | null; heading_text: string | null; body_text: string | null; background_key: string | null; is_default: boolean | null };

function SkapaLagPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<null | { user: { id: string; email?: string | null } }>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ? { user: data.session.user } : null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ? { user: s.user } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className="relative z-10 mx-auto w-full max-w-2xl px-6 pb-20 pt-10">
        {!authReady ? (
          <p className="text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Laddar…</p>
        ) : !session ? (
          <SignupCard onDone={() => { /* auth listener will pick up */ }} />
        ) : (
          <Wizard onFinished={() => navigate({ to: "/konto" })} />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function SignupCard({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { name, account_type: "saljare" }, emailRedirectTo: `${window.location.origin}/skapa-lag` },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="surface-card p-8">
      <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--forest, #0B3D2E)" }}>
        Skapa ditt lag
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
        Först behöver du ett konto. {mode === "signup" ? "Har du redan ett?" : "Behöver du skapa ett?"}{" "}
        <button className="underline" style={{ color: "var(--primary)" }} onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(null); }}>
          {mode === "signup" ? "Logga in" : "Skapa konto"}
        </button>
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === "signup" && (
          <div>
            <label className="mb-1.5 block text-sm font-medium">Ditt namn</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium">E-post</label>
          <input className="input-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Lösenord</label>
          <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>
        {error && <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}>{error}</div>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Skapar…" : mode === "signup" ? "Skapa konto och fortsätt" : "Logga in"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
        Genom att fortsätta blir du lagledare för det lag du skapar. Du kan bjuda in säljare efteråt.
      </p>
    </div>
  );
}

function Wizard({ onFinished: _ }: { onFinished: () => void }) {
  const [step, setStep] = useState<Step>(0);
  const [teamName, setTeamName] = useState("");
  const [city, setCity] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgType, setNewOrgType] = useState<"school" | "company">("company");
  const [projectLocation, setProjectLocation] = useState<string>(PROJECTS[0].key);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [showTeamName, setShowTeamName] = useState(true);
  const [goalTrees, setGoalTrees] = useState<string>("500");
  const [goalEndDate, setGoalEndDate] = useState<string>("");
  const [weeklyGoal, setWeeklyGoal] = useState<string>("20");

  const [templates, setTemplates] = useState<Tmpl[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ team_id: string; organization_id: string; join_code: string } | null>(null);

  const listTemplates = useServerFn(listCertificateTemplatesPublic);
  const createTeam = useServerFn(createTeamSelfService);

  useEffect(() => {
    listTemplates().then((r) => {
      setTemplates(r.templates as Tmpl[]);
      const def = r.templates.find((t) => t.is_default) ?? r.templates[0];
      if (def) setTemplateId(def.id);
    }).catch(() => { /* ignore */ });
  }, [listTemplates]);

  const canNext = useMemo(() => {
    if (step === 0) return teamName.trim().length > 0 && (orgId || newOrgName.trim().length > 0);
    if (step === 1) return projectLocation.length > 0;
    if (step === 2) return templateId !== null;
    return true;
  }, [step, teamName, orgId, newOrgName, projectLocation, templateId]);

  const submit = async () => {
    setSubmitting(true); setSubmitError(null);
    try {
      const res = await createTeam({
        data: {
          teamName: teamName.trim(),
          organizationId: orgId,
          newOrganizationName: orgId ? null : newOrgName.trim(),
          newOrganizationType: orgId ? null : newOrgType,
          city: city.trim() || null,
          projectLocation,
          certificateTemplateId: templateId,
          showTeamName,
          goalTrees: goalTrees ? Number(goalTrees) : null,
          goalEndDate: goalEndDate || null,
          weeklyGoalTrees: weeklyGoal ? Number(weeklyGoal) : 0,
        },
      });
      setResult(res);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (result) return <DoneScreen code={result.join_code} teamName={teamName} />;

  return (
    <div className="surface-card p-8">
      <StepIndicator step={step} />
      <div className="mt-6">
        {step === 0 && <StepTeam teamName={teamName} setTeamName={setTeamName} city={city} setCity={setCity} orgId={orgId} setOrgId={setOrgId} newOrgName={newOrgName} setNewOrgName={setNewOrgName} newOrgType={newOrgType} setNewOrgType={setNewOrgType} />}
        {step === 1 && <StepProject value={projectLocation} onChange={setProjectLocation} />}
        {step === 2 && <StepCertificate templates={templates} templateId={templateId} setTemplateId={setTemplateId} showTeamName={showTeamName} setShowTeamName={setShowTeamName} />}
        {step === 3 && <StepGoals goalTrees={goalTrees} setGoalTrees={setGoalTrees} goalEndDate={goalEndDate} setGoalEndDate={setGoalEndDate} weekly={weeklyGoal} setWeekly={setWeeklyGoal} />}
      </div>

      {submitError && (
        <div className="mt-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}>{submitError}</div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button className="btn-ghost" disabled={step === 0 || submitting} onClick={() => setStep((s) => (s - 1) as Step)}>Tillbaka</button>
        {step < 3 ? (
          <button className="btn-primary" disabled={!canNext} onClick={() => setStep((s) => (s + 1) as Step)}>Nästa</button>
        ) : (
          <button className="btn-primary" disabled={submitting} onClick={submit}>{submitting ? "Skapar…" : "Skapa lag"}</button>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels = ["Laget", "Projekt", "Värdebevis", "Mål"];
  return (
    <ol className="flex items-center gap-2">
      {labels.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
              style={{
                background: done ? "var(--forest, #0B3D2E)" : active ? "var(--primary)" : "var(--muted, #E7F0EB)",
                color: done || active ? "#fff" : "var(--muted-foreground)",
              }}
            >
              {i + 1}
            </div>
            <span className={`text-xs sm:text-sm ${active ? "font-semibold" : ""}`} style={{ color: active ? "var(--forest, #0B3D2E)" : "var(--muted-foreground)" }}>
              {label}
            </span>
            {i < labels.length - 1 && <div className="hidden flex-1 sm:block" style={{ height: 1, background: "var(--border, #D9EBE0)" }} />}
          </li>
        );
      })}
    </ol>
  );
}

function StepTeam(props: {
  teamName: string; setTeamName: (v: string) => void;
  city: string; setCity: (v: string) => void;
  orgId: string | null; setOrgId: (v: string | null) => void;
  newOrgName: string; setNewOrgName: (v: string) => void;
  newOrgType: "school" | "company"; setNewOrgType: (v: "school" | "company") => void;
}) {
  const searchOrgs = useServerFn(searchOrganizations);
  const [q, setQ] = useState("");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [mode, setMode] = useState<"search" | "new">("search");
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      searchOrgs({ data: { query: q } }).then((r) => setOrgs(r.organizations as Org[])).catch(() => setOrgs([]));
    }, 200);
    return () => { if (debounce.current) window.clearTimeout(debounce.current); };
  }, [q, searchOrgs]);

  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-semibold" style={{ color: "var(--forest, #0B3D2E)" }}>Berätta om laget</h2>
      <div>
        <label className="mb-1.5 block text-sm font-medium">Lagnamn *</label>
        <input className="input-field" value={props.teamName} onChange={(e) => props.setTeamName(e.target.value)} placeholder="t.ex. 9C Skogshjältarna" required />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">Ort (valfritt)</label>
        <input className="input-field" value={props.city} onChange={(e) => props.setCity(e.target.value)} placeholder="t.ex. Stockholm" />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm">
          <button type="button" className={mode === "search" ? "font-semibold underline" : "opacity-70"} onClick={() => setMode("search")}>Sök befintlig</button>
          <span className="opacity-40">·</span>
          <button type="button" className={mode === "new" ? "font-semibold underline" : "opacity-70"} onClick={() => { setMode("new"); props.setOrgId(null); }}>Skapa ny</button>
        </div>

        {mode === "search" ? (
          <div className="space-y-2">
            <input className="input-field" placeholder="Sök organisation…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-56 overflow-y-auto rounded-xl border" style={{ borderColor: "var(--border, #D9EBE0)" }}>
              {orgs.length === 0 && <p className="p-3 text-sm" style={{ color: "var(--muted-foreground)" }}>Inga träffar.</p>}
              {orgs.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  onClick={() => props.setOrgId(o.id)}
                  className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm hover:bg-black/[0.03]"
                  style={{ borderColor: "var(--border, #D9EBE0)", background: props.orgId === o.id ? "var(--muted, #E7F0EB)" : undefined }}
                >
                  <span>{o.name}</span>
                  <span className="text-xs opacity-60">{o.type === "school" ? "Skola" : "Företag"}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <input className="input-field" placeholder="Organisationens namn" value={props.newOrgName} onChange={(e) => props.setNewOrgName(e.target.value)} />
            <div className="flex gap-2">
              {(["company", "school"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => props.setNewOrgType(t)}
                  className="rounded-full border px-4 py-1.5 text-sm"
                  style={{
                    borderColor: props.newOrgType === t ? "var(--forest, #0B3D2E)" : "var(--border, #D9EBE0)",
                    background: props.newOrgType === t ? "var(--forest, #0B3D2E)" : "transparent",
                    color: props.newOrgType === t ? "#fff" : "var(--foreground)",
                  }}
                >
                  {t === "company" ? "Företag" : "Skola"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepProject({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-semibold" style={{ color: "var(--forest, #0B3D2E)" }}>Var ska träden växa?</h2>
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Välj det projekt som lagets försäljning ska plantera i.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {PROJECTS.map((p) => {
          const active = value === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.key)}
              className="overflow-hidden rounded-2xl border text-left transition"
              style={{
                borderColor: active ? "var(--forest, #0B3D2E)" : "var(--border, #D9EBE0)",
                boxShadow: active ? "0 0 0 3px rgba(30,158,106,0.25)" : undefined,
                background: "#F4FAF5",
              }}
            >
              <div className="aspect-[4/3] w-full bg-cover bg-center" style={{ backgroundImage: `url(${p.image})` }} />
              <div className="p-3">
                <p className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{p.country}</p>
                <p className="font-display text-lg font-semibold" style={{ color: "var(--forest, #0B3D2E)" }}>{p.title}</p>
                <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{p.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepCertificate({ templates, templateId, setTemplateId, showTeamName, setShowTeamName }: {
  templates: Tmpl[]; templateId: string | null; setTemplateId: (v: string) => void;
  showTeamName: boolean; setShowTeamName: (v: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-semibold" style={{ color: "var(--forest, #0B3D2E)" }}>Välj värdebevis</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {templates.map((t) => {
          const active = templateId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplateId(t.id)}
              className="rounded-2xl border p-4 text-left transition"
              style={{
                borderColor: active ? "var(--forest, #0B3D2E)" : "var(--border, #D9EBE0)",
                boxShadow: active ? "0 0 0 3px rgba(30,158,106,0.25)" : undefined,
                background: "#F4FAF5",
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display text-base font-semibold" style={{ color: "var(--forest, #0B3D2E)" }}>{t.name}</p>
                {t.is_default && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ background: "var(--forest, #0B3D2E)", color: "#fff" }}>Standard</span>}
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border, #D9EBE0)", background: "#fff" }}>
                <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: t.accent_color ?? "#1E9E6A" }}>Värdebevis</p>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--forest, #0B3D2E)" }}>{t.heading_text ?? "Ett träd i ditt namn"}</p>
                <p className="mt-2 line-clamp-2 text-xs" style={{ color: "var(--muted-foreground)" }}>{t.body_text ?? "Tack för din insats."}</p>
              </div>
            </button>
          );
        })}
      </div>

      <label className="flex items-start gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border, #D9EBE0)", background: "#F4FAF5" }}>
        <input type="checkbox" className="mt-1" checked={showTeamName} onChange={(e) => setShowTeamName(e.target.checked)} />
        <span className="text-sm">
          <span className="block font-medium">Visa lagets namn på beviset</span>
          <span className="opacity-70">Certifikatet får raden "Såld av {"{"}säljare{"}"}, {"{"}lagnamn{"}"}".</span>
        </span>
      </label>
    </div>
  );
}

function StepGoals({ goalTrees, setGoalTrees, goalEndDate, setGoalEndDate, weekly, setWeekly }: {
  goalTrees: string; setGoalTrees: (v: string) => void;
  goalEndDate: string; setGoalEndDate: (v: string) => void;
  weekly: string; setWeekly: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-semibold" style={{ color: "var(--forest, #0B3D2E)" }}>Sätt målen</h2>
      <div>
        <label className="mb-1.5 block text-sm font-medium">Kampanjmål (antal träd)</label>
        <input className="input-field" inputMode="numeric" value={goalTrees} onChange={(e) => setGoalTrees(e.target.value.replace(/\D/g, ""))} />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">Slutdatum (valfritt)</label>
        <input className="input-field" type="date" value={goalEndDate} onChange={(e) => setGoalEndDate(e.target.value)} />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">Veckomål (träd/vecka)</label>
        <input className="input-field" inputMode="numeric" value={weekly} onChange={(e) => setWeekly(e.target.value.replace(/\D/g, ""))} />
      </div>
    </div>
  );
}

function DoneScreen({ code, teamName }: { code: string; teamName: string }) {
  const url = `https://app.smartklimat.org/aktivera?lag=${code}`;
  const [copied, setCopied] = useState<"code" | "url" | null>(null);
  const copy = async (val: string, kind: "code" | "url") => {
    try { await navigator.clipboard.writeText(val); setCopied(kind); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  };
  return (
    <div className="surface-card p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl" style={{ background: "var(--mint-paper, #EAF7EE)", color: "var(--forest, #0B3D2E)" }}>🌳</div>
      <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--forest, #0B3D2E)" }}>Klart! {teamName} är igång.</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Dela lagkoden med dina säljare så kan de gå med.</p>

      <div className="mt-8 rounded-3xl border p-6" style={{ borderColor: "var(--border, #D9EBE0)", background: "#F4FAF5" }}>
        <p className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Lagkod</p>
        <p className="mt-2 font-mono text-5xl font-bold tracking-widest" style={{ color: "var(--forest, #0B3D2E)" }}>{code}</p>
        <button className="mt-4 btn-ghost" onClick={() => copy(code, "code")}>{copied === "code" ? "Kopierad!" : "Kopiera koden"}</button>
      </div>

      <div className="mt-4 rounded-2xl border p-4 text-left" style={{ borderColor: "var(--border, #D9EBE0)" }}>
        <p className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Delbar länk</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="flex-1 truncate rounded-md bg-black/[0.04] px-2 py-1 text-xs">{url}</code>
          <button className="btn-primary" onClick={() => copy(url, "url")}>{copied === "url" ? "Kopierad" : "Kopiera"}</button>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link to="/saljare" className="btn-primary">Till säljarvyn</Link>
        <Link to="/konto" className="btn-ghost">Till mitt konto</Link>
      </div>
    </div>
  );
}
