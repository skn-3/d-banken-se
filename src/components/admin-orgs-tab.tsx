import { Fragment, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  listOrganizations, createOrganization, updateOrganization,
  listTeams, createTeam, updateTeam,
  listSellers, createSeller, removeSeller,
  bulkInviteSellers, resendInvite,
} from "@/lib/orgs.functions";
import { adminSetPassword } from "@/lib/admin.functions";
import { adminChangeTeamLeader } from "@/lib/admin-extra.functions";

interface Org { id: string; name: string; type: string; team_count: number; tree_count: number }
interface Team { id: string; name: string; member_count: number; tree_count: number; weekly_goal_trees?: number | null; team_bonus_points?: number | null }
interface Seller { member_id: string; user_id: string; role: string; name: string; email: string; tree_count: number; activated?: boolean }

export function AdminOrgsTab() {
  const listOrgs = useServerFn(listOrganizations);
  const createOrg = useServerFn(createOrganization);
  const updateOrg = useServerFn(updateOrganization);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgType, setNewOrgType] = useState<"school" | "company">("school");
  const [editingOrg, setEditingOrg] = useState<Org | null>(null);

  const reload = async () => {
    const r = await listOrgs();
    setOrgs(r.organizations as Org[]);
  };

  useEffect(() => {
    (async () => { await reload(); setLoading(false); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="surface-card mt-6 p-8 text-center" style={{ color: "var(--muted-foreground)" }}>Laddar…</div>;

  if (selectedOrg) {
    return (
      <OrgDetail
        org={selectedOrg}
        onBack={async () => { setSelectedOrg(null); await reload(); }}
      />
    );
  }

  return (
    <section className="surface-card mt-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Organisationer</h2>
        <button className="btn-primary" onClick={() => setShowNewOrg(true)}>+ Ny organisation</button>
      </div>

      {showNewOrg && (
        <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input className="input-field" placeholder="Namn" value={newOrgName} onChange={e => setNewOrgName(e.target.value)} />
            <select className="input-field" value={newOrgType} onChange={e => setNewOrgType(e.target.value as "school" | "company")}>
              <option value="school">Skola</option>
              <option value="company">Företag</option>
            </select>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={async () => {
                if (!newOrgName.trim()) return;
                await createOrg({ data: { name: newOrgName.trim(), type: newOrgType } });
                setNewOrgName(""); setShowNewOrg(false); await reload();
              }}>Skapa</button>
              <button className="btn-secondary" onClick={() => { setShowNewOrg(false); setNewOrgName(""); }}>Avbryt</button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
            <tr><th className="py-2">Namn</th><th>Typ</th><th>Team</th><th>Träd</th><th></th></tr>
          </thead>
          <tbody>
            {orgs.map(o => (
              <tr key={o.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-3">
                  {editingOrg?.id === o.id ? (
                    <input className="input-field !py-1 !text-sm" value={editingOrg.name} onChange={e => setEditingOrg({ ...editingOrg, name: e.target.value })} />
                  ) : <span className="font-medium">{o.name}</span>}
                </td>
                <td>
                  {editingOrg?.id === o.id ? (
                    <select className="input-field !py-1 !text-sm" value={editingOrg.type} onChange={e => setEditingOrg({ ...editingOrg, type: e.target.value })}>
                      <option value="school">Skola</option>
                      <option value="company">Företag</option>
                    </select>
                  ) : (
                    <span className="chip !py-0.5 !text-xs">{o.type === "school" ? "Skola" : "Företag"}</span>
                  )}
                </td>
                <td className="font-mono">{o.team_count}</td>
                <td className="font-mono font-semibold" style={{ color: "var(--forest)" }}>{o.tree_count.toLocaleString("sv-SE")}</td>
                <td className="text-right">
                  {editingOrg?.id === o.id ? (
                    <div className="flex justify-end gap-2">
                      <button className="btn-primary !py-1 !px-2 text-xs" onClick={async () => {
                        await updateOrg({ data: { id: editingOrg.id, name: editingOrg.name, type: editingOrg.type as "school" | "company" } });
                        setEditingOrg(null); await reload();
                      }}>Spara</button>
                      <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setEditingOrg(null)}>Avbryt</button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setEditingOrg(o)}>Redigera</button>
                      <button className="btn-primary !py-1 !px-2 text-xs" onClick={() => setSelectedOrg(o)}>Öppna →</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {orgs.length === 0 && <tr><td colSpan={5} className="py-8 text-center" style={{ color: "var(--muted-foreground)" }}>Inga organisationer än.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OrgDetail({ org, onBack }: { org: Org; onBack: () => void }) {
  const listTeamsFn = useServerFn(listTeams);
  const createTeamFn = useServerFn(createTeam);
  const updateTeamFn = useServerFn(updateTeam);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  const reload = async () => {
    const r = await listTeamsFn({ data: { organizationId: org.id } });
    setTeams(r.teams as Team[]);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [org.id]);

  if (selectedTeam) {
    return (
      <TeamDetail
        team={selectedTeam}
        orgName={org.name}
        onBack={async () => { setSelectedTeam(null); await reload(); }}
      />
    );
  }

  return (
    <section className="surface-card mt-6 p-6">
      <button className="btn-secondary !py-1 !px-3 text-sm" onClick={onBack}>← Alla organisationer</button>
      <h2 className="font-display text-xl font-semibold mt-3">{org.name}</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
        {org.type === "school" ? "Skola" : "Företag"} · {org.tree_count.toLocaleString("sv-SE")} träd totalt
      </p>

      <div className="mt-6 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Team</h3>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <input className="input-field" placeholder="Nytt team-namn" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} />
        <button className="btn-primary" onClick={async () => {
          if (!newTeamName.trim()) return;
          await createTeamFn({ data: { organizationId: org.id, name: newTeamName.trim() } });
          setNewTeamName(""); await reload();
        }}>+ Lägg till team</button>
      </div>

      <div className="mt-4 divide-y" style={{ borderColor: "var(--border)" }}>
        {teams.map(t => (
          <div key={t.id} className="py-3">
            {editingTeam?.id === t.id ? (
              <div className="space-y-2">
                <input className="input-field !py-1 !text-sm" value={editingTeam.name} onChange={e => setEditingTeam({ ...editingTeam, name: e.target.value })} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-xs" style={{ color: "var(--muted-foreground)" }}>
                    Veckomål (träd) — 0 stänger av lag-bonus
                    <input
                      type="number" min={0} max={100000}
                      className="input-field !py-1 !text-sm mt-1 w-full"
                      value={editingTeam.weekly_goal_trees ?? 0}
                      onChange={e => setEditingTeam({ ...editingTeam, weekly_goal_trees: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                  <label className="block text-xs" style={{ color: "var(--muted-foreground)" }}>
                    Lag-bonus (poäng per medlem)
                    <input
                      type="number" min={0} max={100000}
                      className="input-field !py-1 !text-sm mt-1 w-full"
                      value={editingTeam.team_bonus_points ?? 0}
                      onChange={e => setEditingTeam({ ...editingTeam, team_bonus_points: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary !py-1 !px-2 text-xs" onClick={async () => {
                    await updateTeamFn({ data: {
                      id: editingTeam.id,
                      name: editingTeam.name,
                      weeklyGoalTrees: editingTeam.weekly_goal_trees ?? 0,
                      teamBonusPoints: editingTeam.team_bonus_points ?? 0,
                    } });
                    setEditingTeam(null); await reload();
                  }}>Spara</button>
                  <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setEditingTeam(null)}>Avbryt</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {t.member_count} säljare · <span className="font-mono" style={{ color: "var(--forest)" }}>{t.tree_count.toLocaleString("sv-SE")} träd</span>
                    {" · "}
                    {t.weekly_goal_trees && t.weekly_goal_trees > 0
                      ? <>Veckomål: <span className="font-mono">{t.weekly_goal_trees}</span> träd → <span className="font-mono">+{t.team_bonus_points ?? 0}</span> p/medlem</>
                      : <span style={{ color: "var(--muted-foreground)" }}>Lag-bonus av</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setEditingTeam(t)}>Redigera</button>
                  <button className="btn-primary !py-1 !px-2 text-xs" onClick={() => setSelectedTeam(t)}>Öppna →</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {teams.length === 0 && <p className="py-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Inga team än.</p>}
      </div>
    </section>
  );
}


function TeamDetail({ team, orgName, onBack }: { team: Team; orgName: string; onBack: () => void }) {
  const listSellersFn = useServerFn(listSellers);
  const createSellerFn = useServerFn(createSeller);
  const removeSellerFn = useServerFn(removeSeller);
  const bulkInviteFn = useServerFn(bulkInviteSellers);
  const resendInviteFn = useServerFn(resendInvite);
  const setPasswordFn = useServerFn(adminSetPassword);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"seller" | "team_leader">("seller");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState<Record<string, string>>({});

  // Bulk invite
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkRole, setBulkRole] = useState<"seller" | "team_leader">("seller");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResults, setBulkResults] = useState<Array<{ email: string; ok: boolean; error?: string; emailOk?: boolean }> | null>(null);

  const reload = async () => {
    const r = await listSellersFn({ data: { teamId: team.id } });
    setSellers(r.sellers as Seller[]);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [team.id]);

  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/aktivera` : "https://app.smartklimat.org/aktivera";

  const add = async () => {
    setMsg(null); setInviteLink(null);
    if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setMsg("Ange namn och giltig e-post."); return;
    }
    setBusy(true);
    try {
      const res = await createSellerFn({
        data: { teamId: team.id, name: name.trim(), email: email.trim(), role, redirectTo, sendEmail: true },
      });
      setName(""); setEmail("");
      setMsg(res.emailOk ? "Inbjudan skickad via mejl." : `Säljare tillagd, men mejl misslyckades: ${res.emailError ?? ""}`);
      if (res.actionLink) setInviteLink(res.actionLink);
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally { setBusy(false); }
  };

  const runBulk = async () => {
    const emails = bulkText.split(/[\s,;\n]+/).map(s => s.trim()).filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
    if (!emails.length) { setBulkResults([{ email: "(ingen)", ok: false, error: "Inga giltiga e-postadresser hittades." }]); return; }
    setBulkBusy(true); setBulkResults(null);
    try {
      const r = await bulkInviteFn({ data: { teamId: team.id, role: bulkRole, emails, redirectTo } });
      setBulkResults(r.results);
      await reload();
    } catch (e) {
      setBulkResults([{ email: "(fel)", ok: false, error: (e as Error).message }]);
    } finally { setBulkBusy(false); }
  };

  return (
    <section className="surface-card mt-6 p-6">
      <button className="btn-secondary !py-1 !px-3 text-sm" onClick={onBack}>← Tillbaka till {orgName}</button>
      <h2 className="font-display text-xl font-semibold mt-3">{team.name}</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
        {orgName} · <span className="font-mono" style={{ color: "var(--forest)" }}>{team.tree_count.toLocaleString("sv-SE")} träd totalt</span>
      </p>

      <ChangeLeaderBlock teamId={team.id} teamName={team.name} sellers={sellers} onDone={reload} />

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Bjud in säljare</h3>
          <button className="btn-secondary !py-1 !px-3 text-xs" onClick={() => { setBulkOpen(v => !v); setBulkResults(null); }}>
            {bulkOpen ? "Stäng bulk" : "Bjud in flera (bulk)"}
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input className="input-field" placeholder="Namn" value={name} onChange={e => setName(e.target.value)} />
          <input className="input-field" placeholder="E-post" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <select className="input-field" value={role} onChange={e => setRole(e.target.value as "seller" | "team_leader")}>
            <option value="seller">Säljare</option>
            <option value="team_leader">Team-ledare</option>
          </select>
          <button className="btn-primary" disabled={busy} onClick={add}>{busy ? "Bjuder in…" : "Bjud in"}</button>
        </div>
        {msg && <div className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>{msg}</div>}
        {inviteLink && (
          <div className="mt-2 rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)" }}>
            <div className="mb-1" style={{ color: "var(--muted-foreground)" }}>Aktiveringslänk (skicka manuellt om mail inte når fram):</div>
            <a href={inviteLink} target="_blank" rel="noreferrer" className="underline break-all" style={{ color: "var(--primary)" }}>{inviteLink}</a>
          </div>
        )}

        {bulkOpen && (
          <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
            <div className="text-sm font-medium">Klistra in flera e-postadresser</div>
            <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              En per rad, eller separerade med komma/mellanslag. Namn gissas från e-postdelen före @ och kan ändras senare.
            </p>
            <textarea
              className="input-field mt-3 min-h-32 font-mono text-xs"
              placeholder="anna@mockfjards.se&#10;erik@mockfjards.se&#10;lisa@mockfjards.se"
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <select className="input-field !py-2 !text-sm" value={bulkRole} onChange={e => setBulkRole(e.target.value as "seller" | "team_leader")}>
                <option value="seller">Säljare</option>
                <option value="team_leader">Team-ledare</option>
              </select>
              <button className="btn-primary" disabled={bulkBusy} onClick={runBulk}>
                {bulkBusy ? "Bjuder in…" : "Bjud in alla"}
              </button>
            </div>
            {bulkResults && (
              <div className="mt-3 max-h-60 overflow-y-auto rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)" }}>
                {bulkResults.map((r, i) => (
                  <div key={i} className="flex items-center justify-between border-b py-1 last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <span className="font-mono">{r.email}</span>
                    {r.ok
                      ? <span style={{ color: "var(--forest)" }}>✓ {r.emailOk ? "Inbjuden + mejl skickat" : "Inbjuden (mejl misslyckades)"}</span>
                      : <span style={{ color: "var(--destructive)" }}>✗ {r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
            <tr><th className="py-2">Namn</th><th>E-post</th><th>Status</th><th>Träd</th><th></th></tr>
          </thead>
          <tbody>
            {sellers.map(s => (
              <Fragment key={s.member_id}>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-3">{s.name || <span style={{ color: "var(--muted-foreground)" }}>—</span>}</td>
                <td className="font-mono text-xs">{s.email}</td>
                <td>
                  {s.activated
                    ? <span className="chip !py-0.5 !text-xs" style={{ background: "rgba(30,158,106,0.12)", color: "var(--forest)" }}>Aktiverad</span>
                    : <span className="chip !py-0.5 !text-xs" style={{ background: "rgba(234,179,8,0.15)", color: "#92760a" }}>Inbjuden</span>}
                  {resendMsg[s.user_id] && <div className="mt-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>{resendMsg[s.user_id]}</div>}
                </td>
                <td className="font-mono font-semibold" style={{ color: "var(--forest)" }}>{s.tree_count.toLocaleString("sv-SE")}</td>
                <td className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {!s.activated && (
                      <button className="btn-secondary !py-1 !px-2 text-xs" onClick={async () => {
                        setResendMsg(m => ({ ...m, [s.user_id]: "Skickar…" }));
                        try {
                          const r = await resendInviteFn({ data: { teamId: team.id, email: s.email, name: s.name || undefined, redirectTo } });
                          setResendMsg(m => ({ ...m, [s.user_id]: r.emailOk ? "Skickat ✓" : `Misslyckades: ${r.emailError ?? ""}` }));
                        } catch (e) {
                          setResendMsg(m => ({ ...m, [s.user_id]: (e as Error).message }));
                        }
                      }}>Skicka igen</button>
                    )}
                    <Link to="/saljare" search={{ as: s.user_id }} target="_blank" className="btn-secondary !py-1 !px-2 text-xs">Visa säljarvy</Link>
                    <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => {
                      setPwFor(pwFor === s.user_id ? null : s.user_id);
                      setPwValue(""); setPwMsg(null);
                    }}>Sätt lösenord</button>
                    <button className="btn-secondary !py-1 !px-2 text-xs" onClick={async () => {
                      if (!confirm(`Ta bort ${s.email} från ${team.name}?`)) return;
                      await removeSellerFn({ data: { memberId: s.member_id } });
                      await reload();
                    }}>Ta bort</button>
                  </div>
                </td>
              </tr>
              {pwFor === s.user_id && (
                <tr key={s.member_id + "-pw"}>
                  <td colSpan={5} className="pb-3">
                    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                        <input className="input-field !py-1 !text-sm" type="text" placeholder="Nytt lösenord (minst 8 tecken)"
                          value={pwValue} onChange={e => setPwValue(e.target.value)} />
                        <button className="btn-primary !py-1 !px-3 text-xs" onClick={() => {
                          const gen = Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6) + "!A1";
                          setPwValue(gen);
                        }}>Generera</button>
                        <button className="btn-primary !py-1 !px-3 text-xs" onClick={async () => {
                          if (pwValue.length < 8) { setPwMsg("Minst 8 tecken."); return; }
                          try {
                            await setPasswordFn({ data: { targetUserId: s.user_id, newPassword: pwValue } });
                            setPwMsg(`Lösenord satt: ${pwValue}`);
                          } catch (e) { setPwMsg((e as Error).message); }
                        }}>Spara</button>
                      </div>
                      {pwMsg && <div className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>{pwMsg}</div>}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {sellers.length === 0 && <tr><td colSpan={5} className="py-8 text-center" style={{ color: "var(--muted-foreground)" }}>Inga säljare än.</td></tr>}
          </tbody>
        </table>
      </div>

    </section>
  );
}



