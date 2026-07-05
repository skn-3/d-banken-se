import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { celebrate, haptic } from "@/lib/celebrate";

import { getSellerBoostState, activateBoost, type SellerBuffs } from "@/lib/boosts.functions";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type BoostRow = {
  id: string;
  boost_key: string;
  status: string;
  remaining_uses: number;
  activated_at: string | null;
  earned_at: string;
  meta: any;
};

type CatalogRow = {
  key: string;
  name: string;
  emoji: string;
  description: string;
  trigger_type: string;
  trigger_config: any;
  effect_type: string;
  effect_config: any;
};

type State = {
  catalog: CatalogRow[];
  boosts: BoostRow[];
  streak: { current_weeks: number; best_weeks: number; freezes: number; last_counted_week: string | null } | null;
  progress: { totalTrees: number; todayTrees: number };
};

function popConfetti() {
  try {
    const defaults = { spread: 70, ticks: 80, gravity: 0.9, decay: 0.94, startVelocity: 30, scalar: 1 };
    confetti({ ...defaults, particleCount: 60, origin: { x: 0.5, y: 0.6 } });
    setTimeout(() => confetti({ ...defaults, particleCount: 40, origin: { x: 0.3, y: 0.6 } }), 120);
    setTimeout(() => confetti({ ...defaults, particleCount: 40, origin: { x: 0.7, y: 0.6 } }), 240);
  } catch { /* ignore */ }
}

function emojiRain(emoji = "🎉") {
  try {
    const scalar = 2;
    const shape = confetti.shapeFromText({ text: emoji, scalar });
    confetti({ particleCount: 30, spread: 100, origin: { y: 0.3 }, shapes: [shape], scalar });
  } catch { /* ignore */ }
}

const bouncy = "transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.03] active:scale-[0.97]";

function describeEffect(c: CatalogRow) {
  const cfg = c.effect_config ?? {};
  if (c.effect_type === "multiplier") return `${cfg.factor}x poäng${cfg.uses ? ` på dina nästa ${cfg.uses} planteringar` : ""}`;
  if (c.effect_type === "bonus") return `+${cfg.points} bonuspoäng`;
  if (c.effect_type === "award_boost") return `Låser upp en ${cfg.awards}`;
  if (c.effect_type === "streak_freeze") return "Räddar din streak en vecka";
  return c.description;
}

function lockedRequirementText(c: CatalogRow, progress: State["progress"]): string {
  const t = c.trigger_type;
  const cfg = c.trigger_config ?? {};
  if (t === "total_trees_or_week_goal") return `Sälj ${cfg.total_trees ?? 10} träd totalt · ${progress.totalTrees}/${cfg.total_trees ?? 10}`;
  if (t === "day_trees") return `Sälj ${cfg.trees ?? 10} träd på en dag · ${progress.todayTrees}/${cfg.trees ?? 10} idag`;
  if (t === "day_count") return `${cfg.count ?? 3} planteringar samma dag`;
  if (t === "team_week_goal") return "Laget når veckomålet";
  if (t === "idle_days") return `Kom tillbaka efter ${cfg.days ?? 14} dagars paus`;
  if (t === "random") return "Slumpar 1 % per plantering";
  if (t === "level_up") return "Ny nivå på ditt träd";
  if (t === "weeks_streak") return `Varje ${cfg.every ?? 4}:e veckostreak`;
  return c.description;
}

