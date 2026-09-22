import { forwardRef } from "react";

export const CERT_TAGLINE = "Tänk smart, vi har ett gemensamt klimat";
const STAMP_URL = "/brand/logo-stamp-guld.png";

export type ThemeKey = "klassisk_gron" | "midnatt" | "papper_guld" | "kalas" | "vinter";
export type MotifKey = "trad_rad" | "stjarnhimmel" | "konfetti_ballonger" | "projektdjur" | "snoflingor_granar" | "ingen";
export type FrameKey = "ingen" | "guldlinje" | "dubbel";
export type HighlightKey = "trad_stort" | "co2_stort" | "plats_stort";

export interface TemplateConfig {
  tema?: ThemeKey;
  motiv?: MotifKey;
  ram?: FrameKey;
  highlight?: HighlightKey;
  visa_falt?: { co2?: boolean; plats?: boolean; datum?: boolean; karta?: boolean };
  badge_position?: "top-right" | "bottom-right" | "top-left" | "bottom-left";
}

export interface CertificateData {
  verification_id: string;
  recipient_name: string;
  tree_count: number;
  location_name: string;
  latitude: number | string;
  longitude: number | string;
  issued_date: string;
  greeting?: string | null;
  template: {
    template_slug?: string | null;
    bg_url?: string | null;
    logo_url?: string | null;
    accent_color: string;
    heading_text: string;
    body_text: string;
    background_key: string;
    show_coordinates: boolean;
    show_social: boolean;
    social_handles: string;
    config: TemplateConfig;
    allows_greeting?: boolean;
    partner?: { name?: string; logo?: string } | null;
  };
}

const THEMES: Record<ThemeKey, { bg: string; ink: string; muted: string; accent: string }> = {
  klassisk_gron: { bg: "linear-gradient(155deg,#EAF7EE 0%,#C7EAD4 70%,#9FD9B6 100%)", ink: "#0B3D2E", muted: "#6E9483", accent: "#1E9E6A" },
  midnatt:       { bg: "linear-gradient(160deg,#0B1633 0%,#152A55 65%,#243D74 100%)", ink: "#F7FAFF", muted: "#B8C4E0", accent: "#7BA3D9" },
  papper_guld:   { bg: "linear-gradient(155deg,#F8F1DF 0%,#EFE4C4 100%)", ink: "#3A2B10", muted: "#8C7947", accent: "#C48A3B" },
  kalas:         { bg: "linear-gradient(155deg,#FFF3F5 0%,#FFD9E1 60%,#FFB6C6 100%)", ink: "#7A1B36", muted: "#B34E68", accent: "#E94A6B" },
  vinter:        { bg: "linear-gradient(160deg,#EEF6F1 0%,#D6E7DE 60%,#B4CFC0 100%)", ink: "#12312A", muted: "#4E7A6A", accent: "#4E7A5C" },
};

export const BACKGROUND_OPTIONS: { key: string; label: string; css: string }[] = [
  { key: "mint", label: "Mint", css: THEMES.klassisk_gron.bg },
  { key: "midnatt", label: "Midnatt", css: THEMES.midnatt.bg },
  { key: "papper_guld", label: "Papper & guld", css: THEMES.papper_guld.bg },
  { key: "kalas", label: "Kalas", css: THEMES.kalas.bg },
  { key: "vinter", label: "Vinter", css: THEMES.vinter.bg },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
}

function resolveTheme(t: CertificateData["template"]) {
  const themeKey = t.config?.tema;
  if (themeKey && THEMES[themeKey]) return { ...THEMES[themeKey], accent: t.accent_color || THEMES[themeKey].accent };
  const bgKey = (t.background_key as ThemeKey) || "klassisk_gron";
  const base = THEMES[bgKey] || THEMES.klassisk_gron;
  return { ...base, accent: t.accent_color || base.accent };
}

