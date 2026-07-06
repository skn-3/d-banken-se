import { useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  theme: any | null | undefined;
  onDone?: () => void;
  children: React.ReactNode;
}

/**
 * Animated reveal wrapper. Renders a full-viewport fold-out + confetti
 * using the theme's palette, then fades to show its children (the certificate).
 * Respects prefers-reduced-motion.
 */
export function CertificateReveal({ theme, onDone, children }: Props) {
  const [phase, setPhase] = useState<"reveal" | "done">("reveal");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const palette = theme?.config?.palette ?? {
    bg: "#0B3D2E", accent: "#1E9E6A", soft: "#EAF7EE", ink: "#0B3D2E", muted: "#6E9483",
  };
  const wantsConfetti = theme?.config?.reveal?.confetti !== false;
  const colors: string[] = theme?.config?.reveal?.colors
    ?? [palette.accent, palette.soft, palette.bg];

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dur = reduced ? 300 : 1700;
    const t = window.setTimeout(() => { setPhase("done"); onDone?.(); }, dur);
    if (!reduced && wantsConfetti && canvasRef.current) {
      launchConfetti(canvasRef.current, colors);
    }
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {phase === "reveal" && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${palette.bg}, ${palette.accent})`,
            animation: "certreveal-fade 1.6s ease-out forwards",
          }}
          role="dialog" aria-label="Bevis reveal"
        >
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 w-full h-full" />
          <div
            className="relative rounded-3xl px-8 py-6 text-center"
            style={{
              background: palette.soft,
              color: palette.ink,
              transform: "scale(0.4)",
              animation: "certreveal-pop 1.4s cubic-bezier(0.2,0.9,0.3,1.2) forwards",
              boxShadow: "0 30px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div className="text-[10px] tracking-[0.28em] uppercase" style={{ color: palette.muted }}>
              {theme?.config?.eyebrow ?? "DITT BEVIS"}
            </div>
            <div className="mt-2 font-display text-2xl font-semibold" style={{ color: palette.ink }}>
              {(theme?.config?.heading_template ?? "Ditt bevis är klart").replace("{recipient_name}", "").trim()}
            </div>
          </div>
        </div>
      )}
      <div style={phase === "reveal" ? { visibility: "hidden" } : undefined}>{children}</div>
      <style>{`
        @keyframes certreveal-fade { 0% { opacity: 0 } 20% { opacity: 1 } 80% { opacity: 1 } 100% { opacity: 0 } }
        @keyframes certreveal-pop {
          0% { transform: scale(0.3) rotateX(-40deg); opacity: 0 }
          40% { transform: scale(1.05) rotateX(0); opacity: 1 }
          70% { transform: scale(1); }
          100% { transform: scale(1); opacity: 0 }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="dialog"] { animation: none !important; }
        }
      `}</style>
    </>
  );
}

function launchConfetti(canvas: HTMLCanvasElement, colors: string[]) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const W = window.innerWidth, H = window.innerHeight;
  const pieces = Array.from({ length: 80 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 100,
    y: H / 2 - 50,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 14 - 4,
    g: 0.35,
    size: 4 + Math.random() * 6,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
  }));
  let frames = 0;
  const tick = () => {
    frames++;
    ctx.clearRect(0, 0, W, H);
    pieces.forEach((p) => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });
    if (frames < 110) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(tick);
}
