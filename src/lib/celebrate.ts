import confetti from "canvas-confetti";

export const BRAND_COLORS = ["#1E9E6A", "#DCBE6E", "#F6B27A"];

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function haptic(ms = 30) {
  if (prefersReducedMotion()) return;
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(ms);
    }
  } catch { /* ignore */ }
}

type Opts = {
  colors?: string[];
  particles?: number;
  emoji?: string; // adds an emoji rain layer
  origin?: { x?: number; y?: number };
};

export function celebrate(opts: Opts = {}) {
  if (prefersReducedMotion()) return;
  const colors = opts.colors ?? BRAND_COLORS;
  const particles = opts.particles ?? 90;
  const origin = { x: opts.origin?.x ?? 0.5, y: opts.origin?.y ?? 0.6 };
  try {
    const base = { spread: 75, ticks: 90, gravity: 0.9, decay: 0.94, startVelocity: 32, colors };
    confetti({ ...base, particleCount: Math.round(particles * 0.55), origin });
    setTimeout(() => confetti({ ...base, particleCount: Math.round(particles * 0.3), origin: { x: 0.25, y: origin.y } }), 120);
    setTimeout(() => confetti({ ...base, particleCount: Math.round(particles * 0.3), origin: { x: 0.75, y: origin.y } }), 240);
    if (opts.emoji) {
      const scalar = 1.8;
      const shape = confetti.shapeFromText({ text: opts.emoji, scalar });
      setTimeout(() => confetti({ particleCount: 18, spread: 120, origin: { y: 0.35 }, shapes: [shape], scalar, ticks: 100 }), 60);
    }
  } catch { /* ignore */ }
}

export function celebrateBig(emoji?: string) {
  celebrate({ particles: 160, emoji });
}