function Motif({ kind, ink, muted }: { kind: MotifKey; ink: string; muted: string }) {
  if (kind === "ingen") return null;
  if (kind === "trad_rad") {
    return (
      <svg aria-hidden viewBox="0 0 720 60" style={{ position: "absolute", left: 0, right: 0, bottom: 24, width: "100%", opacity: 0.22 }}>
        {Array.from({ length: 18 }).map((_, i) => (
          <g key={i} transform={`translate(${20 + i * 40},50)`}>
            <rect x="-2" y="-16" width="4" height="16" fill={ink} />
            <circle cx="0" cy="-24" r="14" fill={ink} />
          </g>
        ))}
      </svg>
    );
  }
  if (kind === "stjarnhimmel") {
    return (
      <svg aria-hidden viewBox="0 0 720 980" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.45 }}>
        {Array.from({ length: 60 }).map((_, i) => (
          <circle key={i} cx={Math.random() * 720} cy={Math.random() * 500} r={Math.random() * 1.6 + 0.4} fill="#fff" />
        ))}
      </svg>
    );
  }
  if (kind === "konfetti_ballonger") {
    return (
      <svg aria-hidden viewBox="0 0 720 980" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.5 }}>
        {["#E94A6B", "#F5C242", "#5DADE2", "#7BC47F"].map((c, ci) => (
          <g key={ci}>
            {Array.from({ length: 20 }).map((_, i) => (
              <rect key={i} x={Math.random() * 720} y={Math.random() * 980} width="6" height="10" fill={c} transform={`rotate(${Math.random() * 360})`} />
            ))}
          </g>
        ))}
      </svg>
    );
  }
  if (kind === "snoflingor_granar") {
    return (
      <svg aria-hidden viewBox="0 0 720 980" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.35 }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <text key={i} x={Math.random() * 720} y={Math.random() * 700} fontSize={Math.random() * 12 + 8} fill={muted}>❄</text>
        ))}
      </svg>
    );
  }
  if (kind === "projektdjur") {
    return (
      <div aria-hidden style={{ position: "absolute", right: 32, bottom: 32, fontSize: 90, opacity: 0.35, filter: "grayscale(20%)" }}>
        🐘
      </div>
    );
  }
  return null;
}

function Frame({ kind, accent }: { kind: FrameKey; accent: string }) {
  if (kind === "ingen") return null;
  if (kind === "guldlinje") {
    return <div style={{ position: "absolute", inset: 18, borderRadius: 18, border: `1.5px solid ${accent}`, pointerEvents: "none" }} />;
  }
  return (
    <>
      <div style={{ position: "absolute", inset: 14, borderRadius: 20, border: `1.5px solid ${accent}`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 24, borderRadius: 14, border: `1px solid ${accent}55`, pointerEvents: "none" }} />
    </>
  );
}

interface Props {
  data: CertificateData;
  scale?: number;
}

