import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  supportSearch, listAdminNotes, addAdminNote,
  supportResendCertificateEmail, supportSendPasswordReset, supportSetAccountDisabled,
  getCustomerDetail, getSellerDetail, getTeamDetail,
} from "@/lib/support.functions";

type SearchRes = {
  customers: { id: string; name: string; email: string }[];
  sellers: { userId: string; name: string; email: string; disabled: boolean }[];
  teams: { id: string; name: string; joinCode: string | null }[];
  certificates: { id: string; verificationId: string; recipientName: string; treeCount: number; purchaseId: string }[];
};

type Target =
  | { kind: "customer"; id: string }
  | { kind: "seller"; userId: string }
  | { kind: "team"; id: string }
  | { kind: "certificate"; verificationId: string; recipientName: string; treeCount: number };

function kr(ore: number) { return `${(ore / 100).toLocaleString("sv-SE")} kr`; }
function fmtDate(iso: string) { return new Date(iso).toLocaleString("sv-SE"); }

export function AdminSupportSection() {
  const doSearch = useServerFn(supportSearch);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchRes | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);

  const runSearch = async () => {
    if (!q.trim()) return;
    setBusy(true); setMsg(null);
    try { setRes((await doSearch({ data: { q: q.trim() } })) as SearchRes); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <section className="surface-card p-6">
      <h2 className="font-display text-xl font-semibold">Support</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
        Sök i kunder, säljare, lag och bevis. Öppna en träff för åtgärder och intern notering.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          className="input-field flex-1"
          placeholder="Sök namn, e-post, lagnamn, lagkod eller bevis-ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
        />
        <button className="btn-primary !py-2 !px-4" disabled={busy} onClick={runSearch}>Sök</button>
      </div>
      {msg && <div className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>{msg}</div>}

      {res && (
        <div className="mt-6 space-y-6">
          <ResultGroup title="Kunder" empty={res.customers.length === 0}>
            {res.customers.map((c) => (
              <ResultRow key={c.id} onClick={() => setTarget({ kind: "customer", id: c.id })}
                primary={c.name} secondary={c.email} tag="Kund" />
            ))}
          </ResultGroup>
          <ResultGroup title="Säljare & ledare" empty={res.sellers.length === 0}>
            {res.sellers.map((s) => (
              <ResultRow key={s.userId} onClick={() => setTarget({ kind: "seller", userId: s.userId })}
                primary={s.name || s.email} secondary={s.email}
                tag={s.disabled ? "Inaktiverad" : "Konto"} warn={s.disabled} />
            ))}
          </ResultGroup>
          <ResultGroup title="Lag" empty={res.teams.length === 0}>
            {res.teams.map((t) => (
              <ResultRow key={t.id} onClick={() => setTarget({ kind: "team", id: t.id })}
                primary={t.name} secondary={t.joinCode ? `Kod: ${t.joinCode}` : ""} tag="Lag" />
            ))}
          </ResultGroup>
          <ResultGroup title="Bevis" empty={res.certificates.length === 0}>
            {res.certificates.map((c) => (
              <ResultRow key={c.id}
                onClick={() => setTarget({ kind: "certificate", verificationId: c.verificationId, recipientName: c.recipientName, treeCount: c.treeCount })}
                primary={c.verificationId} secondary={`${c.recipientName} · ${c.treeCount} träd`} tag="Bevis" />
            ))}
          </ResultGroup>
        </div>
      )}

      {target && <DetailModal target={target} onClose={() => setTarget(null)} onSearchAgain={runSearch} />}
    </section>
  );
}

function ResultGroup({ title, children, empty }: { title: string; children: React.ReactNode; empty: boolean }) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{title}</div>
      {empty ? (
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Inga träffar.</div>
      ) : (
        <div className="grid gap-1.5">{children}</div>
      )}
    </div>
  );
}

function ResultRow({ primary, secondary, tag, warn, onClick }: {
  primary: string; secondary?: string; tag?: string; warn?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="flex items-center justify-between gap-3 rounded-2xl border p-3 text-left transition hover:bg-[color:var(--mint-paper)]"
      style={{ borderColor: "var(--border)" }}>
      <div className="min-w-0">
        <div className="font-display font-medium truncate" style={{ color: "var(--forest)" }}>{primary}</div>
        {secondary && <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{secondary}</div>}
      </div>
      {tag && (
        <span className="shrink-0 rounded-full px-2.5 py-1 text-xs"
          style={{ background: warn ? "rgba(179,38,30,0.12)" : "var(--mint)", color: warn ? "var(--destructive)" : "var(--forest)" }}>
          {tag}
        </span>
      )}
    </button>
  );
}

