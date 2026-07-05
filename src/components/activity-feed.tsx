import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getTeamFeed, getNationalFeed, type FeedRow } from "@/lib/achievements.functions";
import { AvatarCircle, useSignedAvatars } from "@/components/user-avatar";

function relTime(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `för ${s} sek sen`;
  const m = Math.floor(s / 60);
  if (m < 60) return `för ${m} min sen`;
  const h = Math.floor(m / 60);
  if (h < 24) return `för ${h} tim sen`;
  const d = Math.floor(h / 24);
  return `för ${d} dagar sen`;
}

function renderText(r: FeedRow, includeTeam = false): string {
  const p = r.payload || {};
  const name = (r.first_name || (p.first_name as string) || "En säljare");
  const team = includeTeam && r.team_name ? ` · ‹${r.team_name}›` : "";
  switch (r.type) {
    case "achievement_earned":
      return `${name} låste upp ${p.name} ${p.emoji}${team}`;
    case "boost_earned":
      return `${name} låste upp boosten ${p.name} 🎁${team}`;
    case "boost_activated":
      return `${name} aktiverade ${p.name} 🚀${team}`;
    case "level_up":
      return `${name} nådde nivå ${p.threshold} träd ⭐${team}`;
    case "gold_plant":
      return `${name} fick en guldplantering ✨${team}`;
    case "team_weekly_goal_hit":
      return `${p.team_name ?? "Laget"} nådde veckomålet ${p.goal} 🎯`;
    case "team_goal_hit":
      return `${p.team_name ?? "Laget"} nådde kampanjmålet ${p.goal} träd 🏆`;
    case "streak_milestone":
      return `${name} håller elden i ${p.weeks} veckor 🔥${team}`;
    default:
      return `${name} — ${r.type}`;
  }
}

const bounceStyle: React.CSSProperties = { animation: "feed-in 420ms cubic-bezier(0.34,1.56,0.64,1) both" };


export function TeamFeed() {
  const load = useServerFn(getTeamFeed);
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    load().then(r => { if (alive) { setRows(r.rows); setLoading(false); } })
          .catch(() => { if (alive) setLoading(false); });
    const ch = supabase.channel("activity_team")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_feed" }, () => {
        load().then(r => { if (alive) setRows(r.rows); }).catch(() => {});
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [load]);

  const subjects = useMemo(() => rows
    .filter(r => r.user_id)
    .map(r => ({ user_id: r.user_id as string, avatar_key: r.avatar_key, photo_path: r.photo_path, first_name: r.first_name })), [rows]);
  const urls = useSignedAvatars(subjects);

  if (loading) return <div className="surface-card p-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Laddar loggen…</div>;
  if (rows.length === 0) return <div className="surface-card p-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Inget att visa än — snart händer det saker här! 🌱</div>;

  return (
    <div className="surface-card p-4">
      <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
        {rows.map(r => (
          <li key={r.id} style={bounceStyle} className="py-3 flex items-center gap-3">
            {r.user_id ? (
              <AvatarCircle subject={{ user_id: r.user_id, avatar_key: r.avatar_key, photo_path: r.photo_path }} urls={urls} size={36} />
            ) : (
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg" style={{ background: "var(--mint-paper)" }}>🌲</div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm" style={{ color: "var(--forest)" }}>{renderText(r)}</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{relTime(r.created_at)}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NationalFeed() {
  const load = useServerFn(getNationalFeed);
  const [rows, setRows] = useState<FeedRow[]>([]);
  useEffect(() => {
    let alive = true;
    load().then(r => { if (alive) setRows(r.rows); }).catch(() => {});
    const ch = supabase.channel("activity_national")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_feed", filter: "scope=eq.national" }, () => {
        load().then(r => { if (alive) setRows(r.rows); }).catch(() => {});
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [load]);

  const subjects = useMemo(() => rows
    .filter(r => r.user_id)
    .map(r => ({ user_id: r.user_id as string, avatar_key: r.avatar_key, photo_path: r.photo_path, first_name: r.first_name })), [rows]);
  const urls = useSignedAvatars(subjects);

  return (
    <div className="surface-card p-4">
      <div className="font-display text-lg font-semibold mb-2" style={{ color: "var(--forest)" }}>Händer i Sverige</div>
      {rows.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Ännu inga nationella höjdpunkter — bli den första! ✨</div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {rows.map(r => (
              <motion.li key={r.id} {...springIn} className="flex items-start gap-2 text-sm">
                {r.user_id && (
                  <AvatarCircle subject={{ user_id: r.user_id, avatar_key: r.avatar_key, photo_path: r.photo_path }} urls={urls} size={28} />
                )}
                <div className="flex-1 min-w-0">
                  <div style={{ color: "var(--forest)" }}>{renderText(r, true)}</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{relTime(r.created_at)}</div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
