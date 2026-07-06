// A4 värdebevis-renderare. Canvas 1240×1754 (A4-proportion).
// Pixeltroget mot faciten i docs/cert-exempel/.
import { forwardRef, useEffect, useState } from "react";
import QRCode from "qrcode";
import { resolveCertProject } from "@/lib/certificate-project";

export type CertThemeSlug =
  | "klassisk"
  | "kalaset"
  | "midnattsskogen"
  | "djurfaddern";

// Mappar tema-slug (från greeting_themes) till A4-bakgrundstema.
// Teman utan egen certbakgrund faller tillbaka till klassisk.
export function resolveCertTheme(themeSlug?: string | null): CertThemeSlug {
  const s = (themeSlug || "").toLowerCase();
  if (s === "kalaset") return "kalaset";
  if (s === "midnattsskogen") return "midnattsskogen";
  if (s === "djurfadern" || s === "djurfaddern") return "djurfaddern";
  return "klassisk";
}

interface Palette {
  bg: string;
  cushionColor: string;
  cushionAlpha: number;
  topGradient: string;
  footGradient: string;
  headingColor: string;   // VÄRDEBEVIS
  eyebrowColor: string;   // small caps
  nameColor: string;
  bodyColor: string;
  countColor: string;
  accentLine: string;
  co2Color: string;
  greetingColor: string;
  footerText: string;
  sealRing: string;
}

const PALETTES: Record<CertThemeSlug, Palette> = {
  klassisk: {
    bg: "/certs/bg-klassisk.jpg",
    cushionColor: "255,255,255",
    cushionAlpha: 0.34,
    topGradient: "linear-gradient(180deg, rgba(11,61,46,0.52) 0%, rgba(11,61,46,0.42) 30%, rgba(11,61,46,0) 100%)",
    footGradient: "linear-gradient(180deg, rgba(11,61,46,0) 0%, rgba(11,61,46,0.78) 65%, rgba(11,61,46,0.85) 100%)",
    headingColor: "#0B3D2E",
    eyebrowColor: "#15784F",
    nameColor: "#0B3D2E",
    bodyColor: "#2E4438",
    countColor: "#0B3D2E",
    accentLine: "#B08D3E",
    co2Color: "#15784F",
    greetingColor: "#2E4438",
    footerText: "#F5EFDA",
    sealRing: "#B08D3E",
  },
  kalaset: {
    bg: "/certs/bg-kalaset.jpg",
    cushionColor: "255,255,255",
    cushionAlpha: 0.34,
    topGradient: "linear-gradient(180deg, rgba(11,61,46,0.48) 0%, rgba(11,61,46,0.38) 30%, rgba(11,61,46,0) 100%)",
    footGradient: "linear-gradient(180deg, rgba(11,61,46,0) 0%, rgba(11,61,46,0.78) 65%, rgba(11,61,46,0.85) 100%)",
    headingColor: "#0B3D2E",
    eyebrowColor: "#C4762B",
    nameColor: "#0B3D2E",
    bodyColor: "#2E4438",
    countColor: "#0B3D2E",
    accentLine: "#C4762B",
    co2Color: "#C4762B",
    greetingColor: "#2E4438",
    footerText: "#F5EFDA",
    sealRing: "#C4762B",
  },
  midnattsskogen: {
    bg: "/certs/bg-midnattsskogen.jpg",
    cushionColor: "4,21,15",
    cushionAlpha: 0.5,
    topGradient: "linear-gradient(180deg, rgba(4,15,10,0.52) 0%, rgba(4,15,10,0.35) 35%, rgba(4,15,10,0) 100%)",
    footGradient: "linear-gradient(180deg, rgba(4,15,10,0) 0%, rgba(4,15,10,0.82) 65%, rgba(4,15,10,0.9) 100%)",
    headingColor: "#DCBE6E",
    eyebrowColor: "#9FD9B6",
    nameColor: "#F4FAF5",
    bodyColor: "#C9E4D4",
    countColor: "#F4FAF5",
    accentLine: "#DCBE6E",
    co2Color: "#DCBE6E",
    greetingColor: "#C9E4D4",
    footerText: "#DCBE6E",
    sealRing: "#DCBE6E",
  },
  djurfaddern: {
    bg: "/certs/bg-djurfaddern.jpg",
    cushionColor: "255,255,255",
    cushionAlpha: 0.34,
    topGradient: "linear-gradient(180deg, rgba(11,61,46,0.5) 0%, rgba(11,61,46,0.4) 30%, rgba(11,61,46,0) 100%)",
    footGradient: "linear-gradient(180deg, rgba(11,61,46,0) 0%, rgba(11,61,46,0.8) 65%, rgba(11,61,46,0.88) 100%)",
    headingColor: "#0B3D2E",
    eyebrowColor: "#B08D3E",
    nameColor: "#0B3D2E",
    bodyColor: "#2E4438",
    countColor: "#0B3D2E",
    accentLine: "#B08D3E",
    co2Color: "#B08D3E",
    greetingColor: "#2E4438",
    footerText: "#F5EFDA",
    sealRing: "#B08D3E",
  },
};

