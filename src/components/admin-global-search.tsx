import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";

interface SearchResults {
  customers: Array<{ id: string; name: string; email: string }>;
  purchases: Array<{ id: string; recipient_name: string | null; recipient_email: string | null; tree_count: number; status: string; created_at: string; customer_id: string | null; team_id: string | null }>;
  certificates: Array<{ id: string; verification_id: string; recipient_name: string; tree_count: number; issued_date: string; purchase_id: string; customer_id: string | null }>;
  teams: Array<{ id: string; name: string; join_code: string | null; city: string | null; organization_id: string | null }>;
  sellers: Array<{ user_id: string; name: string; email: string; team_id: string | null; team_name: string | null }>;
}

const EMPTY: SearchResults = { customers: [], purchases: [], certificates: [], teams: [], sellers: [] };

export function AdminGlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Cmd/Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const needle = q.trim();
    if (needle.length < 1) { setResults(EMPTY); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("admin_search", { q: needle });
      if (cancelled) return;
      setLoading(false);
      if (error) { setResults(EMPTY); return; }
      setResults((data ?? EMPTY) as SearchResults);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open]);

  const go = useCallback((to: string, search?: Record<string, string>) => {
    setOpen(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to, search: search as any });
  }, [navigate]);

  const anyHit =
    results.customers.length + results.purchases.length + results.certificates.length +
    results.teams.length + results.sellers.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full max-w-md items-center gap-2 rounded-full border px-4 py-2 text-left text-sm"
        style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}
      >
        <Search size={16} />
        <span className="flex-1">Sök kunder, köp, certifikat, lag…</span>
        <kbd className="hidden rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline" style={{ borderColor: "var(--border)" }}>⌘K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Sök namn, e-post, verifierings-ID, lagkod…"
          value={q}
          onValueChange={setQ}
        />
        <CommandList>
          {loading && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Söker…</div>}
          {!loading && q.trim() && !anyHit && <CommandEmpty>Inga träffar för "{q}".</CommandEmpty>}
          {!loading && !q.trim() && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Skriv för att söka i alla register.</div>}

          {results.customers.length > 0 && (
            <>
              <CommandGroup heading={`Kunder (${results.customers.length})`}>
                {results.customers.map(c => (
                  <CommandItem key={`c-${c.id}`} value={`cust-${c.id}-${c.name}`} onSelect={() => go("/admin", { tab: "entities", sub: "kunder", highlight: c.id })}>
                    <div className="flex flex-col">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.email}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {results.purchases.length > 0 && (
            <>
              <CommandGroup heading={`Köp (${results.purchases.length})`}>
                {results.purchases.map(p => (
                  <CommandItem key={`p-${p.id}`} value={`purch-${p.id}`} onSelect={() => go("/admin", { tab: "entities", sub: "kop", highlight: p.id })}>
                    <div className="flex flex-col">
                      <span className="font-medium">{p.recipient_name || "(utan namn)"} · {p.tree_count} träd</span>
                      <span className="text-xs text-muted-foreground">{p.recipient_email ?? p.id.slice(0, 8)} · {p.status}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {results.certificates.length > 0 && (
            <>
              <CommandGroup heading={`Certifikat (${results.certificates.length})`}>
                {results.certificates.map(c => (
                  <CommandItem key={`ct-${c.id}`} value={`cert-${c.verification_id}`} onSelect={() => go("/admin", { tab: "entities", sub: "certifikat", highlight: c.id })}>
                    <div className="flex flex-col">
                      <span className="font-medium">{c.verification_id}</span>
                      <span className="text-xs text-muted-foreground">{c.recipient_name} · {c.tree_count} träd</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {results.teams.length > 0 && (
            <>
              <CommandGroup heading={`Lag (${results.teams.length})`}>
                {results.teams.map(t => (
                  <CommandItem key={`t-${t.id}`} value={`team-${t.id}-${t.name}`} onSelect={() => go("/admin", { tab: "entities", sub: "lag", highlight: t.id })}>
                    <div className="flex flex-col">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.join_code ? `Kod: ${t.join_code}` : "Ingen kod"}{t.city ? ` · ${t.city}` : ""}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {results.sellers.length > 0 && (
            <CommandGroup heading={`Säljare (${results.sellers.length})`}>
              {results.sellers.map(s => (
                <CommandItem key={`s-${s.user_id}`} value={`sell-${s.user_id}-${s.name}`} onSelect={() => go("/admin", { tab: "entities", sub: "saljare", highlight: s.user_id })}>
                  <div className="flex flex-col">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.email}{s.team_name ? ` · ${s.team_name}` : ""}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
