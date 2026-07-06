import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Certificate, snapshotToTemplate, type CertificateData } from "@/components/certificate";
import { CertificateA4, type CertA4Data } from "@/components/certificate-a4";
import { downloadA4CertificateAsPdf } from "@/lib/download-cert-a4";


export const Route = createFileRoute("/v/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Värdebevis ${params.id} — SmartKlimat` },
      { name: "description", content: "Verifiera ett SmartKlimat-värdebevis." },
    ],
  }),
  component: VerifyPage,
});

interface Row {
  verification_id: string;
  recipient_name: string;
  tree_count: number;
  location_name: string;
  latitude: number | string;
  longitude: number | string;
  issued_date: string;
  template_snapshot: Record<string, unknown>;
  greeting: string | null;
  theme_slug: string | null;
}


const PAPER_BG = "#EAF7EE";


function VerifyPage() {
  const { id } = Route.useParams();
  const [state, setState] = useState<"loading" | "missing" | "ok">("loading");
  const [data, setData] = useState<CertificateData | null>(null);
  const [a4, setA4] = useState<CertA4Data | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const a4Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: rows, error } = await supabase
        .rpc("get_public_certificate", { _verification_id: id });
      if (cancelled) return;
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (error || !row) { setState("missing"); return; }
      const r = row as Row;
      setData({
        verification_id: r.verification_id,
        recipient_name: r.recipient_name,
        tree_count: r.tree_count,
        location_name: r.location_name,
        latitude: r.latitude,
        longitude: r.longitude,
        issued_date: r.issued_date,
        greeting: r.greeting,
        template: snapshotToTemplate(r.template_snapshot),
      });
      setA4({
        verification_id: r.verification_id,
        recipient_name: r.recipient_name,
        tree_count: r.tree_count,
        location_name: r.location_name,
        latitude: r.latitude,
        longitude: r.longitude,
        issued_date: r.issued_date,
        greeting: r.greeting,
        themeSlug: r.theme_slug,
      });
      setState("ok");
    })();
    return () => { cancelled = true; };
  }, [id]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  async function handleDownload() {
    if (!a4Ref.current) return;
    setDownloading(true);
    try {
      // Ge bilderna (bakgrund + QR + stämpel) en tick att renderas.
      await new Promise((r) => setTimeout(r, 300));
      await downloadA4CertificateAsPdf(a4Ref.current, id);
    } finally {
      setDownloading(false);
    }
  }


  return (
    <div className="min-h-screen w-full" style={{ background: PAPER_BG }}>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-block h-7 w-7 rounded-full" style={{ background: "linear-gradient(135deg,#9FD9B6,#1E9E6A)" }} />
          <span className="font-display text-lg font-semibold" style={{ color: "#0B3D2E" }}>SmartKlimat</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 pb-24 pt-4">
        {state === "loading" && (
          <div className="mx-auto max-w-md rounded-2xl border border-black/5 bg-white/60 p-10 text-center text-sm" style={{ color: "#4F6B5E" }}>
            Letar upp värdebevis…
          </div>
        )}

        {state === "missing" && (
          <div className="mx-auto max-w-md rounded-2xl border border-black/5 bg-white p-10 text-center shadow-sm">
            <h1 className="font-display text-2xl font-semibold" style={{ color: "#0B3D2E" }}>Beviset kunde inte hittas</h1>
            <p className="mt-2 text-sm" style={{ color: "#4F6B5E" }}>
              ID <span className="font-mono">{id}</span> finns inte i vårt register. Kontrollera länken eller besök vår startsida.
            </p>
            <a
              href="https://smartklimat.org"
              className="mt-6 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white"
              style={{ background: "#1E9E6A" }}
            >
              Till smartklimat.org
            </a>
          </div>
        )}

        {state === "ok" && data && (
          <div className="mx-auto flex flex-col items-center" style={{ maxWidth: 420 }}>
            {/* Verified pill */}
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold" style={{ background: "#E8F5EE", borderColor: "rgba(30,158,106,0.35)", color: "#0B6E4F" }}>
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white" style={{ background: "#1E9E6A" }}>✓</span>
              Verifierat äkta · SmartKlimat
            </div>

            {/* Certificate — scaled to fit ~420 (base 720) */}
            <div style={{ width: 420, height: (420 / 720) * 980 + 4 }}>
              <div style={{ transform: `scale(${420 / 720})`, transformOrigin: "top left" }}>
                <Certificate data={data} />
              </div>
            </div>

            {/* Meta + copy */}
            <div className="mt-5 flex w-full items-center justify-between text-xs" style={{ color: "#4F6B5E" }}>
              <span>Utfärdat {new Date(data.issued_date).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" })}</span>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white"
                style={{ borderColor: "rgba(11,61,46,0.18)", color: "#0B3D2E", background: "rgba(255,255,255,0.6)" }}
              >
                {copied ? "Kopierad ✓" : "Kopiera länk"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
