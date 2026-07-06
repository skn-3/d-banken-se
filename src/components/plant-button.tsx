import { useEffect, useRef, useState } from "react";
import { haptic, prefersReducedMotion } from "@/lib/celebrate";

type Props = {
  onClick: () => void;
  fireMode?: boolean;
};

/**
 * Primär Plantera-knapp för säljarvyn.
 * Placeras direkt under nivåkortet och FÖRE statskorten.
 * När den scrollats ur bild visas en mini-flytande knapp nere till höger.
 */
export function PlantButton({ onClick, fireMode = false }: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [mainVisible, setMainVisible] = useState(true);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setMainVisible(entry.isIntersecting),
      { rootMargin: "0px 0px -40px 0px", threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const handleClick = () => {
    if (!prefersReducedMotion()) haptic(20);
    onClick();
  };

  return (
    <>
      <div ref={sentinelRef} className="flex justify-center">
        <button
          type="button"
          onClick={handleClick}
          className={`plant-btn plant-btn--main${fireMode ? " is-fire" : ""}`}
          aria-label="Plantera träd"
        >
          <span className="plant-btn__ring" aria-hidden />
          <span className="plant-btn__shine" aria-hidden />
          <span className="plant-btn__inner">
            <span className="plant-btn__icon" aria-hidden>
              {fireMode ? (
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
                  <path
                    d="M12 3s2 3.2 2 6a2 2 0 1 1-4 0c0-1 .5-2 .5-2S8 9 8 12a4 4 0 1 0 8 0c0-4-4-9-4-9z"
                    fill="#fff"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
                  <path
                    d="M12 20V11M12 11c0-3 2-5 5-5-.2 3-2 5-5 5zm0 0C12 8 10 6 7 6c.2 3 2 5 5 5z"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <span className="plant-btn__label font-display">Plantera träd</span>
          </span>
        </button>
      </div>
      <div
        className={`plant-btn__sub text-center${fireMode ? " is-fire" : ""}`}
        aria-live="polite"
      >
        {fireMode ? "Rädda elden — plantera idag" : "Ett träd tar två minuter"}
      </div>

      {/* Flytande mini-knapp */}
      <button
        type="button"
        onClick={handleClick}
        aria-label="Plantera träd"
        className={`plant-btn plant-btn--mini${fireMode ? " is-fire" : ""}${
          mainVisible ? " is-hidden" : " is-shown"
        }`}
      >
        <span className="plant-btn__ring plant-btn__ring--mini" aria-hidden />
        <span className="plant-btn__inner">
          <span className="plant-btn__icon" aria-hidden>
            {fireMode ? (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <path
                  d="M12 3s2 3.2 2 6a2 2 0 1 1-4 0c0-1 .5-2 .5-2S8 9 8 12a4 4 0 1 0 8 0c0-4-4-9-4-9z"
                  fill="#fff"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <path
                  d="M12 20V11M12 11c0-3 2-5 5-5-.2 3-2 5-5 5zm0 0C12 8 10 6 7 6c.2 3 2 5 5 5z"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        </span>
      </button>

      <style>{`
        .plant-btn {
          position: relative;
          border: 0;
          cursor: pointer;
          color: #fff;
          background: linear-gradient(135deg, #1E9E6A 0%, #15784F 100%);
          box-shadow: 0 18px 40px -14px rgba(21, 120, 79, 0.65),
                      0 6px 14px -6px rgba(21, 120, 79, 0.4);
          transition: transform 180ms cubic-bezier(.34,1.56,.64,1);
          overflow: hidden;
          isolation: isolate;
        }
        .plant-btn:focus-visible {
          outline: 3px solid #DCBE6E;
          outline-offset: 3px;
        }
        .plant-btn:active { transform: scale(0.96); }

        /* Huvudknapp */
        .plant-btn--main {
          width: 100%;
          max-width: 380px;
          height: 88px;
          border-radius: 999px;
          animation: plant-breathe 2.2s ease-in-out infinite alternate,
                     plant-nudge 8s ease-in-out infinite;
          transform-origin: center;
        }
        .plant-btn__inner {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          width: 100%;
          height: 100%;
        }
        .plant-btn__icon {
          display: inline-grid;
          place-items: center;
          width: 34px;
          height: 34px;
        }
        .plant-btn__label {
          font-weight: 700;
          font-size: 22px;
          letter-spacing: 0.2px;
        }

        /* Ping-ring bakom */
        .plant-btn__ring {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 3px solid #DCBE6E;
          opacity: 0;
          z-index: 1;
          pointer-events: none;
          animation: plant-ping 2.8s ease-out infinite;
        }
        .plant-btn.is-fire .plant-btn__ring { border-color: #F6B27A; }

        /* Glanssvep */
        .plant-btn__shine {
          position: absolute;
          top: 0; bottom: 0;
          left: -40%;
          width: 40%;
          background: linear-gradient(115deg,
            rgba(255,255,255,0) 0%,
            rgba(255,255,255,0.25) 50%,
            rgba(255,255,255,0) 100%);
          transform: skewX(-18deg);
          z-index: 2;
          pointer-events: none;
          animation: plant-shine 4s ease-in-out infinite;
        }

        .plant-btn__sub {
          margin-top: 10px;
          font-size: 13px;
          color: var(--muted-foreground);
          font-weight: 500;
        }
        .plant-btn__sub.is-fire {
          color: #E87A2C;
          font-weight: 700;
        }

        /* Mini-knapp */
        .plant-btn--mini {
          position: fixed;
          right: 18px;
          bottom: 22px;
          width: 56px;
          height: 56px;
          border-radius: 999px;
          z-index: 40;
          animation: plant-breathe 3.1s ease-in-out infinite alternate;
          transition: opacity 200ms ease, transform 220ms cubic-bezier(.34,1.56,.64,1);
        }
        .plant-btn--mini.is-hidden {
          opacity: 0;
          transform: scale(0.6) translateY(10px);
          pointer-events: none;
        }
        .plant-btn--mini.is-shown {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
        .plant-btn__ring--mini { animation-duration: 3.4s; }

        @keyframes plant-breathe {
          from { transform: scale(1); }
          to   { transform: scale(1.035); }
        }
        @keyframes plant-ping {
          0%   { transform: scale(1);    opacity: 0.7; }
          70%  { transform: scale(1.18); opacity: 0; }
          100% { transform: scale(1.18); opacity: 0; }
        }
        @keyframes plant-shine {
          0%   { left: -40%; }
          60%  { left: 110%; }
          100% { left: 110%; }
        }
        @keyframes plant-nudge {
          0%, 88%, 100% { rotate: 0deg; translate: 0 0; }
          90%           { rotate: -2.5deg; translate: 0 -4px; }
          94%           { rotate:  2.5deg; translate: 0 -2px; }
          97%           { rotate: 0deg; translate: 0 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .plant-btn,
          .plant-btn__ring,
          .plant-btn__shine,
          .plant-btn--mini {
            animation: none !important;
            transform: none !important;
          }
          .plant-btn__shine { display: none; }
          .plant-btn--mini.is-hidden { opacity: 0; }
          .plant-btn--mini.is-shown  { opacity: 1; }
        }
      `}</style>
    </>
  );
}
