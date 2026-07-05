import { forwardRef } from "react";

export const CERT_TAGLINE = "Tänk smart, vi har ett gemensamt klimat";
const STAMP_URL = "/brand/logo-stamp-guld.png";

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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
}

interface Props {
  data: CertificateData;
  scale?: number;
}

export const Certificate = forwardRef<HTMLDivElement, Props>(function Certificate({ data, scale = 1 }, ref) {
  const { template: t } = data;
  const accent = t.accent_color || "#1E9E6A";
  const emerald = "#0B6E4F";

  return (
    <div
      ref={ref}
      style={{
        width: 720,
        minHeight: 980,
        background: "#F4FAF5",
        position: "relative",
        overflow: "hidden",
        borderRadius: 24,
        border: "1px solid #D9EBE0",
        boxShadow: "0 30px 80px -50px rgba(11,61,46,0.25)",
        padding: "64px 56px 48px",
        fontFamily: '"Familjen Grotesk", system-ui, sans-serif',
        color: "#0B3D2E",
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: "top left",
      }}
    >

      <div style={{ position: "relative", zIndex: 1, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 0, minHeight: 860 }}>
        {/* Partner logo (optional) */}
        {t.logo_url && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: "0.18em", color: "#7A8F84", textTransform: "uppercase" }}>
              i samarbete med
            </span>
            <img src={t.logo_url} alt="Partner" style={{ maxHeight: 36, width: "auto", opacity: 0.9 }} />
          </div>
        )}

        {/* Eyebrow */}
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 12,
          letterSpacing: "0.42em",
          color: "#4F6B5E",
          textTransform: "uppercase",
        }}>
          {t.heading_text || "VÄRDEBEVIS"}
        </div>

        {/* Recipient */}
        <div style={{
          marginTop: 28,
          fontFamily: '"Bricolage Grotesque", serif',
          fontWeight: 700,
          fontSize: 44,
          lineHeight: 1.05,
          color: "#0B3D2E",
          maxWidth: 560,
        }}>
          {data.recipient_name}
        </div>

        {/* Tree count */}
        <div style={{
          marginTop: 40,
          fontFamily: '"Bricolage Grotesque", serif',
          fontWeight: 700,
          fontSize: 148,
          lineHeight: 0.9,
          color: emerald,
          letterSpacing: "-0.03em",
        }}>
          {data.tree_count.toLocaleString("sv-SE")}
        </div>
        <div style={{
          marginTop: 10,
          fontSize: 15,
          fontWeight: 500,
          color: "#385248",
          letterSpacing: "0.02em",
        }}>
          träd planterade
        </div>

        {/* Location + date */}
        <div style={{
          marginTop: 22,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 11,
          color: "#4F6B5E",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>
          {data.location_name} · {fmtDate(data.issued_date)}
        </div>

        {/* Gold stamp */}
        <img
          src={STAMP_URL}
          alt=""
          crossOrigin="anonymous"
          style={{
            width: 72,
            height: 72,
            marginTop: 36,
            filter: "drop-shadow(0 6px 12px rgba(151,110,25,0.25))",
          }}
        />

        {/* Body text (optional accent line) */}
        {t.body_text && (
          <p style={{
            maxWidth: 460,
            margin: "28px auto 0",
            fontSize: 13,
            lineHeight: 1.65,
            color: "#4F6B5E",
          }}>
            {t.body_text}
          </p>
        )}

        <div style={{ flex: 1 }} />

        {/* Verification footer */}
        <div style={{
          marginTop: 48,
          paddingTop: 20,
          borderTop: "1px solid rgba(11,61,46,0.12)",
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10,
          color: "#7A8F84",
          letterSpacing: "0.06em",
        }}>
          <span style={{ textTransform: "uppercase" }}>SmartKlimat</span>
          <span>Verifiera: smartklimat.org/v/{data.verification_id}</span>
        </div>

        {/* Hidden accent hint so accent_color is still used for partner branding */}
        <span style={{ display: "none" }} data-accent={accent} />
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
    background_key: (snapshot.background_key as string) ?? "paper",
    show_coordinates: snapshot.show_coordinates !== false,
    show_social: snapshot.show_social !== false,
    social_handles: (snapshot.social_handles as string) ?? "@smartklimat",
  };
}
