import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader, Blobs } from "@/components/site-chrome";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — SmartKlimat" }],
  }),
  component: AdminPage,
});

interface AdminProfile {
  user_id: string;
  name: string;
  email: string;
  created_at: string;
}

interface AdminPurchase {
  id: string;
  user_id: string;
  tree_count: number;
  total_amount_ore: number;
  status: string;
  created_at: string;
}

function formatKr(ore: number) {
  return `${(ore / 100).toLocaleString("sv-SE")} kr`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("sv-SE");
}

function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "denied" | "ok">("checking");
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [purchases, setPurchases] = useState<AdminPurchase[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    let cancelled = false;
    (async () => {
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (cancelled) return;
      if (!role) { setState("denied"); return; }
      const [p, q] = await Promise.all([
        supabase.from("profiles").select("user_id, name, email, created_at").order("created_at", { ascending: false }),
        supabase.from("purchases").select("id, user_id, tree_count, total_amount_ore, status, created_at").order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setProfiles((p.data ?? []) as AdminProfile[]);
      setPurchases((q.data ?? []) as AdminPurchase[]);
      setState("ok");
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, navigate]);

  const totalTrees = purchases.filter(p => p.status === "paid").reduce((s, p) => s + p.tree_count, 0);
  const totalAmount = purchases.filter(p => p.status === "paid").reduce((s, p) => s + p.total_amount_ore, 0);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-20 pt-4">
        <h1 className="font-display text-3xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          Översikt över alla användare och köp.
        </p>

        {state === "checking" && (
          <div className="surface-card mt-6 p-8 text-center" style={{ color: "var(--muted-foreground)" }}>Kontrollerar behörighet…</div>
        )}
        {state === "denied" && (
          <div className="surface-card mt-6 p-8 text-center">
            <h2 className="font-display text-xl">Ingen åtkomst</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Detta konto har inte administratörsrollen.
            </p>
          </div>
        )}
        {state === "ok" && (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat label="Användare" value={profiles.length.toString()} />
              <Stat label="Träd planterade" value={totalTrees.toLocaleString("sv-SE")} />
              <Stat label="Intäkt (betalda)" value={formatKr(totalAmount)} />
            </div>

            <section className="surface-card mt-8 p-6">
              <h2 className="font-display text-xl font-semibold">Användare</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                    <tr><th className="py-2">Namn</th><th>E-post</th><th>Skapad</th></tr>
                  </thead>
                  <tbody>
                    {profiles.map(p => (
                      <tr key={p.user_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="py-3">{p.name}</td>
                        <td className="font-mono text-xs">{p.email}</td>
                        <td className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{formatDate(p.created_at)}</td>
                      </tr>
                    ))}
                    {profiles.length === 0 && <tr><td colSpan={3} className="py-6 text-center" style={{ color: "var(--muted-foreground)" }}>Inga användare än.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="surface-card mt-6 p-6">
              <h2 className="font-display text-xl font-semibold">Köp</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                    <tr><th className="py-2">Datum</th><th>Användare-ID</th><th>Träd</th><th>Belopp</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {purchases.map(q => (
                      <tr key={q.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="py-3 font-mono text-xs">{formatDate(q.created_at)}</td>
                        <td className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{q.user_id.slice(0, 8)}…</td>
                        <td className="font-mono">{q.tree_count}</td>
                        <td className="font-mono">{formatKr(q.total_amount_ore)}</td>
                        <td className="font-mono text-xs">{q.status}</td>
                      </tr>
                    ))}
                    {purchases.length === 0 && <tr><td colSpan={5} className="py-6 text-center" style={{ color: "var(--muted-foreground)" }}>Inga köp än.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-6">
      <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="mt-2 font-mono text-3xl font-semibold" style={{ color: "var(--forest)" }}>{value}</div>
    </div>
  );
}
