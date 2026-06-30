import { forwardRef } from "react";
import logoBlack from "@/assets/logos/smartklimat-logo-black.png.asset.json";

export const CERT_TAGLINE = "Tänk smart, vi har ett gemensamt klimat";


export interface CertificateData {
  verification_id: string;
  recipient_name: string;
  tree_count: number;
  location_name: string;
  latitude: number | string;
  longitude: number | string;
  issued_date: string; // ISO
  template: {
    logo_url?: string | null;
    accent_color: string;
    heading_text: string;
    body_text: string;
    background_key: string;
    show_coordinates: boolean;
    show_social: boolean;
    social_handles: string;
  };
}

export const BACKGROUND_OPTIONS: { key: string; label: string; css: string }[] = [
  { key: "mint", label: "Mint", css: "linear-gradient(155deg, #EAF7EE 0%, #C7EAD4 70%, #9FD9B6 100%)" },
  { key: "apricot", label: "Apricot", css: "linear-gradient(155deg, #FFF6EA 0%, #FBE3C0 60%, #F6B27A 100%)" },
  { key: "sage", label: "Salva", css: "linear-gradient(155deg, #F4FAF5 0%, #C7EAD4 50%, #9FD9B6 100%)" },
  { key: "paper", label: "Papper", css: "linear-gradient(155deg, #F8FBF6 0%, #EFE9DC 100%)" },
];

function bgCss(key: string) {
  return BACKGROUND_OPTIONS.find((b) => b.key === key)?.css ?? BACKGROUND_OPTIONS[0].css;
}

function fmtCoord(lat: number | string, lng: number | string) {
  const n = (v: number | string) => Number(v).toFixed(4);
  return `${n(lat)}°, ${n(lng)}°`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
}

interface Props {
  data: CertificateData;
  scale?: number; // visual scale for preview (1 = full)
}

export const Certificate = forwardRef<HTMLDivElement, Props>(function Certificate({ data, scale = 1 }, ref) {
  const { template: t } = data;
  const accent = t.accent_color || "#1E9E6A";

  return (
    <div
      ref={ref}
      style={{
        width: 720,
        minHeight: 1000,
        background: bgCss(t.background_key),
        position: "relative",
        overflow: "hidden",
        borderRadius: 24,
        boxShadow: "0 30px 80px -40px rgba(11,61,46,0.35), 0 1px 0 rgba(255,255,255,0.6) inset",
        padding: "64px 56px",
        fontFamily: '"Familjen Grotesk", system-ui, sans-serif',
        color: "#0B3D2E",
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: "top left",
      }}
    >
      {/* Organic blobs */}
      <div aria-hidden style={{
        position: "absolute", top: -120, left: -100, width: 360, height: 360,
        background: "#9FD9B6", filter: "blur(50px)", opacity: 0.55,
        borderRadius: "60% 40% 55% 45% / 50% 60% 40% 50%",
      }} />
      <div aria-hidden style={{
        position: "absolute", bottom: -140, right: -120, width: 380, height: 380,
        background: "linear-gradient(135deg,#FBE3C0,#F6B27A)", filter: "blur(60px)", opacity: 0.45,
        borderRadius: "45% 55% 60% 40% / 55% 45% 60% 40%",
      }} />
      <div aria-hidden style={{
        position: "absolute", top: "40%", right: -80, width: 220, height: 220,
        background: "#C7EAD4", filter: "blur(40px)", opacity: 0.45,
        borderRadius: "55% 45% 40% 60% / 45% 55% 50% 50%",
      }} />

      <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
        {/* Logo — custom template logo if provided, otherwise SmartKlimat black */}
        {t.logo_url ? (
          <div style={{
            width: 72, height: 72, margin: "0 auto",
            borderRadius: "50%",
            background: `center/cover no-repeat url(${t.logo_url})`,
            border: `2px solid ${accent}`,
            boxShadow: "0 8px 24px -8px rgba(11,61,46,0.25)",
          }} />
        ) : (
          <img
            src={logoBlack.url}
            alt="SmartKlimat"
            style={{ height: 44, width: "auto", margin: "0 auto", display: "block" }}
          />
        )}


        {/* Heading */}
        <h1 style={{
          marginTop: 28,
          fontFamily: '"Bricolage Grotesque", sans-serif',
          fontWeight: 700,
          fontSize: 44,
          letterSpacing: "0.18em",
          lineHeight: 1,
          color: "#0B3D2E",
        }}>{t.heading_text}</h1>

        <p style={{
          marginTop: 14, fontSize: 16, fontWeight: 500, color: accent,
          letterSpacing: "0.04em",
        }}>
          har planterat <span style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>{data.tree_count.toLocaleString("sv-SE")}</span> {data.tree_count === 1 ? "träd" : "träd"}
        </p>

        {/* Coordinates */}
        {t.show_coordinates && (
          <div style={{
            marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
            color: "#4F6B5E",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
            </svg>
            <span>{data.location_name} · {fmtCoord(data.latitude, data.longitude)}</span>
          </div>
        )}

        {/* Recipient name */}
        <div style={{
          marginTop: 36,
          fontFamily: '"Bricolage Grotesque", sans-serif',
          fontWeight: 600, fontSize: 38, lineHeight: 1.1,
          color: "#0B3D2E",
        }}>{data.recipient_name}</div>

        {/* Divider */}
        <div style={{
          margin: "32px auto", width: 80, height: 1,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        }} />

        {/* Body */}
        <p style={{
          maxWidth: 480, margin: "0 auto", fontSize: 14, lineHeight: 1.65,
          color: "#385248",
        }}>
          {t.body_text}
        </p>

        {/* Verification pill */}
        <div style={{
          marginTop: 40, display: "inline-flex", alignItems: "center", gap: 8,
          padding: "8px 16px", borderRadius: 999,
          background: "rgba(255,255,255,0.7)",
          border: `1px solid ${accent}33`,
          fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
          color: "#0B3D2E",
        }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 18, height: 18, borderRadius: "50%", background: accent, color: "#fff",
            fontSize: 11,
          }}>✓</span>
          <span style={{ fontWeight: 600 }}>{data.verification_id}</span>
          <span style={{ opacity: 0.55 }}>· smartklimat.org/v</span>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 48, display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: "#4F6B5E",
        }}>
          <span>{fmtDate(data.issued_date)}</span>
          <span style={{ fontFamily: '"Bricolage Grotesque", sans-serif', fontSize: 14, fontWeight: 600, color: "#0B3D2E" }}>
            SmartKlimat
          </span>
        </div>

        {t.show_social && t.social_handles && (
          <div style={{
            marginTop: 18, fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
            color: "#7A8F84", letterSpacing: "0.08em",
          }}>
            {t.social_handles}
          </div>
        )}
      </div>
    </div>
  );
});

export function snapshotToTemplate(snapshot: Record<string, unknown>): CertificateData["template"] {
  return {
    logo_url: (snapshot.logo_url as string) ?? null,
    accent_color: (snapshot.accent_color as string) ?? "#1E9E6A",
    heading_text: (snapshot.heading_text as string) ?? "VÄRDEBEVIS",
    body_text: (snapshot.body_text as string) ?? "",
    background_key: (snapshot.background_key as string) ?? "mint",
    show_coordinates: snapshot.show_coordinates !== false,
    show_social: snapshot.show_social !== false,
    social_handles: (snapshot.social_handles as string) ?? "@smartklimat",
  };
}
