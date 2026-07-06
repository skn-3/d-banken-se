import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CertificateA4, type CertA4Data } from "@/components/certificate-a4";
import { downloadOriginalCertPdf } from "@/lib/download-cert-original";

// QA-route: renderar A4-värdebeviset i 4 tema-varianter för synkontroll mot faciten.
// URL: /cert-preview
export const Route = createFileRoute("/cert-preview")({
  component: CertPreview,
});

const SAMPLES: Array<{ label: string; data: CertA4Data }> = [
  {
    label: "klassisk",
    data: {
      verification_id: "SK-2026-K7M3Q9",
      recipient_name: "Christer Svensson",
      tree_count: 5,
      location_name: "Luanshya, Copperbelt, Zambia",
      latitude: -13.131725,
      longitude: 28.418843,
      issued_date: "2026-07-06T00:00:00Z",
      greeting: "Grattis på födelsedagen — här är fem träd som växer så länge du finns!",
      themeSlug: null, // → klassisk
    },
  },
  {
    label: "kalaset",
    data: {
      verification_id: "SK-2026-K7M3Q9",
      recipient_name: "Christer Svensson",
      tree_count: 5,
      location_name: "Luanshya, Copperbelt, Zambia",
      latitude: -13.131725,
      longitude: 28.418843,
      issued_date: "2026-07-06T00:00:00Z",
      greeting: "Grattis på födelsedagen — här är fem träd som växer så länge du finns!",
      themeSlug: "kalaset",
    },
  },
  {
    label: "midnattsskogen",
    data: {
      verification_id: "SK-2026-K7M3Q9",
      recipient_name: "Christer Svensson",
      tree_count: 5,
      location_name: "Luanshya, Copperbelt, Zambia",
      latitude: -13.131725,
      longitude: 28.418843,
      issued_date: "2026-07-06T00:00:00Z",
      greeting: "En gåva ur nattens skog — till dig som lyser.",
      themeSlug: "midnattsskogen",
    },
  },
  {
    label: "djurfaddern",
    data: {
      verification_id: "SK-2026-K7M3Q9",
      recipient_name: "Christer Svensson",
      tree_count: 5,
      location_name: "Pontal do Paranapanema, Brasilien",
      latitude: -22.541180,
      longitude: -52.171512,
      issued_date: "2026-07-06T00:00:00Z",
      greeting: "Till Linnea — skogens modigaste fadder.",
      themeSlug: "djurfaddern",
    },
  },
];

function CertPreview() {
  const [dl, setDl] = useState(false);
  const original = {
    verification_id: "SK-2026-ORIG01",
    recipient_name: "Anna Testsson",
    tree_count: 5,
    location_name: "Luanshya, Copperbelt, Zambia",
    latitude: -13.131725,
    longitude: 28.418843,
    issued_date: new Date().toISOString(),
  };
  return (
    <div style={{ background: "#111", padding: 24, minHeight: "100vh" }}>
      <div style={{ color: "#fff", fontFamily: "system-ui", marginBottom: 16, fontSize: 14 }}>
        Cert QA. Original renderas via HTML-mall — klicka för att ladda ner PDF.
      </div>
      <div style={{ marginBottom: 16 }}>
        <button
          disabled={dl}
          onClick={async () => { setDl(true); try { await downloadOriginalCertPdf(original); } finally { setDl(false); } }}
          style={{ padding: "10px 16px", background: "#1E9E6A", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer" }}
        >{dl ? "Genererar…" : "Ladda ner Original test-PDF"}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 620px)", gap: 24 }}>
        {SAMPLES.map((s) => (
          <div key={s.label} style={{ width: 620, height: 877 + 30, position: "relative" }}>
            <div style={{ color: "#fff", fontFamily: "system-ui", fontSize: 12, marginBottom: 6 }}>{s.label}</div>
            <div style={{ width: 620, height: 877, overflow: "hidden", background: "#000" }}>
              <div style={{ transform: "scale(0.5)", transformOrigin: "top left", width: 1240, height: 1754 }}>
                <div data-cert-slug={s.label}>
                  <CertificateA4 data={s.data} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
