import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import {
  adminListCertTemplates,
  adminSetCertTemplateActive,
  adminMoveCertTemplate,
  adminDuplicateCertTemplate,
  adminDeleteCertTemplate,
  type CertTemplateRow,
} from "@/lib/cert-templates.functions";

export const Route = createFileRoute("/admin/mallar")({
  head: () => ({ meta: [{ title: "Cert-mallar — Admin" }] }),
  component: AdminMallarPage,
});

function AdminMallarPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "denied" | "ok">("checking");
  const [rows, setRows] = useState<CertTemplateRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const listFn = useServerFn(adminListCertTemplates);
  const toggleFn = useServerFn(adminSetCertTemplateActive);
  const moveFn = useServerFn(adminMoveCertTemplate);
  const dupFn = useServerFn(adminDuplicateCertTemplate);
  const delFn = useServerFn(adminDeleteCertTemplate);

  const load = useCallback(async () => {
    const r = await listFn();
    setRows(r.templates);
  }, [listFn]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    let cancelled = false;
    (async () => {
      const { data: role } = await supabase
        .from("user_roles").select("role")
        .eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (cancelled) return;
      if (!role) { setState("denied"); return; }
      await load();
      if (!cancelled) setState("ok");
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, navigate, load]);

  const toggle = async (row: CertTemplateRow) => {
    setBusy(row.id);
    try { await toggleFn({ data: { id: row.id, aktiv: !row.aktiv } }); await load(); }
    finally { setBusy(null); }
  };
  const move = async (row: CertTemplateRow, direction: "up" | "down") => {
    setBusy(row.id);
    try { await moveFn({ data: { id: row.id, direction } }); await load(); }
    finally { setBusy(null); }
  };
  const duplicate = async (row: CertTemplateRow) => {
    setBusy(row.id);
    try { await dupFn({ data: { id: row.id } }); await load(); }
    finally { setBusy(null); }
  };
  const remove = async (row: CertTemplateRow) => {
    if (!confirm(`Radera "${row.namn}"? Kan inte ångras.`)) return;
    setBusy(row.id);
    try { await delFn({ data: { id: row.id } }); await load(); }
    finally { setBusy(null); }
  };

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20 pt-4">
        <h1 className="font-display text-3xl font-semibold">Cert-mallar</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          Hantera alla certifikatmallar. Toggla aktiv, ändra ordning, duplicera eller redigera.
        </p>

        {state === "checking" && (
          <div className="surface-card mt-6 p-8 text-center" style={{ color: "var(--muted-foreground)" }}>
            Kontrollerar behörighet…
          </div>
        )}
        {state === "denied" && (
          <div className="surface-card mt-6 p-8 text-center">
            <h2 className="font-display text-xl">Ingen åtkomst</h2>
          </div>
        )}
        {state === "ok" && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {rows.map((r, idx) => (
              <div key={r.id} className="surface-card p-3 flex flex-col gap-2">
                <div
                  className="rounded-lg overflow-hidden aspect-[3/4] bg-black/10"
                  style={{
                    backgroundImage: r.kort_url ? `url("${r.kort_url}")` : undefined,
                    backgroundSize: "cover", backgroundPosition: "center",
                  }}
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{r.namn}</div>
                    <div className="text-[10px] font-mono" style={{ color: "var(--muted-foreground)" }}>
                      {r.slug} · sort {r.sort}
                    </div>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      background: r.aktiv ? "rgba(30,158,106,0.15)" : "rgba(180,180,180,0.2)",
                      color: r.aktiv ? "#1E9E6A" : "#666",
                    }}
                  >{r.aktiv ? "Aktiv" : "Inaktiv"}</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <button disabled={busy === r.id} onClick={() => toggle(r)}
                    className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)" }}>
                    {r.aktiv ? "Inaktivera" : "Aktivera"}
                  </button>
                  <button disabled={busy === r.id || idx === 0} onClick={() => move(r, "up")}
                    className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)" }}>↑</button>
                  <button disabled={busy === r.id || idx === rows.length - 1} onClick={() => move(r, "down")}
                    className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)" }}>↓</button>
                  <button disabled={busy === r.id} onClick={() => duplicate(r)}
                    className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)" }}>Duplicera</button>
                  <a href={`/admin/mallar/${r.id}`}
                    className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)" }}>Redigera</a>
                  <button disabled={busy === r.id} onClick={() => remove(r)}
                    className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)", color: "#c33" }}>Radera</button>

                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
