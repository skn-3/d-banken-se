import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { Certificate, snapshotToTemplate, type CertificateData } from "@/components/certificate";
import { downloadCertificateAsPdf } from "@/lib/download-certificate";
import { PushToggle } from "@/components/push-toggle";
import { AvatarUpload } from "@/components/avatar-upload";
import { BadgeWall } from "@/components/badge-wall";
import { TreeBankHero } from "@/components/tree-bank-hero";

export const Route = createFileRoute("/konto")({
  head: () => ({
    meta: [
      { title: "Min trädbank — SmartKlimat" },
      { name: "description", content: "Översikt över träd, planteringar och värdebevis kopplade till din e-post." },
    ],
  }),
  component: KontoPage,
});

interface Purchase { id: string; tree_count: number; total_amount_ore: number; status: string; created_at: string }
interface Customer { id: string; name: string; email: string }
interface CertRow {
  id: string;
  verification_id: string;
  recipient_name: string;
  tree_count: number;
  location_name: string;
  latitude: number | string;
  longitude: number | string;
  issued_date: string;
  template_snapshot: Record<string, unknown>;
}

function rowToData(row: CertRow): CertificateData {
  return {
    verification_id: row.verification_id,
    recipient_name: row.recipient_name,
    tree_count: row.tree_count,
    location_name: row.location_name,
    latitude: row.latitude,
    longitude: row.longitude,
    issued_date: row.issued_date,
    template: snapshotToTemplate(row.template_snapshot),
  };
}

function formatKr(ore: number) { return `${(ore / 100).toLocaleString("sv-SE")} kr`; }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function KontoPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<CertRow | null>(null);
  const certRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !user.email) { navigate({ to: "/auth" }); return; }
    const email = user.email.toLowerCase();
    let cancelled = false;
    (async () => {
      // Lookup customer by email
      const { data: cust } = await supabase
        .from("customers")
        .select("id, name, email")
        .eq("email", email)
        .maybeSingle();

      const { data: r } = await supabase
        .from("user_roles")
        .select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();

      let p: Purchase[] = [];
      let c: CertRow[] = [];
      if (cust) {
        const [pr, cr] = await Promise.all([
          supabase.from("purchases")
            .select("id, tree_count, total_amount_ore, status, created_at")
            .eq("customer_id", cust.id)
            .order("created_at", { ascending: false }),
          supabase.from("certificates")
            .select("id, verification_id, recipient_name, tree_count, location_name, latitude, longitude, issued_date, template_snapshot")
            .eq("customer_id", cust.id)
            .order("issued_date", { ascending: false }),
        ]);
        p = (pr.data ?? []) as Purchase[];
        c = (cr.data ?? []) as CertRow[];
      }

      if (cancelled) return;
      setCustomer(cust as Customer | null);
      setPurchases(p);
      setCerts(c);
      setIsAdmin(!!r);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, navigate]);

  const balance = purchases.filter(p => p.status === "paid").reduce((sum, p) => sum + p.tree_count, 0);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />

      <main className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-20 pt-4">
        {loading ? (
          <div className="surface-card p-10 text-center" style={{ color: "var(--muted-foreground)" }}>Laddar din trädbank…</div>
        ) : (
          <>
            <div className="surface-card overflow-hidden p-10 text-center" style={{ background: "var(--gradient-mint)" }}>
              <div className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                Trädbank för {user?.email}
              </div>
              <div className="mt-4 font-mono text-7xl font-semibold leading-none" style={{ color: "var(--forest)" }}>
                {balance.toLocaleString("sv-SE")}
              </div>
              <div className="mt-3 text-base" style={{ color: "var(--forest)" }}>
                träd planterade {customer?.name ? `i ${customer.name}s namn` : ""}
              </div>
              {!customer && (
                <p className="mt-4 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Vi hittade inga planteringar för den här e-posten ännu.
                  <br />
                  <button onClick={() => navigate({ to: "/kop" })} className="mt-3 btn-primary">Plantera ett träd</button>
                </p>
              )}
            </div>

            <div className="mt-8 surface-card p-8">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-2xl font-semibold">Värdebevis</h2>
                <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>{certs.length} st</span>
              </div>
              {certs.length === 0 ? (
                <p className="mt-6 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Inga värdebevis än för {user?.email}.
                </p>
              ) : (
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {certs.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setViewing(c)}
                      className="text-left rounded-2xl border p-4 hover:bg-[color:var(--mint-paper)] transition"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{c.verification_id}</div>
                      <div className="mt-2 font-display text-xl font-semibold" style={{ color: "var(--forest)" }}>
                        {c.tree_count} träd
                      </div>
                      <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {c.location_name} · {formatDate(c.issued_date)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 surface-card p-8">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-2xl font-semibold">Planteringshistorik</h2>
                <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                  {purchases.length} {purchases.length === 1 ? "post" : "poster"}
                </span>
              </div>
              {purchases.length === 0 ? (
                <p className="mt-6 text-sm" style={{ color: "var(--muted-foreground)" }}>Inga planteringar än.</p>
              ) : (
                <div className="mt-6 divide-y" style={{ borderColor: "var(--border)" }}>
                  {purchases.map((p) => (
                    <div key={p.id} className="grid grid-cols-12 items-center gap-3 py-4">
                      <div className="col-span-5 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{formatDate(p.created_at)}</div>
                      <div className="col-span-3 font-mono text-base font-semibold" style={{ color: "var(--forest)" }}>{p.tree_count} träd</div>
                      <div className="col-span-2 text-right font-mono text-sm">{formatKr(p.total_amount_ore)}</div>
                      <div className="col-span-2 text-right">
                        <StatusPill status={p.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <AvatarUpload />
            <BadgeWall />
            <PushToggle />

            {isAdmin && (
              <div className="mt-6 text-center">
                <button onClick={() => navigate({ to: "/admin" })} className="btn-secondary">Öppna admin</button>
              </div>
            )}
          </>
        )}
      </main>

      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6"
          style={{ background: "rgba(11,61,46,0.55)" }}
          onClick={() => setViewing(null)}
        >
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-3">
              <Link to="/v/$id" params={{ id: viewing.verification_id }} className="btn-secondary !py-1.5 !px-3 text-sm">Öppna publik sida</Link>
              <div className="flex gap-2">
                <button
                  className="btn-primary !py-1.5 !px-3 text-sm"
                  onClick={() => certRef.current && downloadCertificateAsPdf(certRef.current, viewing.verification_id)}
                >Ladda ner PDF</button>
                <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={() => setViewing(null)}>Stäng</button>
              </div>
            </div>
            <div className="flex justify-center">
              <Certificate ref={certRef} data={rowToData(viewing)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    paid: { label: "Betald", bg: "var(--mint)", color: "var(--forest)" },
    pending: { label: "Väntar", bg: "var(--apricot)", color: "#7A3B00" },
    failed: { label: "Misslyckad", bg: "rgba(179,38,30,0.12)", color: "var(--destructive)" },
  };
  const s = map[status] ?? { label: status, bg: "var(--mint-paper)", color: "var(--forest)" };
  return (
    <span className="inline-block rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}
