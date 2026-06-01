import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Blobs } from "@/components/site-chrome";
import { Certificate, snapshotToTemplate, type CertificateData } from "@/components/certificate";

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
}

function VerifyPage() {
  const { id } = Route.useParams();
  const [state, setState] = useState<"loading" | "missing" | "ok">("loading");
  const [data, setData] = useState<CertificateData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: row } = await supabase
        .from("certificates")
        .select("verification_id, recipient_name, tree_count, location_name, latitude, longitude, issued_date, template_snapshot")
        .eq("verification_id", id)
        .maybeSingle();
      if (cancelled) return;
      if (!row) { setState("missing"); return; }
      const r = row as Row;
      setData({
        verification_id: r.verification_id,
        recipient_name: r.recipient_name,
        tree_count: r.tree_count,
        location_name: r.location_name,
        latitude: r.latitude,
        longitude: r.longitude,
        issued_date: r.issued_date,
        template: snapshotToTemplate(r.template_snapshot),
      });
      setState("ok");
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-block h-7 w-7 rounded-full" style={{ background: "var(--gradient-mint)", border: "1px solid var(--border)" }} />
          <span className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>SmartKlimat</span>
        </Link>
        <span className="chip">Publik verifiering</span>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-20 pt-4">
        {state === "loading" && (
          <div className="surface-card p-10 text-center" style={{ color: "var(--muted-foreground)" }}>Letar upp värdebevis…</div>
        )}
        {state === "missing" && (
          <div className="surface-card p-10 text-center">
            <h1 className="font-display text-2xl font-semibold">Värdebevis hittades inte</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
              ID <span className="font-mono">{id}</span> finns inte i vårt register.
            </p>
          </div>
        )}
        {state === "ok" && data && (
          <div className="space-y-6">
            <div className="surface-card p-6 text-center">
              <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "var(--primary)", color: "#fff" }}>✓</div>
              <h1 className="font-display text-xl font-semibold">Detta värdebevis är äkta</h1>
              <p className="mt-1 text-sm font-mono" style={{ color: "var(--muted-foreground)" }}>{data.verification_id}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Fact label="Mottagare" value={data.recipient_name} />
              <Fact label="Antal träd" value={data.tree_count.toLocaleString("sv-SE")} mono />
              <Fact label="Planteringsplats" value={data.location_name} />
              <Fact label="Datum" value={new Date(data.issued_date).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" })} />
            </div>

            <div className="overflow-x-auto flex justify-center">
              <Certificate data={data} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="surface-card p-4">
      <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className={`mt-1 text-base font-semibold ${mono ? "font-mono" : ""}`} style={{ color: "var(--forest)" }}>{value}</div>
    </div>
  );
}

void notFound;
