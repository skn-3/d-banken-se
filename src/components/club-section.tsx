import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyClub, listActiveDeals, listActiveCompetitions, claimDeal } from "@/lib/club.functions";

export type Level = { name: string; min: number; next: number | null };

export function levelFromTrees(trees: number): Level {
  if (trees >= 200) return { name: "Urskog", min: 200, next: null };
  if (trees >= 50) return { name: "Skog", min: 50, next: 200 };
  if (trees >= 10) return { name: "Dunge", min: 10, next: 50 };
  if (trees >= 1) return { name: "Planta", min: 1, next: 10 };
  return { name: "Frö", min: 0, next: 1 };
}

interface Deal { id: string; title: string; partner_name: string; description: string; lov_cost: number; stock: number | null }
interface Comp { id: string; title: string; description: string; end_date: string | null }
interface Club { lov: number; trees: number; claims: Array<{ id: string; deal_id: string; code_issued: string; created_at: string; title: string; partner_name: string }> }

export function ClubSection({ trees }: { trees: number }) {
  const fetchClub = useServerFn(getMyClub);
  const fetchDeals = useServerFn(listActiveDeals);
  const fetchComps = useServerFn(listActiveCompetitions);
  const doClaim = useServerFn(claimDeal);

  const [club, setClub] = useState<Club | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [comps, setComps] = useState<Comp[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ code: string; title: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => {
    fetchClub().then(setClub).catch(() => {});
    fetchDeals().then((d) => setDeals(d as Deal[])).catch(() => {});
    fetchComps().then((c) => setComps(c as Comp[])).catch(() => {});
  };
  useEffect(reload, [fetchClub, fetchDeals, fetchComps]);

  const level = levelFromTrees(trees);
  const lov = club?.lov ?? 0;

  const onClaim = async (deal: Deal) => {
    if (!confirm(`Hämta "${deal.title}" för ${deal.lov_cost} löv?`)) return;
    setBusy(deal.id); setErr(null);
    try {
      const res = await doClaim({ data: { deal_id: deal.id } });
      setFlash({ code: res.code_issued, title: deal.title });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Kunde inte hämta");
    } finally { setBusy(null); }
  };

  // Progress toward next level (by trees)
  const nextTrees = level.next ?? level.min;
  const trPct = level.next ? Math.min(100, Math.round(100 * (trees - level.min) / (level.next - level.min))) : 100;

  return (
    <>
      {/* Löv wallet card */}
      <div className="mt-6 surface-card p-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-xs" style={{ color: "var(--muted-foreground)", letterSpacing: "0.2em" }}>DINA LÖV</div>
            <div className="mt-1 font-display text-4xl font-bold" style={{ color: "var(--forest)" }}>
              {lov.toLocaleString("sv-SE")} <span className="text-lg font-medium">löv</span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>NIVÅ</div>
            <div className="mt-1 font-display text-2xl font-semibold" style={{ color: "var(--forest)" }}>{level.name}</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--mint-paper)" }}>
            <div className="h-full rounded-full" style={{ width: `${trPct}%`, background: "var(--forest)" }} />
          </div>
          <div className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
            {level.next ? `${trees.toLocaleString("sv-SE")} av ${nextTrees.toLocaleString("sv-SE")} träd till nästa nivå` : "Högsta nivån – tack för att du fortsätter plantera."}
          </div>
        </div>
      </div>

      {/* Competitions banner */}
      {comps.length > 0 && (
        <div className="mt-6 rounded-2xl p-6" style={{ background: "linear-gradient(135deg,#0B3D2E,#15784F)", color: "#fff" }}>
          <div className="font-mono text-xs" style={{ letterSpacing: "0.2em", color: "#9FD9B6" }}>TÄVLING</div>
          <div className="mt-1 font-display text-xl font-semibold">{comps[0].title}</div>
          {comps[0].description && <p className="mt-2 text-sm" style={{ color: "#DFF3E6" }}>{comps[0].description}</p>}
          {comps[0].end_date && <p className="mt-2 font-mono text-xs" style={{ color: "#9FD9B6" }}>Slutar {new Date(comps[0].end_date).toLocaleDateString("sv-SE")}</p>}
        </div>
      )}

      {/* Deals */}
      <div className="mt-6 surface-card p-8">
        <h2 className="font-display text-2xl font-semibold">Deals — från skogens vänner</h2>
        {err && <p className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>{err}</p>}
        {deals.length === 0 ? (
          <p className="mt-6 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Fler deals på väg — partnernätverket växer.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {deals.map((d) => {
              const soldOut = d.stock !== null && d.stock <= 0;
              const canAfford = lov >= d.lov_cost;
              return (
                <div key={d.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
                  <div className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{d.partner_name}</div>
                  <div className="mt-1 font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>{d.title}</div>
                  {d.description && <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>{d.description}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="font-mono text-sm font-semibold">{d.lov_cost} löv</div>
                    <button
                      disabled={soldOut || !canAfford || busy === d.id}
                      onClick={() => onClaim(d)}
                      className="btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50"
                    >
                      {soldOut ? "Slutsåld" : busy === d.id ? "Hämtar…" : canAfford ? "Hämta" : "För få löv"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {club && club.claims.length > 0 && (
          <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <div className="font-mono text-xs" style={{ color: "var(--muted-foreground)", letterSpacing: "0.2em" }}>DINA KODER</div>
            <div className="mt-2 space-y-2">
              {club.claims.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <div><span className="font-medium">{c.title}</span> <span style={{ color: "var(--muted-foreground)" }}>· {c.partner_name}</span></div>
                  <code className="rounded bg-[color:var(--mint-paper)] px-2 py-1 font-mono">{c.code_issued}</code>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {flash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(11,61,46,0.55)" }} onClick={() => setFlash(null)}>
          <div className="surface-card max-w-md w-full p-8 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-xl font-semibold">Din kod för {flash.title}</div>
            <div className="mt-4 rounded-xl px-4 py-4 font-mono text-2xl font-bold" style={{ background: "var(--mint-paper)", color: "var(--forest)" }}>{flash.code}</div>
            <button onClick={() => setFlash(null)} className="mt-6 btn-primary">Stäng</button>
          </div>
        </div>
      )}
    </>
  );
}
