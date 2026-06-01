import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader, Blobs } from "@/components/site-chrome";

export const Route = createFileRoute("/konto")({
  head: () => ({
    meta: [
      { title: "Min trädbank — SmartKlimat" },
      { name: "description", content: "Översikt över dina planterade träd och köp." },
    ],
  }),
  component: KontoPage,
});

interface Purchase {
  id: string;
  tree_count: number;
  total_amount_ore: number;
  status: string;
  created_at: string;
}

interface Profile {
  name: string;
  email: string;
}

function formatKr(ore: number) {
  return `${(ore / 100).toLocaleString("sv-SE")} kr`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function KontoPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    let cancelled = false;
    (async () => {
      const [p, pr, r] = await Promise.all([
        supabase.from("purchases").select("id, tree_count, total_amount_ore, status, created_at").order("created_at", { ascending: false }),
        supabase.from("profiles").select("name, email").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      ]);
      if (cancelled) return;
      setPurchases((p.data ?? []) as Purchase[]);
      setProfile(pr.data as Profile | null);
      setIsAdmin(!!r.data);
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
                Din trädbank
              </div>
              <div className="mt-4 font-mono text-7xl font-semibold leading-none" style={{ color: "var(--forest)" }}>
                {balance.toLocaleString("sv-SE")}
              </div>
              <div className="mt-3 text-base" style={{ color: "var(--forest)" }}>
                träd planterade {profile?.name ? `av ${profile.name}` : ""}
              </div>
            </div>

            <div className="mt-8 surface-card p-8">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-2xl font-semibold">Köphistorik</h2>
                <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                  {purchases.length} {purchases.length === 1 ? "post" : "poster"}
                </span>
              </div>

              {purchases.length === 0 ? (
                <p className="mt-6 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Inga köp än. <button onClick={() => navigate({ to: "/kop" })} className="underline" style={{ color: "var(--primary)" }}>Plantera dina första träd</button>.
                </p>
              ) : (
                <div className="mt-6 divide-y" style={{ borderColor: "var(--border)" }}>
                  {purchases.map((p) => (
                    <div key={p.id} className="grid grid-cols-12 items-center gap-3 py-4">
                      <div className="col-span-5 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {formatDate(p.created_at)}
                      </div>
                      <div className="col-span-3 font-mono text-base font-semibold" style={{ color: "var(--forest)" }}>
                        {p.tree_count} träd
                      </div>
                      <div className="col-span-2 text-right font-mono text-sm">
                        {formatKr(p.total_amount_ore)}
                      </div>
                      <div className="col-span-2 text-right">
                        <StatusPill status={p.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="mt-6 text-center">
                <button onClick={() => navigate({ to: "/admin" })} className="btn-secondary">Öppna admin</button>
              </div>
            )}
          </>
        )}
      </main>
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
