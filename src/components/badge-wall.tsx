import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSellerAchievements, type CatalogRow, type EarnedRow } from "@/lib/achievements.functions";

export function BadgeWall() {
  const load = useServerFn(getSellerAchievements);
  const [state, setState] = useState<{ catalog: CatalogRow[]; earned: EarnedRow[] } | null>(null);

  useEffect(() => {
    let alive = true;
    load().then(r => { if (alive) setState(r); }).catch(() => {});
    return () => { alive = false; };
  }, [load]);

  if (!state) return null;
  const earnedKeys = new Set(state.earned.map(e => e.achievement_key));
  const earnedCount = state.earned.length;

  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>Märken</div>
        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{earnedCount} av {state.catalog.length}</div>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
        {state.catalog.map(a => {
          const got = earnedKeys.has(a.key);
          const isGold = a.rarity === "gold";
          return (
            <div key={a.key} title={`${a.name} — ${a.description}`}
              className="rounded-2xl aspect-square flex flex-col items-center justify-center p-2 text-center transition"
              style={{
                background: got ? (isGold ? "linear-gradient(135deg,#FFF6D6,#F1D580)" : "var(--mint-paper)") : "#F3F4F1",
                border: got && isGold ? "2px solid #D4A93A" : "1px solid var(--border)",
                opacity: got ? 1 : 0.45,
                filter: got ? undefined : "grayscale(1)",
              }}>
              <div className="text-2xl leading-none">{a.emoji}</div>
              <div className="text-[10px] mt-1 font-medium leading-tight" style={{ color: "var(--forest)" }}>{a.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
