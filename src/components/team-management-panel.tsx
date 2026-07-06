import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AvatarCircle, useSignedAvatars, type AvatarSubject } from "@/components/user-avatar";
import {
  getTeamManagement,
  updateTeamSettings,
  updateTeamCertTemplate,
  removeTeamMember,
  rotateJoinCode,
} from "@/lib/team-management.functions";
import { listCertificateTemplatesPublic } from "@/lib/team-signup.functions";

type Member = {
  userId: string;
  role: "seller" | "team_leader";
  firstName: string;
  avatarKey: string | null;
  photoPath: string | null;
  trees: number;
  weekTrees: number;
  streak: number;
  lastActiveAt: string | null;
  daysSinceActive: number | null;
  idle: boolean;
};

type State = {
  isLeader: true;
  team: {
    id: string;
    name: string;
    weeklyGoal: number;
    goalTrees: number | null;
    goalEndDate: string | null;
    projectLocation: string | null;
    showTeamNameOnCertificate: boolean;
    joinCode: string | null;
    certTemplateId: string | null;
    certTemplate: { id: string; slug: string; namn: string; kort_url: string | null } | null;
  };
  hasSales: boolean;
  members: Member[];
} | { isLeader: false };

type SortKey = "name" | "trees" | "week" | "streak" | "lastActive";

function relative(iso: string | null): string {
  if (!iso) return "aldrig";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "idag";
  if (days === 1) return "igår";
  if (days < 7) return `${days} dagar sen`;
  if (days < 30) return `${Math.floor(days / 7)} v sen`;
  return `${Math.floor(days / 30)} mån sen`;
}