// ---------- DETAIL MODAL ----------

function DetailModal({ target, onClose, onSearchAgain }: { target: Target; onClose: () => void; onSearchAgain: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto p-4 sm:p-8" style={{ background: "rgba(11,61,46,0.55)" }} onClick={onClose}>
      <div className="mx-auto w-full max-w-3xl rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
            {target.kind === "customer" && "Kunddetalj"}
            {target.kind === "seller" && "Kontodetalj"}
            {target.kind === "team" && "Lagdetalj"}
            {target.kind === "certificate" && "Bevisdetalj"}
          </div>
          <button onClick={onClose} className="btn-secondary !py-1.5 !px-3 text-sm">Stäng</button>
        </div>

        {target.kind === "customer" && <CustomerDetail id={target.id} onChanged={onSearchAgain} />}
        {target.kind === "seller" && <SellerDetail userId={target.userId} onChanged={onSearchAgain} />}
        {target.kind === "team" && <TeamDetail id={target.id} onChanged={onSearchAgain} />}
        {target.kind === "certificate" && (
          <CertificateDetail
            verificationId={target.verificationId}
            recipientName={target.recipientName}
            treeCount={target.treeCount}
          />
        )}
      </div>
    </div>
  );
}

function NotesBlock({ subjectType, subjectId }: { subjectType: "customer" | "seller" | "team" | "certificate" | "purchase"; subjectId: string }) {
  const list = useServerFn(listAdminNotes);
  const add = useServerFn(addAdminNote);
  const [notes, setNotes] = useState<{ id: string; note: string; createdAt: string; authorName: string }[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    try { setNotes((await list({ data: { subjectType, subjectId } })) as any); }
    catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { refresh().catch(() => {}); /* eslint-disable-next-line */ }, [subjectType, subjectId]);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr(null);
    try { await add({ data: { subjectType, subjectId, note: text.trim() } }); setText(""); await refresh(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
      <div className="font-display text-sm font-semibold">Interna noteringar</div>
      <div className="mt-2 flex gap-2">
        <input className="input-field flex-1 text-sm" placeholder="Lägg till notering (endast admin ser)"
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        <button className="btn-primary !py-2 !px-4 text-sm" disabled={busy} onClick={submit}>Spara</button>
      </div>
      {err && <div className="mt-2 text-xs" style={{ color: "var(--destructive)" }}>{err}</div>}
      <ul className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
        {notes.length === 0 && <li className="py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>Inga noteringar.</li>}
        {notes.map((n) => (
          <li key={n.id} className="py-2">
            <div className="text-sm">{n.note}</div>
            <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{n.authorName} · {fmtDate(n.createdAt)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CustomerDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const load = useServerFn(getCustomerDetail);
  const resend = useServerFn(supportResendCertificateEmail);
  const [state, setState] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [emailOverride, setEmailOverride] = useState<Record<string, string>>({});

  useEffect(() => { load({ data: { id } }).then(setState).catch((e) => setMsg((e as Error).message)); }, [id, load]);

  if (!state) return <div className="text-sm">Laddar…</div>;
  const c = state.customer;

  const resendOne = async (vid: string, defaultEmail: string) => {
    setMsg(null);
    const to = (emailOverride[vid] || defaultEmail).trim();
    try { await resend({ data: { verificationId: vid, toEmail: to } }); setMsg(`Bevismail skickat till ${to}.`); onChanged(); }
    catch (e) { setMsg((e as Error).message); }
  };

  return (
    <div>
      <h3 className="font-display text-xl font-semibold" style={{ color: "var(--forest)" }}>{c.name}</h3>
      <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{c.email} · sedan {fmtDate(c.created_at)}</div>

      {msg && <div className="mt-3 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--mint-paper)" }}>{msg}</div>}

      <div className="mt-4 text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Köp & bevis</div>
      <ul className="mt-2 divide-y" style={{ borderColor: "var(--border)" }}>
        {state.purchases.map((p: any) => (
          <li key={p.id} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="font-mono text-sm">{p.tree_count} träd · {kr(p.total_amount_ore)}</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{fmtDate(p.created_at)} · {p.recipient_email}</div>
              </div>
              {p.certificate && <span className="font-mono text-xs">{p.certificate.verification_id}</span>}
            </div>
            {p.certificate && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input className="input-field flex-1 !py-1.5 text-sm"
                  placeholder={p.recipient_email}
                  value={emailOverride[p.certificate.verification_id] ?? ""}
                  onChange={(e) => setEmailOverride({ ...emailOverride, [p.certificate.verification_id]: e.target.value })} />
                <button className="btn-secondary !py-1.5 !px-3 text-sm"
                  onClick={() => resendOne(p.certificate.verification_id, p.recipient_email)}>
                  Skicka om bevismail
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <NotesBlock subjectType="customer" subjectId={c.id} />
    </div>
  );
}

function SellerDetail({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const load = useServerFn(getSellerDetail);
  const reset = useServerFn(supportSendPasswordReset);
  const setDisabled = useServerFn(supportSetAccountDisabled);
  const [state, setState] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const refresh = () => load({ data: { userId } }).then(setState).catch((e) => setMsg((e as Error).message));
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [userId]);

  if (!state) return <div className="text-sm">Laddar…</div>;
  const p = state.profile;
  const isDisabled = !!p.disabled_at;

  const doReset = async () => {
    setMsg(null);
    try { const r = await reset({ data: { userId } }); setMsg(`Återställningsmail skickat till ${(r as any).email}.`); }
    catch (e) { setMsg((e as Error).message); }
  };
  const toggleDisabled = async () => {
    setMsg(null);
    try {
      await setDisabled({ data: { userId, disabled: !isDisabled } });
      setConfirmDisable(false);
      setMsg(isDisabled ? "Kontot återaktiverat." : "Kontot inaktiverat.");
      refresh(); onChanged();
    } catch (e) { setMsg((e as Error).message); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-display text-xl font-semibold" style={{ color: "var(--forest)" }}>{p.name || "Namnlös"}</h3>
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{p.email} · {p.account_type ?? "–"}</div>
          {p.is_minor && <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Minderårig · vårdnadshavare: {p.guardian_email}</div>}
        </div>
        {isDisabled && <span className="rounded-full px-2.5 py-1 text-xs" style={{ background: "rgba(179,38,30,0.12)", color: "var(--destructive)" }}>Inaktiverat</span>}
      </div>

      {state.team && (
        <div className="mt-3 rounded-2xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
          <div><span style={{ color: "var(--muted-foreground)" }}>Lag:</span> {state.team.name} · {state.team.role} · kod {state.team.join_code ?? "—"}</div>
        </div>
      )}

      {msg && <div className="mt-3 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--mint-paper)" }}>{msg}</div>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-secondary !py-2 !px-3 text-sm" onClick={doReset}>Skicka lösenordsåterställning</button>
        <button className="!py-2 !px-3 text-sm rounded-full"
          style={{ background: isDisabled ? "var(--mint)" : "rgba(179,38,30,0.1)", color: isDisabled ? "var(--forest)" : "var(--destructive)", border: "1px solid var(--border)" }}
          onClick={() => setConfirmDisable(true)}>
          {isDisabled ? "Återaktivera konto" : "Inaktivera konto"}
        </button>
      </div>

      <div className="mt-4 text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Registrerade planteringar</div>
      <ul className="mt-2 divide-y text-sm" style={{ borderColor: "var(--border)" }}>
        {state.purchases.length === 0 && <li className="py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>Inga.</li>}
        {state.purchases.map((pu: any) => (
          <li key={pu.id} className="flex items-baseline justify-between py-2">
            <div><span className="font-mono">{pu.tree_count} träd</span> · {pu.recipient_name} · {pu.recipient_email}</div>
            <div className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{fmtDate(pu.created_at)}</div>
          </li>
        ))}
      </ul>

      <NotesBlock subjectType="seller" subjectId={userId} />

      {confirmDisable && (
        <ConfirmBox
          title={isDisabled ? "Återaktivera kontot?" : "Inaktivera kontot?"}
          body={isDisabled
            ? "Kontot blir inloggningsbart igen omedelbart."
            : "Kontot kan inte logga in tills du återaktiverar det. Data och kopplingar bevaras."}
          confirmLabel={isDisabled ? "Återaktivera" : "Inaktivera"}
          onConfirm={toggleDisabled}
          onCancel={() => setConfirmDisable(false)}
        />
      )}
    </div>
  );
}

function TeamDetail({ id, onChanged: _onChanged }: { id: string; onChanged: () => void }) {
  const load = useServerFn(getTeamDetail);
  const [state, setState] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { load({ data: { id } }).then(setState).catch((e) => setMsg((e as Error).message)); }, [id, load]);
  if (!state) return <div className="text-sm">Laddar…</div>;
  const t = state.team;

  return (
    <div>
      <h3 className="font-display text-xl font-semibold" style={{ color: "var(--forest)" }}>{t.name}</h3>
      <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        Kod {t.join_code ?? "—"} · veckomål {t.weekly_goal_trees} · projekt {t.project_location ?? "—"}
      </div>
      {msg && <div className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>{msg}</div>}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatBox label="Träd totalt" value={String(state.finance.treesTotal)} />
        <StatBox label="Intäkt brutto" value={kr(state.finance.grossOre)} />
        <StatBox label="Lagets andel" value={kr(state.finance.teamShareOre)} />
      </div>

      {state.leader && (
        <div className="mt-4 rounded-2xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Ledare</div>
          <div className="mt-1">{state.leader.name} · <a href={`mailto:${state.leader.email}`} className="underline">{state.leader.email}</a></div>
        </div>
      )}

      <div className="mt-4 text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Medlemmar ({state.members.length})</div>
      <ul className="mt-2 divide-y text-sm" style={{ borderColor: "var(--border)" }}>
        {state.members.map((m: any) => (
          <li key={m.userId} className="flex items-baseline justify-between py-2">
            <div>{m.name} <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>({m.role})</span>{m.disabled && <span className="ml-2 text-xs" style={{ color: "var(--destructive)" }}>· inaktiverad</span>}</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{m.email ?? "—"}</div>
          </li>
        ))}
      </ul>

      <div className="mt-4 text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Utbetalningar</div>
      <ul className="mt-2 divide-y text-sm" style={{ borderColor: "var(--border)" }}>
        {state.payouts.length === 0 && <li className="py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>Inga.</li>}
        {state.payouts.map((p: any) => (
          <li key={p.id} className="flex items-baseline justify-between py-2">
            <div>{kr(p.amount_ore)} · <span style={{ color: "var(--muted-foreground)" }}>{p.status}</span></div>
            <div className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>{fmtDate(p.created_at)}</div>
          </li>
        ))}
      </ul>

      <div className="mt-4 text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Loggen</div>
      <ul className="mt-2 divide-y text-sm" style={{ borderColor: "var(--border)" }}>
        {state.feed.length === 0 && <li className="py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>Tomt.</li>}
        {state.feed.map((f: any) => (
          <li key={f.id} className="py-2">
            <div>{f.message}</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{fmtDate(f.created_at)}</div>
          </li>
        ))}
      </ul>

      <NotesBlock subjectType="team" subjectId={t.id} />
    </div>
  );
}

function CertificateDetail({ verificationId, recipientName, treeCount }: { verificationId: string; recipientName: string; treeCount: number }) {
  const resend = useServerFn(supportResendCertificateEmail);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async () => {
    setMsg(null);
    try { await resend({ data: { verificationId, toEmail: email.trim() } }); setMsg(`Bevismail skickat till ${email}.`); }
    catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div>
      <h3 className="font-display text-xl font-semibold" style={{ color: "var(--forest)" }}>{verificationId}</h3>
      <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{recipientName} · {treeCount} träd</div>
      <div className="mt-4 rounded-2xl border p-3" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-medium">Skicka om bevismail</div>
        <div className="mt-2 flex gap-2">
          <input className="input-field flex-1 !py-2 text-sm" placeholder="Mottagarens e-post"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary !py-2 !px-4 text-sm" onClick={submit}>Skicka</button>
        </div>
        {msg && <div className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>{msg}</div>}
      </div>
      <NotesBlock subjectType="certificate" subjectId={verificationId} />
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl p-3" style={{ background: "var(--mint-paper)", border: "1px solid var(--border)" }}>
      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="mt-1 font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>{value}</div>
    </div>
  );
}

function ConfirmBox({ title, body, confirmLabel, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-6" style={{ background: "rgba(11,61,46,0.55)" }} onClick={onCancel}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>{title}</div>
        <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary !py-2 !px-4 text-sm">Avbryt</button>
          <button onClick={onConfirm} className="btn-primary !py-2 !px-4 text-sm">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
