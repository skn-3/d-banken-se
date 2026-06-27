import { Fragment, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  listOrganizations, createOrganization, updateOrganization,
  listTeams, createTeam, updateTeam,
  listSellers, createSeller, removeSeller,
} from "@/lib/orgs.functions";
import { adminSetPassword } from "@/lib/admin.functions";
import { adminListRewards, adminCreateReward, adminUpdateReward, adminDeleteReward } from "@/lib/rewards.functions";

interface Org { id: string; name: string; type: string; team_count: number; tree_count: number }
interface Team { id: string; name: string; member_count: number; tree_count: number }
interface Seller { member_id: string; user_id: string; role: string; name: string; email: string; tree_count: number }

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
          <div key={t.id} className="flex items-center justify-between py-3">
            <div className="flex-1">
              {editingTeam?.id === t.id ? (
                <input className="input-field !py-1 !text-sm" value={editingTeam.name} onChange={e => setEditingTeam({ ...editingTeam, name: e.target.value })} />
              ) : (
                <>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {t.member_count} säljare · <span className="font-mono" style={{ color: "var(--forest)" }}>{t.tree_count.toLocaleString("sv-SE")} träd</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-2">
              {editingTeam?.id === t.id ? (
                <>
                  <button className="btn-primary !py-1 !px-2 text-xs" onClick={async () => {
                    await updateTeamFn({ data: { id: editingTeam.id, name: editingTeam.name } });
                    setEditingTeam(null); await reload();
                  }}>Spara</button>
                  <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setEditingTeam(null)}>Avbryt</button>
                </>
              ) : (
                <>
                  <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setEditingTeam(t)}>Byt namn</button>
                  <button className="btn-primary !py-1 !px-2 text-xs" onClick={() => setSelectedTeam(t)}>Öppna →</button>
                </>
              )}
            </div>
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
  const setPasswordFn = useServerFn(adminSetPassword);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const reload = async () => {
    const r = await listSellersFn({ data: { teamId: team.id } });
    setSellers(r.sellers as Seller[]);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [team.id]);

  const add = async () => {
    setMsg(null); setInviteLink(null);
    if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setMsg("Ange namn och giltig e-post."); return;
    }
    setBusy(true);
    try {
      const res = await createSellerFn({
        data: {
          teamId: team.id,
          name: name.trim(),
          email: email.trim(),
          role: "seller",
          redirectTo: `${window.location.origin}/reset-password`,
        },
      });
      setName(""); setEmail("");
      setMsg("Säljare tillagd.");
      if (res.actionLink) setInviteLink(res.actionLink);
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <section className="surface-card mt-6 p-6">
      <button className="btn-secondary !py-1 !px-3 text-sm" onClick={onBack}>← Tillbaka till {orgName}</button>
      <h2 className="font-display text-xl font-semibold mt-3">{team.name}</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
        {orgName} · <span className="font-mono" style={{ color: "var(--forest)" }}>{team.tree_count.toLocaleString("sv-SE")} träd totalt</span>
      </p>

      <div className="mt-6">
        <h3 className="font-display text-lg font-semibold">Lägg till säljare</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input className="input-field" placeholder="Namn" value={name} onChange={e => setName(e.target.value)} />
          <input className="input-field" placeholder="E-post" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn-primary" disabled={busy} onClick={add}>{busy ? "Lägger till…" : "+ Säljare"}</button>
        </div>
        {msg && <div className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>{msg}</div>}
        {inviteLink && (
          <div className="mt-2 rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)" }}>
            <div className="mb-1" style={{ color: "var(--muted-foreground)" }}>Inbjudningslänk (skicka manuellt om mail inte når fram):</div>
            <a href={inviteLink} target="_blank" rel="noreferrer" className="underline break-all" style={{ color: "var(--primary)" }}>{inviteLink}</a>
          </div>
        )}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
            <tr><th className="py-2">Namn</th><th>E-post</th><th>Träd</th><th></th></tr>
          </thead>
          <tbody>
            {sellers.map(s => (
              <Fragment key={s.member_id}>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-3">{s.name || <span style={{ color: "var(--muted-foreground)" }}>—</span>}</td>
                <td className="font-mono text-xs">{s.email}</td>
                <td className="font-mono font-semibold" style={{ color: "var(--forest)" }}>{s.tree_count.toLocaleString("sv-SE")}</td>
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      to="/saljare"
                      search={{ as: s.user_id }}
                      target="_blank"
                      className="btn-secondary !py-1 !px-2 text-xs"
                    >
                      Visa säljarvy
                    </Link>
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
                  <td colSpan={4} className="pb-3">
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
            {sellers.length === 0 && <tr><td colSpan={4} className="py-8 text-center" style={{ color: "var(--muted-foreground)" }}>Inga säljare än.</td></tr>}
          </tbody>
        </table>
      </div>

      <RewardsManager teamId={team.id} />
    </section>
  );
}

interface Reward {
  id: string; name: string; description: string | null;
  threshold_trees: number; category: string | null; image_url: string | null;
  active: boolean;
}

function RewardsManager({ teamId }: { teamId: string }) {
  const listFn = useServerFn(adminListRewards);
  const createFn = useServerFn(adminCreateReward);
  const updateFn = useServerFn(adminUpdateReward);
  const deleteFn = useServerFn(adminDeleteReward);

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState<number>(10);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Reward | null>(null);

  const reload = async () => {
    const r = await listFn({ data: { teamId } });
    setRewards(r.rewards as Reward[]);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [teamId]);

  const add = async () => {
    if (!name.trim() || threshold < 0) return;
    setBusy(true);
    try {
      await createFn({ data: { teamId, name: name.trim(), thresholdTrees: threshold, description: description.trim() || null, category: category.trim() || null, imageUrl: null, active: true } });
      setName(""); setThreshold(10); setDescription(""); setCategory("");
      await reload();
    } finally { setBusy(false); }
  };

  const save = async (r: Reward) => {
    await updateFn({ data: { id: r.id, teamId, name: r.name, thresholdTrees: r.threshold_trees, description: r.description, category: r.category, imageUrl: r.image_url, active: r.active } });
    setEditing(null); await reload();
  };

  return (
    <div className="mt-8">
      <h3 className="font-display text-lg font-semibold">🎁 Belöningar</h3>
      <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
        Belöningar låses upp automatiskt när säljarens totalt sålda träd når tröskeln. Inlösning minskar inte träd.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <input className="input-field !py-2 !text-sm" placeholder="Namn (t.ex. Biobiljett)" value={name} onChange={e => setName(e.target.value)} />
        <input className="input-field !py-2 !text-sm" placeholder="Kategori (valfri)" value={category} onChange={e => setCategory(e.target.value)} />
        <input className="input-field !py-2 !text-sm font-mono" type="number" min={0} placeholder="Tröskel" value={threshold} onChange={e => setThreshold(Math.max(0, Number(e.target.value) || 0))} />
        <button className="btn-primary !py-2 !px-3 text-sm" disabled={busy} onClick={add}>+ Belöning</button>
      </div>
      <textarea className="input-field mt-2 !py-2 !text-sm w-full" placeholder="Beskrivning (valfri)" rows={2} value={description} onChange={e => setDescription(e.target.value)} />

      <div className="mt-4 divide-y" style={{ borderColor: "var(--border)" }}>
        {rewards.map(r => (
          <div key={r.id} className="py-3">
            {editing?.id === r.id ? (
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto_auto]">
                <input className="input-field !py-1 !text-sm" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                <input className="input-field !py-1 !text-sm" value={editing.category ?? ""} placeholder="Kategori" onChange={e => setEditing({ ...editing, category: e.target.value })} />
                <input className="input-field !py-1 !text-sm font-mono" type="number" min={0} value={editing.threshold_trees} onChange={e => setEditing({ ...editing, threshold_trees: Math.max(0, Number(e.target.value) || 0) })} />
                <button className="btn-primary !py-1 !px-2 text-xs" onClick={() => save(editing)}>Spara</button>
                <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setEditing(null)}>Avbryt</button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="chip !py-0.5 !text-[10px] font-mono" style={{ color: "var(--forest)" }}>{r.threshold_trees} träd</span>
                    {r.category && <span className="chip !py-0.5 !text-[10px]">{r.category}</span>}
                    {!r.active && <span className="chip !py-0.5 !text-[10px]" style={{ background: "var(--muted)" }}>inaktiv</span>}
                  </div>
                  {r.description && <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{r.description}</div>}
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setEditing(r)}>Redigera</button>
                  <button className="btn-secondary !py-1 !px-2 text-xs" onClick={async () => {
                    await updateFn({ data: { id: r.id, teamId, name: r.name, thresholdTrees: r.threshold_trees, description: r.description, category: r.category, imageUrl: r.image_url, active: !r.active } });
                    await reload();
                  }}>{r.active ? "Inaktivera" : "Aktivera"}</button>
                  <button className="btn-secondary !py-1 !px-2 text-xs" onClick={async () => {
                    if (!confirm(`Ta bort belöningen "${r.name}"?`)) return;
                    await deleteFn({ data: { id: r.id } }); await reload();
                  }}>Ta bort</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {rewards.length === 0 && <p className="py-4 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Inga belöningar än.</p>}
      </div>
    </div>
  );
}

