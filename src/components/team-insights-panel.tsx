import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { AvatarCircle, useSignedAvatars, type AvatarSubject } from "@/components/user-avatar";
import { getTeamInsights } from "@/lib/team-management.functions";

type Insights = Awaited<ReturnType<typeof getTeamInsights>>;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
}

export function TeamInsightsPanel() {
  const loadFn = useServerFn(getTeamInsights);
  const [state, setState] = useState<Insights | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadFn().then(setState).catch(() => {});
  }, [loadFn]);

  const risk = state && state.isLeader ? state.streakRisk : [];
  const riskSubjects: AvatarSubject[] = useMemo(
    () => risk.map((m) => ({ user_id: m.userId, avatar_key: m.avatarKey, photo_path: m.photoPath, first_name: m.firstName })),
    [risk],
  );
  const urls = useSignedAvatars(riskSubjects);

  if (!state || !state.isLeader) return null;
  const { weeks, weekTrees, forecast, streakRisk, activity, team } = state;

  const shareText = `Lag ${team.name} planterade ${weekTrees} träd den här veckan — heja oss!`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const forecastStatus = forecast
    ? (forecast.remaining === 0
        ? { label: "Målet nått!", tone: "ok" as const }
        : forecast.requiredWeekly == null
          ? { label: `Snitt ${forecast.pace} träd/vecka · klart ${forecast.forecastDate ? fmtDate(forecast.forecastDate) : "—"}`, tone: "ok" as const }
          : forecast.onTrack
            ? { label: `I fas · ${forecast.pace} träd/vecka (krävs ${forecast.requiredWeekly})`, tone: "ok" as const }
            : { label: `Efter — ${forecast.requiredWeekly} träd/vecka krävs`, tone: "warn" as const })
    : null;

  return (
    <section className="surface-card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold" style={{ color: "var(--forest)" }}>Insikter</h2>
        <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>Endast du ser detta</span>
      </div>

      {/* 1. Weekly bars */}
      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-display text-base font-semibold">Träd per vecka</h3>
          <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>senaste 8 v</span>
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip cursor={{ fill: "rgba(30,158,106,0.08)" }} contentStyle={{ borderRadius: 8, borderColor: "var(--border)" }} />
              <Bar dataKey="trees" fill="#1E9E6A" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Forecast */}
      {forecastStatus && (
        <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="font-display text-base font-semibold">Målprognos</h3>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <span
              className="rounded-full px-3 py-1 text-sm font-semibold"
              style={{
                background: forecastStatus.tone === "ok" ? "var(--mint)" : "rgba(246,178,122,0.28)",
                color: forecastStatus.tone === "ok" ? "var(--forest)" : "#7A3B00",
              }}
            >
              {forecastStatus.label}
            </span>
            {forecast!.remaining > 0 && (
              <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {forecast!.remaining} träd kvar till {forecast!.goalTrees}
                {forecast!.goalEndDate ? ` · deadline ${fmtDate(forecast!.goalEndDate)}` : ""}
                {forecast!.forecastDate ? ` · prognos ${fmtDate(forecast!.forecastDate)}` : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3. Streak risk */}
      <div className="mt-6">
        <h3 className="font-display text-base font-semibold">Streak-risk</h3>
        {streakRisk.length === 0 ? (
          <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Ingen eld i fara — alla med streak har sålt den här veckan. 🔥
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
              En påminnelse på träningen räddar {streakRisk.length === 1 ? "en eld" : `${streakRisk.length} eldar`}.
            </p>
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
              {streakRisk.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 py-2">
                  <AvatarCircle subject={{ user_id: m.userId, avatar_key: m.avatarKey, photo_path: m.photoPath, first_name: m.firstName }} size={36} urls={urls} />
                  <span className="flex-1 font-display font-semibold" style={{ color: "var(--forest)" }}>{m.firstName}</span>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "rgba(246,178,122,0.25)", color: "#7A3B00" }}>
                    🔥 {m.streak} v
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* 4. Activity split */}
      <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
        <h3 className="font-display text-base font-semibold">Aktivitet</h3>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="font-display text-2xl font-bold" style={{ color: "#1E9E6A" }}>{activity.active7}</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>aktiva 7 d</div>
          </div>
          <div>
            <div className="font-display text-2xl font-bold" style={{ color: "var(--forest)" }}>{activity.active28}</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>aktiva 28 d</div>
          </div>
          <div>
            <div className="font-display text-2xl font-bold" style={{ color: "#B87333" }}>{activity.idle}</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>vilande</div>
          </div>
        </div>
        <div className="mt-2 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>{activity.total} säljare totalt</div>
      </div>

      {/* 5. Share card */}
      <div className="mt-6 rounded-2xl p-5" style={{ background: "linear-gradient(135deg,#0B3D2E,#15784F)", color: "#fff" }}>
        <div className="font-mono text-xs" style={{ color: "#9FD9B6", letterSpacing: "0.24em" }}>VECKANS SIFFRA</div>
        <div className="mt-1 font-display text-3xl font-bold">{weekTrees} träd</div>
        <p className="mt-3 text-sm" style={{ color: "#DFF3E6" }}>{shareText}</p>
        <button
          onClick={copy}
          className="mt-4 rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: "#fff", color: "#0B3D2E" }}
        >
          {copied ? "Kopierat ✓" : "Kopiera för föräldragruppen"}
        </button>
      </div>
    </section>
  );
}
