import { useEffect, useState } from "react";
import type { ActiveEvent } from "@/lib/events.functions";

function formatRemaining(endAt: string): string {
  const ms = new Date(endAt).getTime() - Date.now();
  if (ms <= 0) return "snart slut";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d} ${d === 1 ? "dag" : "dagar"} kvar`;
  }
  if (h >= 1) return `${h} h ${m} min kvar`;
  return `${m} min kvar`;
}

export function EventBanner({ event }: { event: ActiveEvent }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!event) return;
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [event]);
  if (!event) return null;
  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-sm"
      style={{
        background: "linear-gradient(135deg, #fbe3c0 0%, #ffcf78 100%)",
        border: "1px solid rgba(0,0,0,0.06)",
        animation: "smaarty-pop 500ms cubic-bezier(.2,.9,.3,1.4)",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>⚡</span>
        <div>
          <div className="font-display text-base font-semibold" style={{ color: "var(--forest)" }}>
            {event.multiplier === 2 ? "Dubbla poäng nu!" : `${event.multiplier}× poäng nu!`}
          </div>
          <div className="text-xs" style={{ color: "var(--forest)" }}>
            {event.name} — varje träd ger {event.multiplier} poäng. {formatRemaining(event.end_at)}.
          </div>
        </div>
      </div>
    </div>
  );
}
