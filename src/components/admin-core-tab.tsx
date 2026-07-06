import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getAudienceOptions, listBackupFiles, getBackupSignedUrl,
  listRecentNewsletters, listRecentBackupRuns, runBackupNow,
  listRecentProjectUpdates,
} from "@/lib/core.functions";
import {
  adminListPayoutRequests, adminUpdatePayoutStatus,
  getTeamSharePrice, setTeamSharePrice,
} from "@/lib/payouts.functions";
import { getRewardEconomy, getRewardBudget, setRewardBudget } from "@/lib/reward-economy.functions";
import { AdminPhotoReports } from "@/components/admin-photo-reports";
import { AdminSupportSection } from "@/components/admin-support-section";
import { AdminInsightsSection } from "@/components/admin-insights";
import { AdminClubSection } from "@/components/admin-club-section";

type AudienceKind = "all" | "manad" | "source" | "project";

function bytesLabel(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function AdminCoreTab() {
  const loadOptions = useServerFn(getAudienceOptions);
  const loadFiles = useServerFn(listBackupFiles);
  const signUrl = useServerFn(getBackupSignedUrl);
  const loadNewsletters = useServerFn(listRecentNewsletters);
  const loadUpdates = useServerFn(listRecentProjectUpdates);
  const loadRuns = useServerFn(listRecentBackupRuns);
  const doBackup = useServerFn(runBackupNow);

  const [sources, setSources] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [audienceKind, setAudienceKind] = useState<AudienceKind>("all");
  const [audienceValue, setAudienceValue] = useState<string>("");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [backups, setBackups] = useState<Array<{ folder: string; files: Array<{ name: string; size: number; path: string }> }>>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [newsletters, setNewsletters] = useState<any[]>([]);
  const [updates, setUpdates] = useState<any[]>([]);

  const refreshAll = async () => {
    const [o, f, r, n, u] = await Promise.all([loadOptions(), loadFiles(), loadRuns(), loadNewsletters(), loadUpdates()]);
    setSources(o.sources); setProjects(o.projects);
    setBackups(f.runs);
    setRuns(r.runs);
    setNewsletters(n.newsletters);
    setUpdates(u.updates);
  };

  useEffect(() => { refreshAll().catch((e) => setMsg(String(e.message ?? e))); }, []);

  const callFn = async (mode: "count" | "preview" | "send", testEmail?: string) => {
    const audience = { kind: audienceKind, value: audienceKind === "source" || audienceKind === "project" ? audienceValue : null };
    const res = await supabase.functions.invoke("send-newsletter", {
      body: { subject, headline, body, ctaLabel: ctaLabel || null, ctaUrl: ctaUrl || null, audience, mode, testEmail: testEmail ?? null },
    });
    if (res.error) throw new Error(res.error.message);
    return res.data as any;
  };

  const doCount = async () => {
    setBusy("count"); setMsg(null);
    try { const r = await callFn("count"); setCount(r.recipient_count ?? 0); }
    catch (e: any) { setMsg(e.message); }
    finally { setBusy(null); }
  };

  const doPreview = async () => {
    setBusy("preview"); setMsg(null);
    try {
      const email = window.prompt("Skicka test till (lämna tomt = din adress):", "") || undefined;
      const r = await callFn("preview", email);
      setMsg(`Testmail skickat till ${r.test_to}`);
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(null); }
  };

  const doSend = async () => {
    setBusy("count"); setMsg(null);
    try {
      const c = await callFn("count");
      const n = c.recipient_count ?? 0;
      if (!n) { setMsg("Inga mottagare — inget skickat."); setCount(0); return; }
      if (!window.confirm(`Skicka utskicket till ${n} mottagare?`)) return;
      setBusy("send");
      const r = await callFn("send");
      setCount(r.recipient_count ?? n);
      setMsg(`Skickat till ${r.recipient_count ?? n} mottagare.`);
      await refreshAll();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(null); }
  };

  const doBackupNow = async () => {
    setBusy("backup"); setMsg(null);
    try {
      await doBackup();
      setMsg("Säkerhetskopiering klar.");
      await refreshAll();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(null); }
  };

  const download = async (path: string) => {
    try {
      const { url } = await signUrl({ data: { path } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="mt-6 space-y-6">
      <AdminInsightsSection />
      <section className="surface-card p-6">
        <h2 className="font-display text-xl font-semibold">Utskick</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          Skickas till <strong>köparnas</strong> e-post. Avregistrerade adresser exkluderas automatiskt.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">Målgrupp
            <select className="input-field mt-1 w-full" value={audienceKind}
              onChange={(e) => { setAudienceKind(e.target.value as AudienceKind); setAudienceValue(""); setCount(null); }}>
              <option value="all">Alla köpare</option>
              <option value="manad">Månadsplanterare</option>
              <option value="source">Per källa</option>
              <option value="project">Per projekt</option>
            </select>
          </label>
          {(audienceKind === "source" || audienceKind === "project") && (
            <label className="text-sm">{audienceKind === "source" ? "Källa" : "Projekt"}
              <select className="input-field mt-1 w-full" value={audienceValue}
                onChange={(e) => { setAudienceValue(e.target.value); setCount(null); }}>
                <option value="">— välj —</option>
                {(audienceKind === "source" ? sources : projects).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">Ämnesrad
            <input className="input-field mt-1 w-full" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} />
          </label>
          <label className="block text-sm">Rubrik i mailet
            <input className="input-field mt-1 w-full" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={140} />
          </label>
          <label className="block text-sm">Brödtext
            <textarea className="input-field mt-1 w-full" rows={7} value={body} onChange={(e) => setBody(e.target.value)} maxLength={6000} />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">Knapptext (valfri)
              <input className="input-field mt-1 w-full" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={60} />
            </label>
            <label className="text-sm">Knapplänk (valfri)
              <input className="input-field mt-1 w-full" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://…" maxLength={400} />
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button className="chip" disabled={!!busy} onClick={doCount}>Räkna mottagare</button>
          <button className="chip" disabled={!!busy || !subject || !headline || !body} onClick={doPreview}>Skicka testmail</button>
          <button className="chip" style={{ background: "var(--mint)" }}
            disabled={!!busy || !subject || !headline || !body}
            onClick={doSend}>Skicka till målgrupp</button>
          {count !== null && <span className="chip">{count} mottagare</span>}
          {busy && <span className="chip">Arbetar…</span>}
        </div>
        {msg && <p className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>{msg}</p>}
      </section>

      <section className="surface-card p-6">
        <h2 className="font-display text-xl font-semibold">Tidigare utskick</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
              <tr><th className="py-2">Skickat</th><th>Ämne</th><th>Målgrupp</th><th>Mottagare</th></tr>
            </thead>
            <tbody>
              {newsletters.map((n) => (
                <tr key={n.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 font-mono text-xs">{new Date(n.sent_at).toLocaleString("sv-SE")}</td>
                  <td>{n.subject}</td>
                  <td className="text-xs">{n.audience_kind}{n.audience_value ? ` · ${n.audience_value}` : ""}</td>
                  <td className="font-mono">{n.recipient_count}</td>
                </tr>
              ))}
              {!newsletters.length && <tr><td colSpan={4} className="py-6 text-center" style={{ color: "var(--muted-foreground)" }}>Inga utskick ännu.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <ProjectUpdatesSection sources={sources} projects={projects} updates={updates} refresh={refreshAll} />

      <PayoutsSection />
      <TeamShareSettingSection />
      <RewardEconomyPanel />
      <AdminSupportSection />
      <AdminPhotoReports />



      <section className="surface-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Säkerhetskopior</h2>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Automatiskt varje söndag 03:00. Rensas efter 90 dagar.
            </p>
          </div>
          <button className="chip" style={{ background: "var(--mint)" }} disabled={!!busy} onClick={doBackupNow}>
            Säkerhetskopiera nu
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {backups.map((r) => (
            <div key={r.folder} className="rounded border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.folder}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {r.files.map((f) => (
                  <button key={f.path} className="chip" onClick={() => download(f.path)}>
                    {f.name} · {bytesLabel(f.size)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!backups.length && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Inga säkerhetskopior ännu.</p>}
        </div>

        <div className="mt-6">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Körningar</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                <tr><th className="py-2">Tid</th><th>Utlöst av</th><th>Status</th><th>Filer</th><th>Rensat</th><th>Notis</th></tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 font-mono text-xs">{new Date(r.created_at).toLocaleString("sv-SE")}</td>
                    <td className="font-mono text-xs">{r.triggered_by}</td>
                    <td className="font-mono text-xs">{r.ok ? "OK" : "Fel"}</td>
                    <td className="font-mono">{Array.isArray(r.files) ? r.files.length : 0}</td>
                    <td className="font-mono">{Array.isArray(r.deleted) ? r.deleted.length : 0}</td>
                    <td className="text-xs" style={{ color: "var(--muted-foreground)" }}>{r.note ?? ""}</td>
                  </tr>
                ))}
                {!runs.length && <tr><td colSpan={6} className="py-4 text-center" style={{ color: "var(--muted-foreground)" }}>—</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProjectUpdatesSection({
  sources, projects, updates, refresh,
}: {
  sources: string[];
  projects: string[];
  updates: any[];
  refresh: () => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [audienceKind, setAudienceKind] = useState<AudienceKind>("all");
  const [audienceValue, setAudienceValue] = useState<string>("");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const call = async (mode: "count" | "preview" | "send") => {
    const audience = {
      kind: audienceKind,
      value: audienceKind === "source" || audienceKind === "project" ? audienceValue : null,
    };
    const res = await supabase.functions.invoke("send-project-update", {
      body: {
        subject, headline, body,
        imageUrl: imageUrl || null,
        ctaLabel: ctaLabel || null,
        ctaUrl: ctaUrl || null,
        audience, mode,
      },
    });
    if (res.error) throw new Error(res.error.message);
    return res.data as any;
  };

  const doCount = async () => {
    setBusy("count"); setMsg(null);
    try { const r = await call("count"); setCount(r.recipient_count ?? 0); }
    catch (e: any) { setMsg(e.message); }
    finally { setBusy(null); }
  };

  const doPreview = async () => {
    setBusy("preview"); setMsg(null);
    try { const r = await call("preview"); setMsg(`Testmail skickat till ${r.test_to}`); }
    catch (e: any) { setMsg(e.message); }
    finally { setBusy(null); }
  };

  const doSend = async () => {
    setBusy("count"); setMsg(null);
    try {
      const c = await call("count");
      const n = c.recipient_count ?? 0;
      if (!n) { setMsg("Inga mottagare — inget skickat."); setCount(0); return; }
      if (!window.confirm(`Skicka uppdateringen till ${n} mottagare?`)) return;
      setBusy("send");
      const r = await call("send");
      setCount(r.recipient_count ?? n);
      setMsg(`Skickat till ${r.recipient_count ?? n} mottagare.`);
      await refresh();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(null); }
  };

  return (
    <>
      <section className="surface-card p-6">
        <h2 className="font-display text-xl font-semibold">Uppdateringar</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          Skickas till <strong>alla med värdebevis</strong> — köpare och gåvomottagare.
          Använd <code>{"{namn}"}</code> och <code>{"{antal}"}</code> för att personifiera.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">Målgrupp
            <select className="input-field mt-1 w-full" value={audienceKind}
              onChange={(e) => { setAudienceKind(e.target.value as AudienceKind); setAudienceValue(""); setCount(null); }}>
              <option value="all">Alla med bevis</option>
              <option value="manad">Månadsplanterare</option>
              <option value="source">Per källa</option>
              <option value="project">Per projekt</option>
            </select>
          </label>
          {(audienceKind === "source" || audienceKind === "project") && (
            <label className="text-sm">{audienceKind === "source" ? "Källa" : "Projekt"}
              <select className="input-field mt-1 w-full" value={audienceValue}
                onChange={(e) => { setAudienceValue(e.target.value); setCount(null); }}>
                <option value="">— välj —</option>
                {(audienceKind === "source" ? sources : projects).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">Ämnesrad
            <input className="input-field mt-1 w-full" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} />
          </label>
          <label className="block text-sm">Rubrik i mailet
            <input className="input-field mt-1 w-full" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={140} />
          </label>
          <label className="block text-sm">Brödtext (dela stycken med blankrad)
            <textarea className="input-field mt-1 w-full" rows={8} value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} />
          </label>
          <label className="block text-sm">Bild-URL (valfri, visas överst i kortet)
            <input className="input-field mt-1 w-full" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" maxLength={400} />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">Knapptext (valfri)
              <input className="input-field mt-1 w-full" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={60} />
            </label>
            <label className="text-sm">Knapplänk (valfri)
              <input className="input-field mt-1 w-full" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://…" maxLength={400} />
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button className="chip" disabled={!!busy} onClick={doCount}>Räkna mottagare</button>
          <button className="chip" disabled={!!busy || !subject || !headline || !body} onClick={doPreview}>Skicka testmail</button>
          <button className="chip" style={{ background: "var(--mint)" }}
            disabled={!!busy || !subject || !headline || !body}
            onClick={doSend}>Skicka till målgrupp</button>
          {count !== null && <span className="chip">{count} mottagare</span>}
          {busy && <span className="chip">Arbetar…</span>}
        </div>
        {msg && <p className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>{msg}</p>}
      </section>

      <section className="surface-card p-6">
        <h2 className="font-display text-xl font-semibold">Tidigare uppdateringar</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
              <tr><th className="py-2">Skickat</th><th>Ämne</th><th>Målgrupp</th><th>Mottagare</th></tr>
            </thead>
            <tbody>
              {updates.map((n) => (
                <tr key={n.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 font-mono text-xs">{new Date(n.sent_at).toLocaleString("sv-SE")}</td>
                  <td>{n.subject}</td>
                  <td className="text-xs">{n.audience_kind}{n.audience_value ? ` · ${n.audience_value}` : ""}</td>
                  <td className="font-mono">{n.recipient_count}</td>
                </tr>
              ))}
              {!updates.length && <tr><td colSpan={4} className="py-6 text-center" style={{ color: "var(--muted-foreground)" }}>Inga uppdateringar ännu.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function kr(ore: number) {
  return `${(ore / 100).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

function PayoutsSection() {
  const loadFn = useServerFn(adminListPayoutRequests);
  const updateFn = useServerFn(adminUpdatePayoutStatus);
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    try { const r = await loadFn(); setRows(r.rows); }
    catch (e: any) { setMsg(e.message); }
  };
  useEffect(() => { refresh().catch(() => {}); }, []);

  const change = async (id: string, status: "approved" | "paid" | "rejected") => {
    setBusy(id + status); setMsg(null);
    try {
      let note: string | undefined;
      if (status === "rejected") {
        note = window.prompt("Notering (krävs vid avslag):") || undefined;
        if (!note) { setBusy(null); return; }
      } else {
        note = window.prompt("Notering (valfri):") || undefined;
      }
      await updateFn({ data: { id, status, note } });
      await refresh();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(null); }
  };

  const pending = rows.filter((r) => r.status === "pending" || r.status === "approved");
  const done = rows.filter((r) => r.status === "paid" || r.status === "rejected");

  return (
    <section className="surface-card p-6">
      <h2 className="font-display text-xl font-semibold">Utbetalningar</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
        Väntande och godkända förfrågningar. Bekräfta utbetalning efter manuell banköverföring.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
            <tr>
              <th className="py-2">Datum</th><th>Lag</th><th>Belopp</th>
              <th>Mottagare</th><th>Intjänat</th><th>Tillgängligt</th>
              <th>Status</th><th>Åtgärd</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => (
              <tr key={r.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 font-mono text-xs">{new Date(r.created_at).toLocaleDateString("sv-SE")}</td>
                <td>{r.team_name}</td>
                <td className="font-mono">{kr(r.amount_ore)}</td>
                <td className="text-xs">
                  {r.recipient?.contactName}<br />
                  <span style={{ color: "var(--muted-foreground)" }}>{r.recipient?.accountType} · {r.recipient?.number}</span>
                </td>
                <td className="font-mono text-xs">{kr(r.earned_ore)}</td>
                <td className="font-mono text-xs">{kr(r.available_ore)}</td>
                <td className="text-xs">{r.status}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {r.status === "pending" && (
                      <button className="chip" disabled={busy?.startsWith(r.id)} onClick={() => change(r.id, "approved")}>Godkänn</button>
                    )}
                    <button className="chip" style={{ background: "var(--mint)" }}
                      disabled={busy?.startsWith(r.id)} onClick={() => change(r.id, "paid")}>Utbetald</button>
                    <button className="chip" disabled={busy?.startsWith(r.id)} onClick={() => change(r.id, "rejected")}>Avslå</button>
                  </div>
                </td>
              </tr>
            ))}
            {!pending.length && <tr><td colSpan={8} className="py-4 text-center" style={{ color: "var(--muted-foreground)" }}>Inga väntande förfrågningar.</td></tr>}
          </tbody>
        </table>
      </div>

      {msg && <p className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>{msg}</p>}

      {done.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Historik</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                <tr><th className="py-2">Datum</th><th>Lag</th><th>Belopp</th><th>Status</th><th>Hanterad</th><th>Notis</th></tr>
              </thead>
              <tbody>
                {done.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 font-mono text-xs">{new Date(r.created_at).toLocaleDateString("sv-SE")}</td>
                    <td>{r.team_name}</td>
                    <td className="font-mono">{kr(r.amount_ore)}</td>
                    <td className="text-xs">{r.status}</td>
                    <td className="font-mono text-xs">{r.handled_at ? new Date(r.handled_at).toLocaleDateString("sv-SE") : ""}</td>
                    <td className="text-xs" style={{ color: "var(--muted-foreground)" }}>{r.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function TeamShareSettingSection() {
  const loadFn = useServerFn(getTeamSharePrice);
  const saveFn = useServerFn(setTeamSharePrice);
  const [ore, setOre] = useState<string>("0");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadFn().then((r) => setOre(String(r.orePerTree ?? 0))).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const n = parseInt(ore, 10);
      if (!Number.isFinite(n) || n < 0) throw new Error("Ogiltigt värde.");
      await saveFn({ data: { orePerTree: n } });
      setMsg("Sparat.");
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="surface-card p-6">
      <h2 className="font-display text-xl font-semibold">Lagens intäkt per träd</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
        Antal <strong>ören</strong> som tillfaller säljarens lag för varje träd som säljs via Smaarty.
        Ändringen påverkar <strong>endast framtida köp</strong> — historik lämnas orörd. Är värdet 0 visas inga kronor för säljare eller lag.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">Ören per träd
          <input className="input-field mt-1 w-40" inputMode="numeric" value={ore} onChange={(e) => setOre(e.target.value)} />
        </label>
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          = {((parseInt(ore, 10) || 0) / 100).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr / träd
        </div>
        <button className="chip" style={{ background: "var(--mint)" }} disabled={busy} onClick={save}>Spara</button>
        {msg && <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{msg}</span>}
      </div>
    </section>
  );
}




function RewardEconomyPanel() {
  const loadStats = useServerFn(getRewardEconomy);
  const loadBudget = useServerFn(getRewardBudget);
  const saveBudget = useServerFn(setRewardBudget);

  const [stats, setStats] = useState<any>(null);
  const [budget, setBudget] = useState<string>("0");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [s, b] = await Promise.all([loadStats(), loadBudget()]);
      setStats(s); setBudget(String(b.orePerTree ?? 0));
    } catch (e: any) { setMsg(e.message); }
  };
  useEffect(() => { refresh().catch(() => {}); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const n = parseInt(budget, 10);
      if (!Number.isFinite(n) || n < 0) throw new Error("Ogiltigt värde.");
      await saveBudget({ data: { orePerTree: n } });
      setMsg("Sparat.");
      await refresh();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  if (!stats) return null;
  const perTreePts = stats.pointsPerTree30 || 0;
  const boostShare = stats.pointsAwarded30 > 0 ? Math.round(100 * stats.boostPoints30 / stats.pointsAwarded30) : 0;
  const over = !!stats.overBudget;

  return (
    <section className="surface-card p-6">
      <h2 className="font-display text-xl font-semibold">Poängekonomi</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
        Nyckeltal för att hålla belöningsprogrammet inom budget. Alla 30-dagarssiffror är rullande.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Utdelade poäng (totalt)" value={stats.pointsAwardedTotal.toLocaleString("sv-SE")} />
        <StatCard label="Poäng senaste 30 dagar" value={stats.pointsAwarded30.toLocaleString("sv-SE")} sub={`varav boost-poäng: ${stats.boostPoints30.toLocaleString("sv-SE")} (${boostShare}%)`} />
        <StatCard label="Poäng per träd (30 d)" value={perTreePts.toFixed(2)} sub={`${stats.trees30} träd`} />
        <StatCard label="Inlösta belöningar (30 d)" value={String(stats.redeemedCount)} sub={`${stats.redeemedPoints.toLocaleString("sv-SE")} poäng · ${kr(stats.redeemedCostOre)} inköp`} />
        <StatCard
          label="Belöningskostnad per sålt träd (30 d)"
          value={kr(Math.round(stats.costPerTreeOre))}
          sub={stats.budgetOre > 0 ? `Budget: ${kr(stats.budgetOre)}/träd` : "Ingen budget satt"}
          highlight={over ? "warn" : undefined}
        />
      </div>

      <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
        <div className="font-medium">Belöningsbudget per sålt träd</div>
        <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
          Används för att räkna ut rekommenderat minimipris på nya belöningar och för varning ovan.
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">Ören per träd
            <input className="input-field mt-1 w-40" inputMode="numeric" value={budget} onChange={e => setBudget(e.target.value)} />
          </label>
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            = {kr(parseInt(budget, 10) || 0)} / träd
          </div>
          <button className="chip" style={{ background: "var(--mint)" }} disabled={busy} onClick={save}>Spara</button>
          {msg && <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{msg}</span>}
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: "warn" }) {
  const warn = highlight === "warn";
  return (
    <div className="rounded-2xl p-4" style={{
      background: warn ? "#FFF1E8" : "var(--mint-paper)",
      border: warn ? "1px solid #F59E0B" : "1px solid var(--border)",
      color: warn ? "#B45309" : "var(--forest)",
    }}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="font-display text-2xl font-semibold mt-1">{value}{warn && " ⚠"}</div>
      {sub && <div className="text-xs mt-1 opacity-80">{sub}</div>}
    </div>
  );
}
