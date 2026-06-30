import { useEffect, useRef, useState, type ReactNode } from "react";
import "./varfor-trad-story.css";

const SLIDE_MS = 6800;

type Slide = {
  bg: string;
  kicker: string;
  title: string;
  body: string;
  stat?: string;
  art: ReactNode;
};

const SLIDES: Slide[] = [
  {
    bg: "bg1",
    kicker: "Klimatkompensation",
    title: "Varför träd?",
    body: "En liten berättelse om varför vi planterar — och vad det betyder.",
    art: <Slide1 />,
  },
  {
    bg: "bg2",
    kicker: "Steg 1",
    title: "Allt vi gör lämnar ett spår",
    body: "När vi kör bil, värmer huset eller flyger släpper vi ut koldioxid. Den stannar i luften och värmer jorden.",
    art: <Slide2 />,
  },
  {
    bg: "bg3",
    kicker: "Steg 2",
    title: "Ett träd andas",
    body: "Träd tar upp koldioxid ur luften och ger syre tillbaka.",
    stat: "Ett träd binder ≈ 20 kg CO₂ / år",
    art: <Slide3 />,
  },
  {
    bg: "bg4",
    kicker: "Steg 3",
    title: "Det är klimatkompensation",
    body: "Vi planterar träd för att väga upp det vi släpper ut. Lika mycket tillbaka som vi lämnar.",
    art: <Slide4 />,
  },
  {
    bg: "bg5",
    kicker: "Steg 4",
    title: "Ett träd blir en skog",
    body: "Ett träd gör skillnad. Många träd blir en skog som ger djuren ett hem och luften en chans att andas.",
    art: <Slide5 />,
  },
  {
    bg: "bg6",
    kicker: "Tillsammans",
    title: "Därför planterar vi",
    body: "Varje träd är ett litet löfte om en bättre framtid. Och varje träd börjar med någon som bryr sig.",
    art: <Slide6 />,
  },
];

