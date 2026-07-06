import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listGreetingThemes } from "@/lib/greeting-themes.functions";
import { moderateGreeting } from "@/lib/certificate-templates.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface GreetingThemeValue {
  themeId: string | null;
  greeting: string;
}

interface Props {
  value: GreetingThemeValue;
  onChange: (v: GreetingThemeValue) => void;
  compact?: boolean;
  title?: string;
}

interface Theme {
  id: string; slug: string; name: string; category: string;
  is_default: boolean; config: any;
}

export function GreetingThemePicker({ value, onChange, compact, title }: Props) {
  const load = useServerFn(listGreetingThemes);
  const moderate = useServerFn(moderateGreeting);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [issue, setIssue] = useState<string | null>(null);

  useEffect(() => {
    load().then((r) => {
      const list = (r.themes ?? []) as Theme[];
      setThemes(list);
      if (!value.themeId) {
        const def = list.find((t) => t.is_default) ?? list[0];
        if (def) onChange({ ...value, themeId: def.id });
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setGreeting = async (s: string) => {
    const next = s.slice(0, 120);
    onChange({ ...value, greeting: next });
    setIssue(null);
    if (next.trim().length > 3) {
      try {
        const r = await moderate({ data: { text: next.trim() } });
        if (!r.ok) setIssue(r.reason || "Ogiltig hälsning");
      } catch { /* ignore */ }
    }
  };

  if (themes.length === 0) return null;
  const selected = themes.find((t) => t.id === value.themeId) ?? null;
  const hideGreeting = selected?.slug === "original" || selected?.config?.allows_greeting === false;

  return (
    <section className={compact ? "rounded-2xl border p-4" : "surface-card p-6"} style={{ borderColor: "var(--border)" }}>
      <h2 className={compact ? "font-display text-base font-semibold" : "font-display text-lg font-semibold"}>
        {title ?? "Välj din hälsning"}
      </h2>
      <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
        Temat styr utseendet på mailet och den animerade bevis-reveal:en.
      </p>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {themes.map((t) => {
          const p = t.config?.palette ?? {};
          const active = t.id === value.themeId;
          return (
            <button
              key={t.id} type="button"
              onClick={() => onChange({ ...value, themeId: t.id })}
              className="rounded-xl p-2.5 text-left transition"
              style={{
                border: active ? `2px solid ${p.accent || "#1E9E6A"}` : "1px solid var(--border)",
                background: active ? "var(--mint-paper)" : "var(--card)",
              }}
            >
              <div className="h-14 rounded-lg mb-2 flex items-center justify-center overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${p.bg || "#0B3D2E"}, ${p.accent || "#1E9E6A"})` }}>
                <span className="font-display text-xs" style={{ color: p.soft || "#EAF7EE" }}>
                  {t.name}
                </span>
              </div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                {t.category}
              </div>
            </button>
          );
        })}
      </div>

      {!hideGreeting && (
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium">Personlig hälsning (valfritt)</label>
          <textarea
            value={value.greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="T.ex. Grattis på födelsedagen från oss alla!"
            maxLength={120}
            rows={2}
            className="w-full rounded-xl border px-3 py-2 text-sm resize-none"
            style={{ borderColor: "var(--border)", background: "var(--input)" }}
          />
          <div className="mt-1 flex justify-between text-xs" style={{ color: "var(--muted-foreground)" }}>
            <span>{issue ? <span style={{ color: "var(--destructive)" }}>{issue}</span> : "Syns i mailet och som liten rad på beviset."}</span>
            <span>{value.greeting.length}/120</span>
          </div>
        </div>
      )}
    </section>
  );
}
