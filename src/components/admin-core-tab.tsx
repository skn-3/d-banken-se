import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getAudienceOptions, listBackupFiles, getBackupSignedUrl,
  listRecentNewsletters, listRecentBackupRuns, runBackupNow,
} from "@/lib/core.functions";

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

  const refreshAll = async () => {
    const [o, f, r, n] = await Promise.all([loadOptions(), loadFiles(), loadRuns(), loadNewsletters()]);
    setSources(o.sources); setProjects(o.projects);
    setBackups(f.runs);
    setRuns(r.runs);
    setNewsletters(n.newsletters);
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
      const res = await supabase.functions.invoke("run-backup", { body: {} });
      if (res.error) throw new Error(res.error.message);
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