export function VarforTradStory({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number>(performance.now());
  const accRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // reset timing when index changes
  useEffect(() => {
    startRef.current = performance.now();
    accRef.current = 0;
    setProgress(0);
  }, [index]);

  useEffect(() => {
    if (paused) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // freeze accumulated time
      accRef.current += performance.now() - startRef.current;
      return;
    }
    startRef.current = performance.now();
    const tick = () => {
      const elapsed = accRef.current + (performance.now() - startRef.current);
      const p = Math.min(1, elapsed / SLIDE_MS);
      setProgress(p);
      if (p >= 1) {
        setIndex((i) => (i + 1) % SLIDES.length);
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [paused, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setIndex((i) => (i + 1) % SLIDES.length);
      else if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length);
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const goto = (i: number) => setIndex(i);
  const prev = () => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length);
  const next = () => setIndex((i) => (i + 1) % SLIDES.length);

  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 2) prev();
    else next();
  };

  return (
    <div className="vt-root" role="dialog" aria-label="Varför träd — berättelse">
      <div className="vt-progress">
        {SLIDES.map((_, i) => {
          const fill = i < index ? 1 : i === index ? progress : 0;
          return (
            <button
              key={i}
              className="vt-seg"
              onClick={() => goto(i)}
              aria-label={`Gå till slide ${i + 1}`}
            >
              <span className="vt-seg-fill" style={{ width: `${fill * 100}%` }} />
            </button>
          );
        })}
      </div>

      <button className="vt-close" onClick={onClose} aria-label="Stäng">
        ✕
      </button>

      <div className="vt-stage" onClick={onTap}>
        {SLIDES.map((s, i) => (
          <div key={i} className={`slide ${s.bg} ${i === index ? "active" : ""}`}>
            <div className="art">{s.art}</div>
            <div className="copy">
              <div className="kicker">{s.kicker}</div>
              <h2 className="title">{s.title}</h2>
              <p className="body">{s.body}</p>
              {s.stat && <div className="stat">{s.stat}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="vt-controls">
        <button onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Föregående">◀</button>
        <button onClick={(e) => { e.stopPropagation(); setPaused((p) => !p); }} aria-label={paused ? "Spela" : "Pausa"}>
          {paused ? "▶" : "❚❚"}
        </button>
        <button onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Nästa">▶</button>
      </div>
    </div>
  );
}

/* ---------- SVG art per slide ---------- */

function Slide1() {
  return (
    <svg viewBox="0 0 330 330" xmlns="http://www.w3.org/2000/svg">
      <g className="s1-rays" opacity="0.55">
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x="164" y="40" width="2" height="40"
            fill="#DCBE6E"
            transform={`rotate(${i * 30} 165 165)`} />
        ))}
      </g>
      <circle cx="165" cy="165" r="46" fill="#FBE9CC" opacity="0.85" />
      {/* ground */}
      <ellipse cx="165" cy="280" rx="120" ry="14" fill="#9FD9B6" opacity="0.6" />
      {/* sprout stem + leaves */}
      <g>
        <path className="s1-sprout" d="M165 280 Q165 230 165 195" stroke="#15784F" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path className="s1-leafL" d="M165 220 Q130 210 122 188 Q150 188 165 220 Z" fill="#1E9E6A" />
        <path className="s1-leafR" d="M165 205 Q200 195 208 173 Q180 173 165 205 Z" fill="#3CB680" />
      </g>
      {/* pollen */}
      <g>
        <circle className="s1-pollen" cx="80" cy="120" r="4" fill="#DCBE6E" />
        <circle className="s1-pollen" cx="250" cy="100" r="3" fill="#F6B27A" style={{ animationDelay: "1.2s" }} />
        <circle className="s1-pollen" cx="270" cy="200" r="4" fill="#9FD9B6" style={{ animationDelay: "2.4s" }} />
        <circle className="s1-pollen" cx="60" cy="220" r="3" fill="#DCBE6E" style={{ animationDelay: "0.6s" }} />
      </g>
    </svg>
  );
}

function Slide2() {
  return (
    <svg viewBox="0 0 330 330" xmlns="http://www.w3.org/2000/svg">
      {/* house */}
      <rect x="90" y="190" width="100" height="80" rx="6" fill="#F6B27A" />
      <path d="M85 195 L140 145 L195 195 Z" fill="#0B3D2E" />
      <rect x="125" y="220" width="30" height="50" fill="#5C3A1E" />
      {/* chimney */}
      <rect x="170" y="160" width="14" height="30" fill="#5C3A1E" />
      {/* car */}
      <rect x="215" y="240" width="70" height="28" rx="8" fill="#1E9E6A" />
      <rect x="225" y="220" width="50" height="24" rx="6" fill="#15784F" />
      <circle cx="230" cy="272" r="8" fill="#0B3D2E" />
      <circle cx="275" cy="272" r="8" fill="#0B3D2E" />
      {/* puffs */}
      <g>
        <circle className="s2-puff" cx="177" cy="160" r="10" fill="#fff" opacity="0.85" />
        <circle className="s2-puff" cx="177" cy="160" r="12" fill="#fff" style={{ animationDelay: "1.2s" }} />
        <circle className="s2-puff" cx="177" cy="160" r="9" fill="#fff" style={{ animationDelay: "2.4s" }} />
        <circle className="s2-puff" cx="220" cy="225" r="7" fill="#cfcfcf" style={{ animationDelay: "0.6s" }} />
        <circle className="s2-puff" cx="220" cy="225" r="9" fill="#cfcfcf" style={{ animationDelay: "1.8s" }} />
      </g>
      <text x="155" y="100" fontFamily="JetBrains Mono, monospace" fontSize="20" fill="#5C3A1E" fontWeight="600">CO₂</text>
    </svg>
  );
}

function Slide3() {
  return (
    <svg viewBox="0 0 300 240" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="150" cy="212" rx="118" ry="18" fill="#CFE6D6" />
      <rect x="144" y="150" width="12" height="60" rx="4" fill="#9A6F4E" />
      <g className="s3-canopy">
        <circle cx="150" cy="120" r="42" fill="#2D8A60" />
        <circle cx="120" cy="132" r="26" fill="#3CB680" />
        <circle cx="182" cy="130" r="24" fill="#1E9E6A" />
        <circle cx="150" cy="104" r="28" fill="#46C18B" />
      </g>
      <text className="s3-co2 co2a" x="74" y="120" textAnchor="middle" fontFamily="'Familjen Grotesk',sans-serif" fontSize="13" fontWeight="600" fill="#8C7B66">CO₂</text>
      <text className="s3-co2 co2b" x="226" y="116" textAnchor="middle" fontFamily="'Familjen Grotesk',sans-serif" fontSize="13" fontWeight="600" fill="#8C7B66">CO₂</text>
      <text className="s3-o2t o2a" x="120" y="92" textAnchor="middle" fontFamily="'Familjen Grotesk',sans-serif" fontSize="12" fontWeight="600" fill="#2D8A60">O₂</text>
      <text className="s3-o2t o2b" x="150" y="84" textAnchor="middle" fontFamily="'Familjen Grotesk',sans-serif" fontSize="12" fontWeight="600" fill="#2D8A60">O₂</text>
      <text className="s3-o2t o2c" x="180" y="92" textAnchor="middle" fontFamily="'Familjen Grotesk',sans-serif" fontSize="12" fontWeight="600" fill="#2D8A60">O₂</text>
    </svg>
  );
}

function Slide4() {
  return (
    <svg viewBox="0 0 330 330" xmlns="http://www.w3.org/2000/svg">
      {/* base */}
      <rect x="155" y="240" width="20" height="50" fill="#5C3A1E" rx="3" />
      <rect x="120" y="285" width="90" height="10" fill="#5C3A1E" rx="3" />
      {/* beam (scale) */}
      <g className="s4-beam">
        <rect x="60" y="235" width="210" height="8" rx="4" fill="#0B3D2E" />
        {/* left pan: CO2 */}
        <g>
          <line x1="80" y1="243" x2="80" y2="260" stroke="#0B3D2E" strokeWidth="2" />
          <ellipse cx="80" cy="268" rx="32" ry="8" fill="#F6B27A" />
          <text x="62" y="272" fontFamily="JetBrains Mono, monospace" fontSize="14" fill="#5C3A1E" fontWeight="600">CO₂</text>
        </g>
        {/* right pan: tree */}
        <g>
          <line x1="250" y1="243" x2="250" y2="260" stroke="#0B3D2E" strokeWidth="2" />
          <ellipse cx="250" cy="268" rx="32" ry="8" fill="#C7EAD4" />
          <g className="s4-tree" style={{ transformOrigin: "250px 268px" }}>
            <rect x="247" y="248" width="6" height="22" fill="#5C3A1E" />
            <circle cx="250" cy="240" r="16" fill="#1E9E6A" />
          </g>
        </g>
      </g>
      {/* equals */}
      <g className="s4-eq">
        <circle cx="165" cy="160" r="26" fill="#EAF7EE" stroke="#1E9E6A" strokeWidth="2" />
        <rect x="150" y="154" width="30" height="4" rx="2" fill="#15784F" />
        <rect x="150" y="164" width="30" height="4" rx="2" fill="#15784F" />
      </g>
    </svg>
  );
}

function Slide5() {
  return (
    <svg viewBox="0 0 300 240" xmlns="http://www.w3.org/2000/svg">
      <circle className="s5-sun" cx="240" cy="58" r="20" fill="#F8B25C" opacity="0.9" />
      <ellipse cx="150" cy="214" rx="134" ry="20" fill="#BFE0CB" />
      <ellipse cx="150" cy="220" rx="90" ry="12" fill="#A9D5B8" />
      <g className="s5-tree s5-t1"><rect x="46" y="150" width="7" height="40" rx="3" fill="#9A6F4E" /><circle cx="49.5" cy="146" r="20" fill="#2D8A60" /></g>
      <g className="s5-tree s5-t2"><rect x="92" y="138" width="9" height="56" rx="3" fill="#8E6446" /><circle cx="96" cy="132" r="27" fill="#1E9E6A" /></g>
      <g className="s5-tree s5-t3"><rect x="146" y="128" width="10" height="66" rx="4" fill="#9A6F4E" /><circle cx="151" cy="120" r="32" fill="#2D8A60" /><circle cx="132" cy="130" r="18" fill="#3CB680" /></g>
      <g className="s5-tree s5-t4"><rect x="206" y="140" width="9" height="54" rx="3" fill="#8E6446" /><circle cx="210" cy="134" r="26" fill="#1E9E6A" /></g>
      <g className="s5-tree s5-t5"><rect x="252" y="152" width="7" height="38" rx="3" fill="#9A6F4E" /><circle cx="255.5" cy="148" r="19" fill="#3CB680" /></g>
      <g className="s5-tree s5-t6"><rect x="122" y="158" width="6" height="34" rx="3" fill="#9A6F4E" /><circle cx="125" cy="154" r="15" fill="#46C18B" /></g>
      <g className="s5-tree s5-t7"><rect x="180" y="160" width="6" height="32" rx="3" fill="#8E6446" /><circle cx="183" cy="156" r="14" fill="#2D8A60" /></g>
    </svg>
  );
}

function Slide6() {
  return (
    <svg viewBox="0 0 300 240" xmlns="http://www.w3.org/2000/svg">
      <g className="s6-bird s6-b1" stroke="#8A968C" strokeWidth="2.5" fill="none" strokeLinecap="round"><path d="M0 0 Q6 -6 12 0 Q18 -6 24 0" /></g>
      <g className="s6-bird s6-b2" stroke="#9AA69C" strokeWidth="2" fill="none" strokeLinecap="round" transform="translate(0,30)"><path d="M0 0 Q5 -5 10 0 Q15 -5 20 0" /></g>
      <circle className="s6-glow" cx="150" cy="150" r="60" fill="#F8D9A8" opacity="0.4" />
      <g className="s6-sun"><circle cx="150" cy="158" r="40" fill="#F6B86A" /></g>
      <ellipse cx="150" cy="196" rx="126" ry="22" fill="#CFE6D6" />
      <ellipse cx="150" cy="202" rx="86" ry="14" fill="#B7DCC2" />
      <g opacity="0.75"><rect x="78" y="180" width="5" height="17" fill="#7FA98C" /><circle cx="80.5" cy="178" r="11" fill="#6FA683" /></g>
      <g opacity="0.75"><rect x="221" y="178" width="5" height="19" fill="#7FA98C" /><circle cx="223.5" cy="176" r="12" fill="#6FA683" /></g>
      <g className="s6-sprout">
        <path d="M150 200 Q149 178 150 156" stroke="#15784F" strokeWidth="6.5" fill="none" strokeLinecap="round" />
        <path d="M150 172 Q116 170 104 144 Q142 140 150 172 Z" fill="#1E9E6A" />
        <path d="M150 164 Q184 160 196 134 Q158 130 150 164 Z" fill="#3CB680" />
      </g>
    </svg>
  );
}
