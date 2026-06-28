import { useEffect, useState } from "react";
import mascotAsset from "@/assets/mascot.png.asset.json";

export const ONBOARDING_KEY = (uid: string) => `smaarty:onboarded:${uid}`;

export function hasSeenOnboarding(uid: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ONBOARDING_KEY(uid)) === "1";
  } catch {
    return true;
  }
}

export function markOnboardingSeen(uid: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_KEY(uid), "1");
  } catch {/* ignore */}
}

export function resetOnboarding(uid: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ONBOARDING_KEY(uid));
  } catch {/* ignore */}
}

type Slide = {
  emoji: string;
  bg: string;
  title: string;
  text: string;
  image?: string;
};

const SLIDES: Slide[] = [
  { emoji: "🌱", image: mascotAsset.url, bg: "var(--mint)", title: "Välkommen till Smaarty! 🌱", text: "Här säljer du träd för din klass — och varje träd planteras på riktigt." },
  { emoji: "🌳", bg: "var(--sage, #cfe7d6)", title: "Din planta växer", text: "Ju fler träd du säljer, desto mer växer din planta. Från litet skott till stort träd — du bestämmer hur långt den når!" },
  { emoji: "✍️", bg: "var(--apricot, #ffd9b3)", title: "Sålt ett träd? Registrera det!", text: "Varje gång du säljer ett träd registrerar du det i appen. Då räknas det direkt — för dig och för din klass." },
  { emoji: "🏆", bg: "var(--mint)", title: "Samla märken & klättra tillsammans", text: "Lås upp märken när du når mål, och klättra på veckans topplista med din klass. Tillsammans planterar ni en hel skog!" },
  { emoji: "🎁", bg: "var(--apricot, #ffd9b3)", title: "Samla poäng, få belöningar", text: "För varje träd du säljer får du poäng. Spara dem och byt mot belöningar i butiken." },
  { emoji: "📘", bg: "var(--sage, #cfe7d6)", title: "Behöver du hjälp att sälja?", text: "Under Sälj-hjälp finns en guide som visar hur du gör — och material du kan visa kunden." },
  { emoji: "🌳", image: mascotAsset.url, bg: "var(--mint)", title: "Redo? Nu kör vi! 🌳", text: "Din skog väntar på dig." },
];

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, SLIDES.length - 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0));
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = SLIDES[i];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-5 py-6"
      style={{ background: "rgba(13, 41, 28, 0.55)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Välkommen till Smaarty"
    >
      <div
        className="surface-card relative flex w-full max-w-md flex-col overflow-hidden"
        style={{ minHeight: "min(560px, 90vh)", animation: "smaarty-pop 380ms cubic-bezier(.2,.9,.3,1.6)" }}
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <div aria-live="polite" className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {i + 1} / {SLIDES.length}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium underline"
            style={{ color: "var(--muted-foreground)" }}
          >
            Hoppa över
          </button>
        </div>

        <div key={i} className="flex flex-1 flex-col items-center justify-center px-7 py-8 text-center"
          style={{ animation: "smaarty-slide-in 320ms ease-out both" }}
        >
          <div
            className="mb-6 grid h-40 w-40 place-items-center rounded-full text-7xl shadow-sm"
            style={{ background: s.bg, animation: "smaarty-bounce 1.4s ease-in-out infinite" }}
            aria-hidden
          >
            {s.emoji}
          </div>
          <h2 className="font-display text-2xl font-semibold leading-tight">{s.title}</h2>
          <p className="mt-3 text-base" style={{ color: "var(--muted-foreground)" }}>
            {s.text}
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 pb-4" aria-hidden>
          {SLIDES.map((_, idx) => (
            <span
              key={idx}
              className="h-2 rounded-full transition-all"
              style={{
                width: idx === i ? 22 : 8,
                background: idx === i ? "var(--primary)" : "var(--border)",
              }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={() => setI((v) => Math.max(v - 1, 0))}
            disabled={i === 0}
            className="btn-secondary !px-4 !py-2 text-sm disabled:opacity-30"
          >
            ← Tillbaka
          </button>
          {last ? (
            <button type="button" onClick={onClose} className="btn-primary !px-6 !py-2.5 text-sm">
              Kom igång 🌳
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setI((v) => Math.min(v + 1, SLIDES.length - 1))}
              className="btn-primary !px-5 !py-2 text-sm"
            >
              Nästa →
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes smaarty-slide-in {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes smaarty-bounce {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50%      { transform: translateY(-8px) rotate(2deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="dialog"] * { animation: none !important; transition: none !important; }
        }
      `}</style>
    </div>
  );
}