export function BoostHub() {
  const stateFn = useServerFn(getSellerBoostState);
  const activateFn = useServerFn(activateBoost);
  const [state, setState] = useState<State | null>(null);
  const [confirm, setConfirm] = useState<{ boost: BoostRow; catalog: CatalogRow } | null>(null);
  const [prevEarnedKeys, setPrevEarnedKeys] = useState<Set<string> | null>(null);
  const [activating, setActivating] = useState(false);

  const load = async () => {
    const r = (await stateFn()) as unknown as State;
    setState(r);
    return r;
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Detect newly earned boosts and celebrate.
  useEffect(() => {
    if (!state) return;
    const earnedKeys = new Set(state.boosts.filter((b) => b.status === "earned").map((b) => b.boost_key));
    if (prevEarnedKeys) {
      for (const k of earnedKeys) {
        if (!prevEarnedKeys.has(k)) {
          const cat = state.catalog.find((c) => c.key === k);
          if (cat) {
            toast(`${cat.emoji} ${cat.name} upplåst!`, { description: describeEffect(cat) });
            emojiRain(cat.emoji);
          }
        }
      }
    }
    setPrevEarnedKeys(earnedKeys);
    // eslint-disable-next-line
  }, [state?.boosts.map((b) => b.id + b.status).join("|")]);

  const catalogByKey = useMemo(() => {
    const m: Record<string, CatalogRow> = {};
    for (const c of state?.catalog ?? []) m[c.key] = c;
    return m;
  }, [state?.catalog]);

  if (!state) {
    return (
      <section className="surface-card p-6">
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Laddar boosts…</div>
      </section>
    );
  }

  const earned = state.boosts.filter((b) => b.status === "earned");
  const active = state.boosts.filter((b) => b.status === "active");
  const earnedOrActiveKeys = new Set([...earned, ...active].map((b) => b.boost_key));
  const locked = state.catalog.filter((c) => !earnedOrActiveKeys.has(c.key));

  const doActivate = async () => {
    if (!confirm) return;
    setActivating(true);
    try {
      await activateFn({ data: { boostId: confirm.boost.id } });
      celebrate({ emoji: confirm.catalog.emoji });
      haptic(30);
      toast(`${confirm.catalog.emoji} ${confirm.catalog.name} aktiverad!`, {
        description: describeEffect(confirm.catalog),
      });

      setConfirm(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte aktivera");
    } finally {
      setActivating(false);
    }
  };

  return (
    <section className="surface-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Boosts</h2>
        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {earned.length} upplåsta · {active.length} aktiva
        </div>
      </div>

      {/* Streak-widget */}
      <StreakWidget streak={state.streak} />

      {/* Aktiva */}
      {active.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Aktiva</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((b) => {
              const c = catalogByKey[b.boost_key];
              if (!c) return null;
              const used = Math.max(0, (c.effect_config?.uses ?? b.remaining_uses) - b.remaining_uses);
              const total = c.effect_config?.uses ?? b.remaining_uses;
              const pct = total > 0 ? (b.remaining_uses / total) * 100 : 100;
              return (
                <div key={b.id} className={`rounded-2xl border p-4 ${bouncy}`} style={{ borderColor: "var(--primary)", background: "var(--mint-paper)" }}>
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">{c.emoji}</div>
                    <div className="flex-1">
                      <div className="font-display font-semibold" style={{ color: "var(--forest)" }}>{c.name}</div>
                      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {total > 0 ? `${b.remaining_uses} av ${total} kvar` : "Aktiv"}
                      </div>
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: "var(--primary)" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upplåsta */}
      <div className="mt-5">
        <div className="mb-2 text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Upplåsta</div>
        {earned.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-4 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Sälj träd för att låsa upp dina första boosts!
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {earned.map((b) => {
              const c = catalogByKey[b.boost_key];
              if (!c) return null;
              const isManual = c.effect_config?.manual;
              return (
                <div key={b.id} className={`rounded-2xl border bg-white p-4 ${bouncy}`} style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">{c.emoji}</div>
                    <div className="flex-1">
                      <div className="font-display font-semibold" style={{ color: "var(--forest)" }}>{c.name}</div>
                      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{describeEffect(c)}</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    {isManual ? (
                      <Button
                        className={`w-full ${bouncy}`}
                        onClick={() => setConfirm({ boost: b, catalog: c })}
                      >
                        Aktivera
                      </Button>
                    ) : (
                      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        Aktiveras automatiskt när det passar
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Låsta */}
      {locked.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Låsta</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {locked.map((c) => (
              <div key={c.key} className="rounded-2xl border border-dashed p-4 opacity-70" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3">
                  <div className="text-3xl grayscale">{c.emoji}</div>
                  <div className="flex-1">
                    <div className="font-display font-semibold" style={{ color: "var(--forest)" }}>{c.name}</div>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{lockedRequirementText(c, state.progress)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bekräftelse-sheet */}
      <Sheet open={!!confirm} onOpenChange={(v) => { if (!v) setConfirm(null); }}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          {confirm && (
            <>
              <SheetHeader>
                <SheetTitle>
                  <span className="mr-2 text-2xl align-middle">{confirm.catalog.emoji}</span>
                  Aktivera {confirm.catalog.name}?
                </SheetTitle>
                <SheetDescription>{describeEffect(confirm.catalog)}</SheetDescription>
              </SheetHeader>
              <SheetFooter className="mt-4 flex-row gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirm(null)}>Avbryt</Button>
                <Button className="flex-1" onClick={doActivate} disabled={activating}>
                  {activating ? "Aktiverar…" : "Ja, aktivera"}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

export function StreakWidget({ streak }: { streak: State["streak"] }) {
  const weeks = streak?.current_weeks ?? 0;
  const freezes = streak?.freezes ?? 0;
  const isFresh = weeks === 0;
  return (
    <div className={`mt-4 rounded-2xl p-4 ${bouncy}`} style={{ background: "var(--gradient-mint)" }}>
      <div className="flex items-center gap-3">
        <div className={`text-3xl ${weeks > 0 ? "animate-[pulse_2.4s_ease-in-out_infinite]" : "opacity-60"}`}>🔥</div>
        <div className="flex-1">
          <div className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>
            {weeks} {weeks === 1 ? "vecka" : "veckor"} i rad
          </div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {isFresh
              ? "Ny start! Första trädet tänder elden igen."
              : "Sälj minst 1 träd denna vecka för att behålla elden."}
          </div>
        </div>
        {freezes > 0 && (
          <div className="chip" title={`Du har ${freezes} streakfrys`}>
            <span>🧊</span><span className="font-mono">×{freezes}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact emoji buffs row for leaderboards. Max 3 shown, rest as "+N". */
export function BuffRow({ buffs, max = 3 }: { buffs?: SellerBuffs; max?: number }) {
  if (!buffs) return null;
  const items: { key: string; label: string; text: string }[] = [];
  if (buffs.turbo) items.push({ key: "turbo", label: "🚀×2", text: "Turbo aktiv: 2x poäng" });
  if (buffs.streakWeeks >= 2) items.push({ key: "streak", label: `🔥${buffs.streakWeeks}`, text: `${buffs.streakWeeks} veckor i rad` });
  if (buffs.hattrickToday) items.push({ key: "hat", label: "⚽", text: "Dagens hattrick" });
  if (buffs.goldWeek) items.push({ key: "gold", label: "✨", text: "Veckans guldplantering" });
  if (items.length === 0) return null;
  const visible = items.slice(0, max);
  const extra = items.length - visible.length;
  return (
    <TooltipProvider delayDuration={100}>
      <div className="ml-1 flex shrink-0 items-center gap-1 text-xs">
        {visible.map((i) => (
          <Tooltip key={i.key}>
            <TooltipTrigger asChild>
              <span className="rounded-full bg-white/70 px-1.5 py-0.5 leading-none" style={{ color: "var(--forest)" }}>{i.label}</span>
            </TooltipTrigger>
            <TooltipContent>{i.text}</TooltipContent>
          </Tooltip>
        ))}
        {extra > 0 && (
          <span className="rounded-full bg-white/70 px-1.5 py-0.5 leading-none" style={{ color: "var(--muted-foreground)" }}>+{extra}</span>
        )}
      </div>
    </TooltipProvider>
  );
}
