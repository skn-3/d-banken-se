import { useEffect, useRef, useState } from "react";
import logoVitAsset from "@/assets/logos/smartklimat-vit.png.asset.json";
const logoVit = logoVitAsset.url;
import { prefersReducedMotion } from "@/lib/celebrate";

interface Props {
  trees: number;
  recipientName?: string | null;
  latestLocation?: string | null;
}

export function TreeBankHero({ trees, recipientName, latestLocation }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState(prefersReducedMotion() ? trees : 0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) { setDisplay(trees); setVisible(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { setVisible(true); io.disconnect(); break; }
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [trees]);

  useEffect(() => {
    if (!visible) return;
    if (prefersReducedMotion()) { setDisplay(trees); return; }
    const start = performance.now();
    const dur = 1200;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(trees * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, trees]);

  const nameLabel = recipientName ? `${recipientName}s namn` : "ditt namn";
  const shownTrees = Math.min(trees, 12);
  const rest = Math.max(0, trees - shownTrees);
  const co2Kg = trees * 20;
  const loc = (latestLocation ?? "").toUpperCase();

  return (
    <div
      ref={ref}
      className="overflow-hidden p-8 sm:p-10 text-center"
      style={{ background: "#0B3D2E", borderRadius: 24, color: "#fff" }}
    >
      <div className="flex justify-center">
        <img src={logoVit} alt="SmartKlimat" style={{ height: 56, width: "auto", objectFit: "contain" }} />
      </div>

      <div
        className="mt-5 font-mono text-xs"
        style={{ color: "#9FD9B6", letterSpacing: "0.28em" }}
      >
        DIN TRÄDBANK
      </div>

      <div
        className="mt-3 font-display font-bold leading-none"
        style={{ color: "#fff", fontSize: "clamp(64px, 14vw, 128px)" }}
      >
        {display.toLocaleString("sv-SE")}
      </div>

      <div className="mt-3 text-base" style={{ color: "#9FD9B6" }}>
        träd planterade i {nameLabel}
      </div>

      {trees > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5" aria-hidden="true">
          {Array.from({ length: shownTrees }).map((_, i) => {
            const size = 22 + ((i * 7) % 5) - 2; // subtle variation ~20-24
            const delay = visible && !prefersReducedMotion() ? 400 + i * 80 : 0;
            return (
              <span
                key={i}
                className="tree-pop inline-block"
                style={{
                  fontSize: size,
                  opacity: visible ? 1 : 0,
                  animationDelay: `${delay}ms`,
                  animationFillMode: "both",
                }}
              >
                🌳
              </span>
            );
          })}
          {rest > 0 && (
            <span
              className="font-mono text-sm ml-1"
              style={{ color: "#DCBE6E", opacity: visible ? 1 : 0, transition: "opacity 300ms 900ms" }}
            >
              +{rest.toLocaleString("sv-SE")}
            </span>
          )}
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        <Chip>≈ {co2Kg.toLocaleString("sv-SE")} KG CO₂ PER ÅR</Chip>
        {loc && <Chip>{loc}</Chip>}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[11px] px-3 py-1.5 rounded-full"
      style={{
        color: "#9FD9B6",
        border: "1px solid rgba(159,217,182,0.35)",
        letterSpacing: "0.12em",
      }}
    >
      {children}
    </span>
  );
}