export function TeamManagementPanel() {
  const loadFn = useServerFn(getTeamManagement);
  const updateFn = useServerFn(updateTeamSettings);
  const removeFn = useServerFn(removeTeamMember);
  const rotateFn = useServerFn(rotateJoinCode);

  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("trees");
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [editing, setEditing] = useState(false);

  const [form, setForm] = useState({ name: "", weeklyGoal: 0, goalTrees: "", goalEndDate: "", showTeamName: true });

  const refresh = async () => {
    setLoading(true);
    try {
      const r = (await loadFn()) as State;
      setState(r);
      if (r.isLeader) {
        setForm({
          name: r.team.name,
          weeklyGoal: r.team.weeklyGoal,
          goalTrees: r.team.goalTrees != null ? String(r.team.goalTrees) : "",
          goalEndDate: r.team.goalEndDate ?? "",
          showTeamName: r.team.showTeamNameOnCertificate,
        });
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh().catch(() => {}); }, []); // eslint-disable-line

  const members = state && state.isLeader ? state.members : [];
  const avatarSubjects: AvatarSubject[] = useMemo(
    () => members.map((m) => ({ user_id: m.userId, avatar_key: m.avatarKey, photo_path: m.photoPath, first_name: m.firstName })),
    [members],
  );
  const urls = useSignedAvatars(avatarSubjects);

  const sorted = useMemo(() => {
    const copy = [...members];
    copy.sort((a, b) => {
      switch (sortBy) {
        case "name": return a.firstName.localeCompare(b.firstName, "sv");
        case "week": return b.weekTrees - a.weekTrees;
        case "streak": return b.streak - a.streak;
        case "lastActive": {
          const at = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
          const bt = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
          return bt - at;
        }
        default: return b.trees - a.trees;
      }
    });
    return copy;
  }, [members, sortBy]);

  if (loading) return null;
  if (!state || !state.isLeader) return null;

  const submitEdit = async () => {
    setMsg(null);
    try {
      await updateFn({ data: {
        name: form.name.trim() || undefined,
        weeklyGoal: Number(form.weeklyGoal) || 0,
        goalTrees: form.goalTrees.trim() === "" ? null : Number(form.goalTrees),
        goalEndDate: form.goalEndDate.trim() === "" ? null : form.goalEndDate,
        showTeamNameOnCertificate: form.showTeamName,
      } });
      setEditing(false);
      setMsg("Sparat.");
      await refresh();
    } catch (e) { setMsg((e as Error).message); }
  };

  const removeMember = async (m: Member) => {
    setMsg(null);
    try {
      await removeFn({ data: { userId: m.userId } });
      setConfirmRemove(null);
      setMsg(`${m.firstName} togs bort ur laget.`);
      await refresh();
    } catch (e) { setMsg((e as Error).message); }
  };

  const rotate = async () => {
    setMsg(null);
    try {
      const r = await rotateFn();
      setConfirmRotate(false);
      setMsg(`Ny lagkod: ${r.joinCode}`);
      await refresh();
    } catch (e) { setMsg((e as Error).message); }
  };

  const team = state.team;

  return (
    <section className="surface-card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold" style={{ color: "var(--forest)" }}>Laghantering</h2>
        <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>{members.length} medlemmar</span>
      </div>

      {msg && <div className="mt-3 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--mint-paper)" }}>{msg}</div>}

      {/* MEDLEMSLISTA */}
      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
          <span>Sortera:</span>
          {([
            ["trees", "Träd totalt"],
            ["week", "Denna vecka"],
            ["streak", "Streak"],
            ["lastActive", "Senast aktiv"],
            ["name", "Namn"],
          ] as [SortKey, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSortBy(k)}
              className="rounded-full px-3 py-1"
              style={{
                background: sortBy === k ? "var(--forest)" : "transparent",
                color: sortBy === k ? "white" : "var(--forest)",
                border: "1px solid var(--border)",
              }}
            >{label}</button>
          ))}
        </div>

        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {sorted.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-3">
              <AvatarCircle subject={{ user_id: m.userId, avatar_key: m.avatarKey, photo_path: m.photoPath, first_name: m.firstName }} size={40} urls={urls} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-display font-semibold" style={{ color: "var(--forest)" }}>{m.firstName}</span>
                  {m.role === "team_leader" && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider" style={{ background: "var(--mint)", color: "var(--forest)" }}>Ledare</span>
                  )}
                  {m.idle && m.role !== "team_leader" && (
                    <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: "rgba(246,178,122,0.25)", color: "#7A3B00" }}>
                      Behöver en push?
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-3 text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                  <span>🌳 {m.trees}</span>
                  <span>V: {m.weekTrees}</span>
                  <span>🔥 {m.streak}</span>
                  <span>· {relative(m.lastActiveAt)}</span>
                </div>
              </div>
              {m.role !== "team_leader" && (
                <button
                  onClick={() => setConfirmRemove(m)}
                  className="text-xs rounded-full border px-3 py-1.5"
                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                >Ta bort</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* REDIGERA LAGET */}
      <div className="mt-8 rounded-2xl border p-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>Redigera laget</h3>
          {!editing && (
            <button onClick={() => setEditing(true)} className="btn-secondary !py-1.5 !px-3 text-sm">Ändra</button>
          )}
        </div>

        {!editing ? (
          <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Lagnamn</dt><dd>{team.name}</dd></div>
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Veckomål</dt><dd>{team.weeklyGoal} träd/vecka</dd></div>
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Kampanjmål</dt><dd>{team.goalTrees ? `${team.goalTrees} träd${team.goalEndDate ? ` till ${team.goalEndDate}` : ""}` : "—"}</dd></div>
            <div><dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Lagnamn på bevis</dt><dd>{team.showTeamNameOnCertificate ? "Ja" : "Nej"}</dd></div>
            <div className="sm:col-span-2">
              <dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>Projekt</dt>
              <dd>
                {team.projectLocation ?? "—"}
                {state.hasSales && (
                  <span className="ml-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    🔒 Låst — trädbeviset är redan utfärdat för sålda träd.
                  </span>
                )}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="mt-4 grid gap-3">
            <label className="block text-sm">
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Lagnamn</span>
              <input className="input-field mt-1 w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Veckomål (träd/vecka)</span>
              <input type="number" min={0} className="input-field mt-1 w-full" value={form.weeklyGoal} onChange={(e) => setForm({ ...form, weeklyGoal: Number(e.target.value) })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Kampanjmål (träd)</span>
                <input type="number" min={0} className="input-field mt-1 w-full" value={form.goalTrees} onChange={(e) => setForm({ ...form, goalTrees: e.target.value })} />
              </label>
              <label className="block text-sm">
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Slutdatum</span>
                <input type="date" className="input-field mt-1 w-full" value={form.goalEndDate} onChange={(e) => setForm({ ...form, goalEndDate: e.target.value })} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.showTeamName} onChange={(e) => setForm({ ...form, showTeamName: e.target.checked })} />
              Visa lagnamn på värdebeviset
            </label>
            {state.hasSales && (
              <p className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                🔒 Projektval kan inte ändras — värdebevis har redan skickats till kunder som köpt träd i det valda projektet.
              </p>
            )}
            <div className="mt-1 flex gap-2">
              <button onClick={submitEdit} className="btn-primary !py-2 !px-4 text-sm">Spara</button>
              <button onClick={() => setEditing(false)} className="btn-secondary !py-2 !px-4 text-sm">Avbryt</button>
            </div>
          </div>
        )}
      </div>

      {/* LAGKOD */}
      <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>Lagkod</h3>
            <div className="mt-1 font-mono text-2xl tracking-widest" style={{ color: "var(--forest)" }}>{team.joinCode ?? "—"}</div>
          </div>
          <button onClick={() => setConfirmRotate(true)} className="btn-secondary !py-2 !px-4 text-sm">Skapa ny kod</button>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
          Dela endast med säljare i laget. Om koden spridits fel — skapa en ny.
        </p>
      </div>

      {/* Confirm remove modal */}
      {confirmRemove && (
        <Modal onClose={() => setConfirmRemove(null)}>
          <h3 className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>Ta bort {confirmRemove.firstName}?</h3>
          <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
            {confirmRemove.firstName} tas bort ur laget. Kontot finns kvar — bara kopplingen till er försvinner.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setConfirmRemove(null)} className="btn-secondary !py-2 !px-4 text-sm">Avbryt</button>
            <button onClick={() => removeMember(confirmRemove)} className="btn-primary !py-2 !px-4 text-sm" style={{ background: "var(--destructive)" }}>Ta bort</button>
          </div>
        </Modal>
      )}

      {/* Confirm rotate modal */}
      {confirmRotate && (
        <Modal onClose={() => setConfirmRotate(false)}>
          <h3 className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>Skapa ny lagkod?</h3>
          <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Den gamla koden slutar gälla direkt. Säljare som redan är med i laget påverkas inte, men nya måste få den nya koden.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setConfirmRotate(false)} className="btn-secondary !py-2 !px-4 text-sm">Avbryt</button>
            <button onClick={rotate} className="btn-primary !py-2 !px-4 text-sm">Skapa ny kod</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(11,61,46,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
