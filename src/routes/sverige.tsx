import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { AvatarCircle, useSignedAvatars } from "@/components/user-avatar";
import { getSverigeSellers, getSverigeTeams, type SellerRow, type TeamRow } from "@/lib/sverige.functions";
import { getLeaderboardBuffs } from "@/lib/boosts.functions";
import { BuffRow } from "@/components/boost-hub";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/sverige")({
  head: () => ({
    meta: [
      { title: "Sverige-topplistan — SmartKlimat" },
      { name: "description", content: "Se hur säljare och lag i hela Sverige ligger till just nu." },
    ],
  }),
  component: SverigePage,
});

type Tab = "sellers" | "teams";
type Period = "week" | "total";

function SverigePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("sellers");
  const [period, setPeriod] = useState<Period>("week");
  const [page, setPage] = useState(0);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-24 pt-4">
        <div className="text-center mb-6">
          <h1 className="font-display text-4xl font-semibold" style={{ color: "var(--forest)" }}>Sverige</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>Topp 50 säljare och lag i hela landet</p>
        </div>

        <div className="surface-card p-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex rounded-full p-1" style={{ background: "var(--mint-paper)" }}>
            {(["sellers","teams"] as const).map(t => (
              <button key={t}
                onClick={() => { setTab(t); setPage(0); }}
                className="px-4 py-1.5 text-sm rounded-full font-medium"
                style={{ background: tab===t ? "var(--forest)" : "transparent", color: tab===t ? "#fff" : "var(--forest)" }}>
                {t === "sellers" ? "Säljare" : "Lag"}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-full p-1" style={{ background: "var(--mint-paper)" }}>
            {(["week","total"] as const).map(p => (
              <button key={p}
                onClick={() => { setPeriod(p); setPage(0); }}
                className="px-4 py-1.5 text-sm rounded-full font-medium"
                style={{ background: period===p ? "var(--forest)" : "transparent", color: period===p ? "#fff" : "var(--forest)" }}>
                {p === "week" ? "Vecka" : "Totalt"}
              </button>
            ))}
          </div>
        </div>

        {tab === "sellers"
          ? <SellersBoard period={period} page={page} setPage={setPage} currentUserId={user?.id ?? null} />
          : <TeamsBoard period={period} page={page} setPage={setPage} />}
      </main>
    </div>
  );
}

function SellersBoard({ period, page, setPage, currentUserId }: { period: Period; page: number; setPage: (n:number)=>void; currentUserId: string | null }) {
  const fetchList = useServerFn(getSverigeSellers);
  const fetchBuffs = useServerFn(getLeaderboardBuffs);
  const [state, setState] = useState<{ rows: SellerRow[]; total: number; me: SellerRow | null; myRank: number | null; startRank: number } | null>(null);
  const [buffs, setBuffs] = useState<Record<string, { turbo: boolean; streakWeeks: number; hattrickToday: boolean; goldWeek: boolean; freezes: number }>>({});

  useEffect(() => {
    let alive = true;
    fetchList({ data: { period, page } }).then(async (res) => {
      if (!alive) return;
      setState(res);
      const ids = res.rows.map(r => r.user_id);
      if (ids.length) {
        const b = await fetchBuffs({ data: { userIds: ids } }).catch(() => ({ buffs: {} }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (alive) setBuffs((b as any).buffs ?? {});
      }
    });
    return () => { alive = false; };
  }, [period, page, fetchList, fetchBuffs]);

  const urls = useSignedAvatars((state?.rows ?? []).map(r => ({ user_id: r.user_id, avatar_key: r.avatar_key, photo_path: r.photo_path, first_name: r.first_name })));

  if (!state) return <div className="surface-card p-8 mt-4 text-center" style={{ color: "var(--muted-foreground)" }}>Laddar…</div>;

  const pageCount = Math.max(1, Math.ceil(state.total / 50));
  const key = period === "week" ? "points_week" : "points_total";

  return (
    <div className="mt-4 surface-card p-4">
      <ol className="divide-y" style={{ borderColor: "var(--border)" }}>
        {state.rows.map((r, i) => {
          const rank = state.startRank + i;
          const b = buffs[r.user_id];
          return (
            <li key={r.user_id} className="py-3 flex items-center gap-3" style={{ background: r.user_id === currentUserId ? "var(--mint-paper)" : undefined, borderRadius: 12 }}>
              <div className="w-8 text-center font-mono text-sm" style={{ color: "var(--muted-foreground)" }}>{rank}</div>
              <AvatarCircle subject={{ user_id: r.user_id, avatar_key: r.avatar_key, photo_path: r.photo_path }} urls={urls} size={40} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold truncate" style={{ color: "var(--forest)" }}>{r.first_name || "Säljare"}</span>
                  {b && <BuffRow buffs={b} />}
                </div>
                {r.team_name && (
                  <div className="text-xs font-medium" style={{ color: "#B8912B" }}>
                    ‹{r.team_name}{r.team_city ? `, ${r.team_city}` : ""}›
                  </div>
                )}
              </div>
              <div className="font-mono font-semibold text-right shrink-0" style={{ color: "var(--forest)" }}>{r[key]}</div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex items-center justify-between text-sm">
        <button disabled={page===0} onClick={() => setPage(page-1)} className="btn-secondary !py-1.5 !px-3 disabled:opacity-40">← Föregående</button>
        <span style={{ color: "var(--muted-foreground)" }}>{page+1} av {pageCount}</span>
        <button disabled={page+1>=pageCount} onClick={() => setPage(page+1)} className="btn-secondary !py-1.5 !px-3 disabled:opacity-40">Nästa →</button>
      </div>

      {state.me && state.myRank !== null && (
        <div className="mt-4 rounded-2xl p-3 flex items-center gap-3" style={{ background: "var(--forest)", color: "#fff" }}>
          <div className="w-8 text-center font-mono text-sm opacity-80">{state.myRank}</div>
          <AvatarCircle subject={{ user_id: state.me.user_id, avatar_key: state.me.avatar_key, photo_path: state.me.photo_path }} urls={urls} size={40} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Du: plats {state.myRank} av {state.total}</div>
            {state.me.team_name && <div className="text-xs opacity-80">‹{state.me.team_name}›</div>}
          </div>
          <div className="font-mono font-semibold">{state.me[key]}</div>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link to="/saljare" className="text-sm underline" style={{ color: "var(--forest)" }}>Tillbaka till säljarvyn</Link>
      </div>
    </div>
  );
}

function TeamsBoard({ period, page, setPage }: { period: Period; page: number; setPage: (n:number)=>void }) {
  const fetchList = useServerFn(getSverigeTeams);
  const [state, setState] = useState<{ rows: TeamRow[]; total: number; startRank: number } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchList({ data: { period, page } }).then((r) => { if (alive) setState(r); });
    return () => { alive = false; };
  }, [period, page, fetchList]);

  if (!state) return <div className="surface-card p-8 mt-4 text-center" style={{ color: "var(--muted-foreground)" }}>Laddar…</div>;
  const pageCount = Math.max(1, Math.ceil(state.total / 50));
  const key = period === "week" ? "points_week" : "points_total";

  return (
    <div className="mt-4 surface-card p-4">
      <ol className="divide-y" style={{ borderColor: "var(--border)" }}>
        {state.rows.map((r, i) => (
          <li key={r.team_id} className="py-3 flex items-center gap-3">
            <div className="w-8 text-center font-mono text-sm" style={{ color: "var(--muted-foreground)" }}>{state.startRank + i}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate" style={{ color: "var(--forest)" }}>{r.team_name}</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {[r.organization_name, r.city].filter(Boolean).join(" · ")} · {r.members} säljare · {r.trees_total} träd
              </div>
            </div>
            <div className="font-mono font-semibold shrink-0" style={{ color: "var(--forest)" }}>{r[key]}</div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button disabled={page===0} onClick={() => setPage(page-1)} className="btn-secondary !py-1.5 !px-3 disabled:opacity-40">← Föregående</button>
        <span style={{ color: "var(--muted-foreground)" }}>{page+1} av {pageCount}</span>
        <button disabled={page+1>=pageCount} onClick={() => setPage(page+1)} className="btn-secondary !py-1.5 !px-3 disabled:opacity-40">Nästa →</button>
      </div>
    </div>
  );
}