export const Certificate = forwardRef<HTMLDivElement, Props>(function Certificate({ data, scale = 1 }, ref) {
  const { template: t, greeting } = data;
  if (t.template_slug === "mockfjards") {
    const coordinates = `${Number(data.latitude).toFixed(4)}, ${Number(data.longitude).toFixed(4)}`;
    return (
      <div
        ref={ref}
        style={{
          width: 720, minHeight: 980, position: "relative", overflow: "hidden", borderRadius: 24,
          border: "1px solid rgba(11,61,46,0.12)", boxShadow: "0 30px 80px -50px rgba(11,61,46,0.25)",
          backgroundColor: "#FAF8F0", color: "#0B3D2E",
          fontFamily: '"Familjen Grotesk", system-ui, sans-serif',
          transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: "top left",
        }}
      >
        <img src={t.bg_url || "/certs/bg-mockfjards.jpg"} alt="" crossOrigin="anonymous" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.02) 70%)" }} />
        <div style={{ position: "relative", zIndex: 1, minHeight: 980, padding: "44px 58px 40px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: "100%", display: "flex", justifyContent: "flex-start", alignItems: "center" }}>
            <div style={{ padding: "7px 12px", borderRadius: 10, background: "rgba(255,255,255,0.72)", boxShadow: "0 2px 14px rgba(11,61,46,0.08)" }}>
              <img src={t.partner?.logo || "/brand/mockfjards-badge.png"} alt="Mockfjärds" crossOrigin="anonymous" style={{ display: "block", width: 142, height: 58, objectFit: "contain", objectPosition: "left center" }} />
            </div>
          </div>
          <div style={{ width: 190, height: 1, marginTop: 20, background: "#DCBE6E" }} />
          <div style={{ marginTop: 22, fontFamily: '"Bricolage Grotesque", serif', fontWeight: 700, fontSize: 48, lineHeight: 1, color: "#0B3D2E" }}>VÄRDEBEVIS</div>
          <div style={{ marginTop: 22, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: "0.2em", color: "#6D806F" }}>DETTA BEVIS INTYGAR ATT</div>
          <div style={{ marginTop: 16, maxWidth: 570, fontFamily: '"Bricolage Grotesque", serif', fontWeight: 700, fontSize: 44, lineHeight: 1.05, color: "#0B3D2E" }}>{data.recipient_name}</div>
          <div style={{ width: 310, height: 1, marginTop: 22, background: "#DCBE6E" }} />
          <div style={{ marginTop: 18, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: "0.2em", color: "#6D806F" }}>HAR LÅTIT PLANTERA</div>
          <div style={{ marginTop: 8, fontFamily: '"Bricolage Grotesque", serif', fontWeight: 700, fontSize: 112, lineHeight: 0.9, color: "#0B3D2E" }}>{data.tree_count.toLocaleString("sv-SE")}</div>
          <div style={{ marginTop: 8, fontFamily: '"Bricolage Grotesque", serif', fontWeight: 700, fontSize: 22, color: "#DCBE6E" }}>{data.tree_count === 1 ? "TRÄD" : "TRÄD"}</div>
          {greeting && <div style={{ marginTop: 18, maxWidth: 480, fontSize: 14, fontStyle: "italic", lineHeight: 1.45, color: "#385749" }}>&ldquo;{greeting}&rdquo;</div>}
          {t.body_text && <p style={{ margin: "18px auto 0", maxWidth: 440, fontSize: 13, lineHeight: 1.45, color: "#385749", textAlign: "center" }}>{t.body_text}</p>}
          <div style={{ width: 440, borderTop: "1px solid #DCBE6E", marginTop: 18, paddingTop: 12, fontFamily: '"JetBrains Mono", monospace', fontSize: 9, lineHeight: 1.5, color: "#355447", textAlign: "center" }}>
            <div>{data.location_name}</div>
            <div>{coordinates}</div>
            <div>{fmtDate(data.issued_date)}</div>
            <div style={{ marginTop: 2, fontWeight: 700 }}>{data.verification_id}</div>
            <div>smartklimat.org/v/{data.verification_id}</div>
          </div>
          <img src="/brand/logo-stamp-guld.png" alt="SmartKlimat" crossOrigin="anonymous" style={{ width: 82, height: 82, marginTop: 12, objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(151,110,25,0.18))" }} />
          <div style={{ flex: 1 }} />
        </div>
      </div>
    );
  }
  const theme = resolveTheme(t);
  const cfg = t.config ?? {};
  const highlight = cfg.highlight ?? "trad_stort";
  const motif = cfg.motiv ?? "ingen";
  const frame = cfg.ram ?? "ingen";
  const show = { co2: true, plats: true, datum: true, karta: false, ...(cfg.visa_falt ?? {}) };
  const co2 = data.tree_count * 20;

  const HighlightBlock = () => {
    if (highlight === "co2_stort") {
      return (
        <>
          <div style={{ marginTop: 40, fontFamily: '"Bricolage Grotesque", serif', fontWeight: 700, fontSize: 128, lineHeight: 0.9, color: theme.accent, letterSpacing: "-0.03em" }}>
            {co2.toLocaleString("sv-SE")}
          </div>
          <div style={{ marginTop: 8, fontSize: 15, color: theme.muted }}>kg CO₂ bundet varje år</div>
          <div style={{ marginTop: 14, fontSize: 20, fontWeight: 600, color: theme.ink }}>{data.tree_count.toLocaleString("sv-SE")} träd planterade</div>
        </>
      );
    }
    if (highlight === "plats_stort") {
      return (
        <>
          <div style={{ marginTop: 40, fontFamily: '"Bricolage Grotesque", serif', fontWeight: 700, fontSize: 42, lineHeight: 1.1, color: theme.accent, maxWidth: 520 }}>
            {data.location_name}
          </div>
          <div style={{ marginTop: 18, fontSize: 34, fontWeight: 700, color: theme.ink, fontFamily: '"Bricolage Grotesque", serif' }}>
            {data.tree_count.toLocaleString("sv-SE")} träd
          </div>
        </>
      );
    }
    return (
      <>
        <div style={{ marginTop: 40, fontFamily: '"Bricolage Grotesque", serif', fontWeight: 700, fontSize: 148, lineHeight: 0.9, color: theme.accent, letterSpacing: "-0.03em" }}>
          {data.tree_count.toLocaleString("sv-SE")}
        </div>
        <div style={{ marginTop: 10, fontSize: 15, fontWeight: 500, color: theme.muted, letterSpacing: "0.02em" }}>träd planterade</div>
      </>
    );
  };

  return (
    <div
      ref={ref}
      style={{
        width: 720, minHeight: 980, background: theme.bg,
        position: "relative", overflow: "hidden", borderRadius: 24,
        border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 30px 80px -50px rgba(11,61,46,0.25)",
        padding: "64px 56px 48px",
        fontFamily: '"Familjen Grotesk", system-ui, sans-serif', color: theme.ink,
        transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: "top left",
      }}
    >
      <Motif kind={motif} ink={theme.ink} muted={theme.muted} />
      <Frame kind={frame} accent={theme.accent} />

      <div style={{ position: "relative", zIndex: 1, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 860 }}>
        {t.logo_url && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: "0.18em", color: theme.muted, textTransform: "uppercase" }}>
              i samarbete med
            </span>
            <img src={t.logo_url} alt="Partner" style={{ maxHeight: 36, width: "auto", opacity: 0.9 }} />
          </div>
        )}

        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, letterSpacing: "0.42em", color: theme.muted, textTransform: "uppercase" }}>
          {t.heading_text || "VÄRDEBEVIS"}
        </div>

        <div style={{ marginTop: 28, fontFamily: '"Bricolage Grotesque", serif', fontWeight: 700, fontSize: 44, lineHeight: 1.05, color: theme.ink, maxWidth: 560 }}>
          {data.recipient_name}
        </div>

        <HighlightBlock />

        {greeting && (
          <div style={{ marginTop: 22, maxWidth: 480, fontSize: 15, fontStyle: "italic", color: theme.ink, lineHeight: 1.55, padding: "10px 16px", borderLeft: `3px solid ${theme.accent}`, textAlign: "left" }}>
            "{greeting}"
          </div>
        )}

        <div style={{ marginTop: 22, fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: theme.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {show.plats && <>{data.location_name}</>}
          {show.plats && show.datum && " · "}
          {show.datum && <>{fmtDate(data.issued_date)}</>}
          {show.co2 && <> · {co2.toLocaleString("sv-SE")} kg CO₂/år</>}
        </div>

        {show.karta && t.show_coordinates && (
          <div style={{ marginTop: 6, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: theme.muted }}>
            {Number(data.latitude).toFixed(4)}, {Number(data.longitude).toFixed(4)}
          </div>
        )}

        <img src={STAMP_URL} alt="" crossOrigin="anonymous" style={{ width: 72, height: 72, marginTop: 36, filter: "drop-shadow(0 6px 12px rgba(151,110,25,0.25))" }} />

        {t.body_text && (
          <p style={{ maxWidth: 460, margin: "28px auto 0", fontSize: 13, lineHeight: 1.65, color: theme.muted }}>
            {t.body_text}
          </p>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ marginTop: 48, paddingTop: 20, borderTop: `1px solid ${theme.muted}33`, width: "100%", textAlign: "center", fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: theme.muted, letterSpacing: "0.06em" }}>
          Verifiera: smartklimat.org/v/{data.verification_id}
        </div>
      </div>
    </div>
  );
});

export function snapshotToTemplate(snapshot: Record<string, unknown>): CertificateData["template"] {
  const cfg = (snapshot.config as TemplateConfig) ?? {};
  const partner = snapshot.partner && typeof snapshot.partner === "object"
    ? snapshot.partner as { name?: string; logo?: string }
    : null;
  return {
    template_slug: (snapshot.template_slug as string) ?? null,
    bg_url: (snapshot.bg_url as string) ?? null,
    logo_url: (snapshot.logo_url as string) ?? null,
    accent_color: (snapshot.accent_color as string) ?? "#1E9E6A",
    heading_text: (snapshot.heading_text as string) ?? "VÄRDEBEVIS",
    body_text: (snapshot.body_text as string) ?? "",
    background_key: (snapshot.background_key as string) ?? "mint",
    show_coordinates: snapshot.show_coordinates !== false,
    show_social: snapshot.show_social !== false,
    social_handles: (snapshot.social_handles as string) ?? "@smartklimat",
    config: cfg,
    allows_greeting: (snapshot.allows_greeting as boolean) ?? false,
    partner,
  };
}
