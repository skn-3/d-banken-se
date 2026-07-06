import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListDeals, adminUpsertDeal, adminDeleteDeal,
  adminListClaims, adminListCompetitions, adminUpsertCompetition, adminDeleteCompetition,
} from "@/lib/club.functions";

interface DealRow {
  id: string; title: string; partner_name: string; description: string;
  lov_cost: number; code_type: "static" | "unique"; code_data: { code?: string; codes?: string[] };
  stock: number | null; active: boolean; sort: number;
}
interface CompRow { id: string; title: string; description: string; end_date: string | null; active: boolean }
interface ClaimRow { id: string; created_at: string; code_issued: string; lov_cost: number; user_id: string; partner_deals: { title: string; partner_name: string } | null }

const EMPTY_DEAL: Omit<DealRow, "id"> & { id?: string } = {
  title: "", partner_name: "", description: "", lov_cost: 100,
  code_type: "static", code_data: { code: "" }, stock: null, active: true, sort: 0,
};

export function AdminClubSection() {
  const listDeals = useServerFn(adminListDeals);
  const upsertDeal = useServerFn(adminUpsertDeal);
  const deleteDeal = useServerFn(adminDeleteDeal);
  const listComps = useServerFn(adminListCompetitions);
  const upsertComp = useServerFn(adminUpsertCompetition);
  const deleteComp = useServerFn(adminDeleteCompetition);
  const listClaims = useServerFn(adminListClaims);

  const [deals, setDeals] = useState<DealRow[]>([]);
  const [comps, setComps] = useState<CompRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [editing, setEditing] = useState<(typeof EMPTY_DEAL) | null>(null);
  const [codeStatic, setCodeStatic] = useState("");
  const [codeUnique, setCodeUnique] = useState("");
  const [editComp, setEditComp] = useState<CompRow | null>(null);

  const reload = () => {
    listDeals().then((d) => setDeals(d as DealRow[])).catch(() => {});
    listComps().then((c) => setComps(c as CompRow[])).catch(() => {});
    listClaims().then((c) => setClaims(c as ClaimRow[])).catch(() => {});
  };
  useEffect(reload, [listDeals, listComps, listClaims]);

  const openEdit = (d?: DealRow) => {
    const base = d ?? EMPTY_DEAL;
    setEditing(base);
    setCodeStatic(base.code_data?.code ?? "");
    setCodeUnique((base.code_data?.codes ?? []).join("\n"));
  };

  const save = async () => {
    if (!editing) return;
    await upsertDeal({ data: {
      id: editing.id, title: editing.title, partner_name: editing.partner_name,
      description: editing.description, lov_cost: editing.lov_cost,
      code_type: editing.code_type, code_static: codeStatic, code_unique_list: codeUnique,
      stock: editing.stock, active: editing.active, sort: editing.sort,
    }});
    setEditing(null);
    reload();
  };

  const del = async (id: string) => {
    if (!confirm("Radera dealen?")) return;
    await deleteDeal({ data: { id } });
    reload();
  };

  const saveComp = async () => {
    if (!editComp) return;
    await upsertComp({ data: {
      id: editComp.id || undefined, title: editComp.title, description: editComp.description,
      end_date: editComp.end_date || null, active: editComp.active,
    }});
    setEditComp(null); reload();
  };

  return (
    <>
      <section className="surface-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Trädbanken · Deals</h2>
          <button className="btn-primary !py-1.5 !px-3 text-sm" onClick={() => openEdit()}>+ Ny deal</button>
        </div>
        <div className="mt-4 space-y-2">
          {deals.length === 0 && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Inga deals ännu.</p>}
          {deals.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
              <div>
                <div className="font-semibold">{d.title} <span className="font-normal text-xs" style={{ color: "var(--muted-foreground)" }}>· {d.partner_name}</span></div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {d.lov_cost} löv · {d.code_type === "static" ? "statisk kod" : `${(d.code_data.codes ?? []).length} unika koder kvar`} · stock {d.stock ?? "∞"} · {d.active ? "aktiv" : "inaktiv"}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => openEdit(d)}>Redigera</button>
                <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => del(d.id)}>Radera</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Trädbanken · Tävlingar</h2>
          <button className="btn-primary !py-1.5 !px-3 text-sm" onClick={() => setEditComp({ id: "", title: "", description: "", end_date: "", active: true })}>+ Ny tävling</button>
        </div>
        <div className="mt-4 space-y-2">
          {comps.length === 0 && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Inga tävlingar.</p>}
          {comps.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
              <div>
                <div className="font-semibold">{c.title}</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{c.end_date ? `Slutar ${new Date(c.end_date).toLocaleDateString("sv-SE")}` : "Ingen slutdag"} · {c.active ? "aktiv" : "inaktiv"}</div>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setEditComp(c)}>Redigera</button>
                <button className="btn-secondary !py-1 !px-2 text-xs" onClick={async () => { if (confirm("Radera?")) { await deleteComp({ data: { id: c.id } }); reload(); } }}>Radera</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card p-6">
        <h2 className="font-display text-xl font-semibold">Trädbanken · Senaste claims</h2>
        <div className="mt-4 space-y-1 text-sm">
          {claims.length === 0 && <p style={{ color: "var(--muted-foreground)" }}>Inga claims ännu.</p>}
          {claims.map((c) => (
            <div key={c.id} className="flex justify-between border-b py-1.5" style={{ borderColor: "var(--border)" }}>
              <span>{new Date(c.created_at).toLocaleString("sv-SE")} · {c.partner_deals?.title ?? "—"}</span>
              <span className="font-mono text-xs">{c.code_issued} · {c.lov_cost} löv</span>
            </div>
          ))}
        </div>
      </section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6" style={{ background: "rgba(11,61,46,0.55)" }} onClick={() => setEditing(null)}>
          <div className="surface-card max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold">{editing.id ? "Redigera deal" : "Ny deal"}</h3>
            <div className="mt-4 space-y-3 text-sm">
              <input className="w-full rounded border p-2" placeholder="Titel" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              <input className="w-full rounded border p-2" placeholder="Partner-namn" value={editing.partner_name} onChange={(e) => setEditing({ ...editing, partner_name: e.target.value })} />
              <textarea className="w-full rounded border p-2" placeholder="Beskrivning" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs">Lövpris<input type="number" className="w-full rounded border p-2" value={editing.lov_cost} onChange={(e) => setEditing({ ...editing, lov_cost: Number(e.target.value) })} /></label>
                <label className="text-xs">Stock (tomt = ∞)<input type="number" className="w-full rounded border p-2" value={editing.stock ?? ""} onChange={(e) => setEditing({ ...editing, stock: e.target.value === "" ? null : Number(e.target.value) })} /></label>
                <label className="text-xs">Sort<input type="number" className="w-full rounded border p-2" value={editing.sort} onChange={(e) => setEditing({ ...editing, sort: Number(e.target.value) })} /></label>
              </div>
              <label className="text-xs block">Kodtyp
                <select className="w-full rounded border p-2" value={editing.code_type} onChange={(e) => setEditing({ ...editing, code_type: e.target.value as "static" | "unique" })}>
                  <option value="static">Statisk (alla får samma kod)</option>
                  <option value="unique">Unik (en per claim)</option>
                </select>
              </label>
              {editing.code_type === "static" ? (
                <input className="w-full rounded border p-2 font-mono" placeholder="Kod" value={codeStatic} onChange={(e) => setCodeStatic(e.target.value)} />
              ) : (
                <textarea className="w-full rounded border p-2 font-mono text-xs" rows={6} placeholder="En kod per rad" value={codeUnique} onChange={(e) => setCodeUnique(e.target.value)} />
              )}
              <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Aktiv</label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={() => setEditing(null)}>Avbryt</button>
              <button className="btn-primary !py-1.5 !px-3 text-sm" onClick={save}>Spara</button>
            </div>
          </div>
        </div>
      )}

      {editComp && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6" style={{ background: "rgba(11,61,46,0.55)" }} onClick={() => setEditComp(null)}>
          <div className="surface-card max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold">{editComp.id ? "Redigera tävling" : "Ny tävling"}</h3>
            <div className="mt-4 space-y-3 text-sm">
              <input className="w-full rounded border p-2" placeholder="Titel" value={editComp.title} onChange={(e) => setEditComp({ ...editComp, title: e.target.value })} />
              <textarea className="w-full rounded border p-2" placeholder="Beskrivning" value={editComp.description} onChange={(e) => setEditComp({ ...editComp, description: e.target.value })} />
              <label className="text-xs block">Slutdatum<input type="date" className="w-full rounded border p-2" value={editComp.end_date ? editComp.end_date.slice(0, 10) : ""} onChange={(e) => setEditComp({ ...editComp, end_date: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
              <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={editComp.active} onChange={(e) => setEditComp({ ...editComp, active: e.target.checked })} /> Aktiv</label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={() => setEditComp(null)}>Avbryt</button>
              <button className="btn-primary !py-1.5 !px-3 text-sm" onClick={saveComp}>Spara</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