export interface CertA4Data {
  verification_id: string;
  recipient_name: string;
  tree_count: number;
  location_name: string;
  latitude: number | string;
  longitude: number | string;
  issued_date: string;
  greeting?: string | null;
  themeSlug?: string | null;
}

const W = 1240;
const H = 1754;
const CX = W / 2;

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
const DISPLAY = '"Bricolage Grotesque", ui-serif, Georgia, serif';
const BODY = '"Familjen Grotesk", ui-sans-serif, system-ui, sans-serif';

function fmtDateSv(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
}

function fmtCoord(n: number | string, digits = 6) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(v)) return "";
  return v.toFixed(digits);
}

interface Props { data: CertA4Data; scale?: number }

export const CertificateA4 = forwardRef<HTMLDivElement, Props>(function CertificateA4({ data, scale = 1 }, ref) {
  const themeKey = resolveCertTheme(data.themeSlug);
  const p = PALETTES[themeKey];
  const project = resolveCertProject(data.location_name);
  const treesLabel = data.tree_count === 1 ? "1 TRÄD" : `${data.tree_count.toLocaleString("sv-SE")} TRÄD`;
  const verifyUrl = `https://smartklimat.org/v/${data.verification_id}`;
  const co2 = data.tree_count * 20;

  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  useEffect(() => {
    QRCode.toDataURL(verifyUrl, { margin: 0, width: 320, errorCorrectionLevel: "M", color: { dark: "#0B3D2E", light: "#FFFFFF" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [verifyUrl]);

  const px = (n: number) => `${n}px`;
  const abs = (top: number, left: number = 0, width?: number): React.CSSProperties => ({
    position: "absolute", top: px(top), left: px(left), width: width != null ? px(width) : undefined,
  });

  // Bröd (three rows). Vi splittar manuellt på ord för att få tre balanserade rader.
  const bodyLines = splitToLines(project.story, 3, 68);

  return (
    <div ref={ref} style={{
      width: W, height: H, position: "relative", overflow: "hidden",
      background: "#0B3D2E", color: p.bodyColor, fontFamily: BODY,
      transform: scale !== 1 ? `scale(${scale})` : undefined,
      transformOrigin: "top left",
    }}>
      {/* Layer 1: bakgrundsbild fullbleed */}
      <img
        src={p.bg}
        alt=""
        crossOrigin="anonymous"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />

      {/* Layer 2: radial "lugnkudde" */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 62% 55% at 50% 52%, rgba(${p.cushionColor},${p.cushionAlpha}) 0%, rgba(${p.cushionColor},${p.cushionAlpha * 0.6}) 45%, rgba(${p.cushionColor},0) 78%)`,
      }} />

      {/* Layer 3: topptoning */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 520, background: p.topGradient }} />

      {/* Layer 4: fotband */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 380, background: p.footGradient }} />

      {/* Layer 5: text */}
      {/* Serienummer + serie */}
      <div style={{ ...abs(120, 120), fontFamily: MONO, fontSize: 12.5, letterSpacing: "0.28em", color: p.accentLine, textTransform: "uppercase" }}>
        N° {data.verification_id}
      </div>
      <div style={{ ...abs(120), right: 120, left: "auto", fontFamily: MONO, fontSize: 12.5, letterSpacing: "0.28em", color: p.accentLine, textTransform: "uppercase" }}>
        SERIE A · MMXXVI
      </div>

      {/* Sigill: mörkgrön cirkel + guldring + vita stämpel */}
      <div style={{
        position: "absolute", top: 200 - 66, left: CX - 66, width: 132, height: 132,
        borderRadius: "50%", background: "#0B3D2E",
        boxShadow: `0 0 0 3px ${p.sealRing}, 0 0 0 5px rgba(11,61,46,0.6)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <img src="/brand/logo-stamp-vit.png" alt="" crossOrigin="anonymous"
             style={{ width: 100, height: 100, objectFit: "contain" }} />
      </div>

      {/* SMARTKLIMAT */}
      <div style={{ ...abs(318), left: 0, right: 0, width: "100%", textAlign: "center",
        fontFamily: MONO, fontSize: 14, letterSpacing: "0.5em", color: p.headingColor, opacity: 0.9 }}>
        SMARTKLIMAT
      </div>

      {/* VÄRDEBEVIS */}
      <div style={{ ...abs(475 - 40), left: 0, right: 0, width: "100%", textAlign: "center",
        fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, lineHeight: 1, letterSpacing: "0.06em", color: p.headingColor }}>
        VÄRDEBEVIS
      </div>

      {/* DETTA BEVIS INTYGAR ATT */}
      <div style={{ ...abs(548), left: 0, right: 0, width: "100%", textAlign: "center",
        fontFamily: MONO, fontSize: 13, letterSpacing: "0.32em", color: p.eyebrowColor }}>
        DETTA BEVIS INTYGAR ATT
      </div>

      {/* Mottagarnamn */}
      <div style={{ ...abs(618 - 42), left: 0, right: 0, width: "100%", textAlign: "center",
        fontFamily: DISPLAY, fontWeight: 700, fontSize: 68, lineHeight: 1, color: p.nameColor, letterSpacing: "-0.01em" }}>
        {data.recipient_name}
      </div>

      {/* Guldlinje */}
      <div style={{ position: "absolute", top: 700, left: CX - 270, width: 540, height: 1.5, background: p.accentLine, opacity: 0.9 }} />

      {/* HAR LÅTIT PLANTERA */}
      <div style={{ ...abs(722), left: 0, right: 0, width: "100%", textAlign: "center",
        fontFamily: MONO, fontSize: 13, letterSpacing: "0.32em", color: p.eyebrowColor }}>
        HAR LÅTIT PLANTERA
      </div>

      {/* {antal} TRÄD */}
      <div style={{ ...abs(766), left: 0, right: 0, width: "100%", textAlign: "center",
        fontFamily: DISPLAY, fontWeight: 700, fontSize: 52, letterSpacing: "0.02em", color: p.countColor }}>
        {treesLabel}
      </div>

      {/* Jordglob + koordinater */}
      <div style={{ ...abs(834), left: 0, right: 0, width: "100%", textAlign: "center",
        fontFamily: MONO, fontSize: 15, letterSpacing: "0.06em", color: p.bodyColor,
        display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
        <span style={{
          display: "inline-flex", width: 22, height: 22, borderRadius: "50%",
          border: `1.5px solid ${p.co2Color}`, alignItems: "center", justifyContent: "center",
        }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={p.co2Color} strokeWidth="1.4">
            <circle cx="10" cy="10" r="8" />
            <path d="M2 10h16 M10 2c3 3 3 13 0 16 M10 2c-3 3-3 13 0 16" />
          </svg>
        </span>
        {fmtCoord(data.latitude)} · {fmtCoord(data.longitude)}
      </div>

      {/* Brödtext tre rader från y872 */}
      <div style={{ position: "absolute", top: 900, left: 0, right: 0, textAlign: "center",
        fontFamily: BODY, fontSize: 16.5, lineHeight: `32px`, color: p.bodyColor }}>
        {bodyLines.map((line, i) => (
          <div key={i} style={{ padding: "0 200px" }}>{line}</div>
        ))}
      </div>

      {/* CO2-rad y1000 */}
      <div style={{ ...abs(1030), left: 0, right: 0, width: "100%", textAlign: "center",
        fontFamily: MONO, fontSize: 12, letterSpacing: "0.32em", color: p.co2Color }}>
        BINDER CIRKA {co2.toLocaleString("sv-SE")} KG KOLDIOXID PER ÅR
      </div>

      {/* Personlig hälsning y1078 — utelämnas om saknas */}
      {data.greeting && data.greeting.trim() && (
        <div style={{ ...abs(1108), left: 0, right: 0, width: "100%", textAlign: "center",
          fontFamily: BODY, fontStyle: "italic", fontSize: 16, color: p.greetingColor }}>
          &ldquo;{data.greeting.trim()}&rdquo;
        </div>
      )}

      {/* Djurfaddern-medaljong */}
      {themeKey === "djurfaddern" && (
        <>
          <div style={{
            position: "absolute", top: 1210 - 62, left: CX - 62, width: 124, height: 124,
            borderRadius: "50%", background: "#D6ECD9",
            boxShadow: `0 0 0 3px ${p.sealRing}, 0 0 0 5px rgba(11,61,46,0.4)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 62,
          }}>
            🐆
          </div>
          <div style={{ ...abs(1310), left: 0, right: 0, width: "100%", textAlign: "center",
            fontFamily: MONO, fontSize: 12.5, letterSpacing: "0.32em", color: p.eyebrowColor }}>
            FADDERSKAP · JAGUARENS KORRIDOR
          </div>
        </>
      )}

      {/* ============ OFFICIELLA FOTEN från y1424 ============ */}
      {/* Guldlinje */}
      <div style={{ position: "absolute", top: 1424, left: 120, right: 120, height: 1, background: p.accentLine, opacity: 0.8 }} />

      {/* UTFÄRDAT */}
      <div style={{ position: "absolute", top: 1462, left: 120, width: 240, color: p.footerText, fontFamily: MONO }}>
        <div style={{ fontSize: 11, letterSpacing: "0.34em", opacity: 0.75 }}>UTFÄRDAT</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, marginTop: 12, color: p.footerText, letterSpacing: 0 }}>
          {fmtDateSv(data.issued_date)}
        </div>
        <div style={{ fontSize: 11, letterSpacing: "0.32em", marginTop: 8, opacity: 0.75 }}>STOCKHOLM, SVERIGE</div>
      </div>

      {/* Signaturkurva mitten */}
      <div style={{ position: "absolute", top: 1462, left: CX - 160, width: 320, textAlign: "center", color: p.footerText, fontFamily: MONO }}>
        <svg width="200" height="34" viewBox="0 0 200 34" style={{ display: "block", margin: "0 auto" }}>
          <path d="M8 24 C 30 6, 50 30, 70 14 S 110 4, 130 20 S 170 8, 192 22" stroke={p.footerText} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <line x1="8" y1="30" x2="192" y2="30" stroke={p.footerText} strokeWidth="0.8" opacity="0.5" />
        </svg>
        <div style={{ fontSize: 10.5, letterSpacing: "0.3em", marginTop: 8, opacity: 0.85 }}>
          UTFÄRDARENS SIGNATUR · SMARTKLIMAT
        </div>
      </div>

      {/* QR-kod + verifiera */}
      <div style={{ position: "absolute", top: 1462, right: 120, display: "flex", gap: 18, alignItems: "flex-start", color: p.footerText, fontFamily: MONO }}>
        <div style={{ width: 106, height: 106, background: "#FFFFFF", borderRadius: 6, padding: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.15)" }}>
          {qrDataUrl && <img src={qrDataUrl} alt="QR" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
        </div>
        <div style={{ minWidth: 180 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.34em", opacity: 0.75 }}>VERIFIERA</div>
          <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 15, marginTop: 12, letterSpacing: "0.05em" }}>
            {data.verification_id}
          </div>
          <div style={{ fontSize: 11.5, marginTop: 6, opacity: 0.85 }}>
            smartklimat.org/v/{data.verification_id}
          </div>
        </div>
      </div>

      {/* Slutrader */}
      <div style={{
        position: "absolute", bottom: 50, left: 120, right: 120, textAlign: "center",
        fontFamily: MONO, fontSize: 11, letterSpacing: "0.22em", color: p.footerText, opacity: 0.85, lineHeight: 1.7,
      }}>
        <div>UTFÄRDAT AV SMARTKLIMATKOMPENSERA PÅ TELLUS AB · ORG.NR 559370-9453</div>
        <div>DETTA BEVIS KAN VERIFIERAS DIGITALT PÅ SMARTKLIMAT.ORG</div>
      </div>
    </div>
  );
});

// Splitta text i n rader med ungefär `target` tecken per rad.
function splitToLines(text: string, n: number, target: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > target && lines.length < n - 1) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur);
  while (lines.length < n) lines.push("");
  return lines.slice(0, n);
}
