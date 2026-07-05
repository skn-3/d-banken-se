import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getLeaderFinance, createPayoutRequest,
} from "@/lib/payouts.functions";

function kr(ore: number) {
  return `${(ore / 100).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

export function LeaderFinancePanel() {
  const loadFn = useServerFn(getLeaderFinance);
  const requestFn = useServerFn(createPayoutRequest);

  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [amountKr, setAmountKr] = useState("");
  const [accountType, setAccountType] = useState<"bankgiro" | "plusgiro" | "swish">("bankgiro");
  const [number, setNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try { const r = await loadFn(); setState(r); }
    catch (e: any) { setMsg(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh().catch(() => {}); }, []);

  if (loading) return null;
  if (!state?.isLeader) return null;
  if ((state.orePerTree ?? 0) === 0 && (state.earnedOre ?? 0) === 0 && (state.payouts ?? []).length === 0) {
    return null;
  }

  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      const ore = Math.round(Number(amountKr.replace(",", ".")) * 100);
      if (!Number.isFinite(ore) || ore < 50000) throw new Error("Belopp måste vara minst 500 kr.");
      await requestFn({ data: { amountOre: ore, recipient: { accountType, number: number.trim(), contactName: contactName.trim() } } });
      setMsg("Förfrågan skickad.");
      setShowForm(false);
      setAmountKr(""); setNumber(""); setContactName("");
      await refresh();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  const statusLabel = (s: string) => s === "pending" ? "Väntar"
    : s === "approved" ? "Godkänd"
    : s === "paid" ? "Utbetald"
    : s === "rejected" ? "Avslagen" : s;

  return (
    <section className="surface-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Lagets ekonomi</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {state.team?.name}
          </p>
        </div>
        <button className="chip" style={{ background: "var(--mint)" }}
          disabled={state.availableOre < 50000}
          onClick={() => setShowForm((v) => !v)}>
          Begär utbetalning
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FinanceCard label="Intjänat" value={kr(state.earnedOre)} />
        <FinanceCard label="Utbetalt" value={kr(state.paidOre)} />
        <FinanceCard label="Tillgängligt" value={kr(state.availableOre)} highlight />
      </div>

      {showForm && (
        <div className="mt-4 rounded border p-4" style={{ borderColor: "var(--border)" }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">Belopp (kr)
              <input className="input-field mt-1 w-full" inputMode="decimal"
                value={amountKr} onChange={(e) => setAmountKr(e.target.value)}
                placeholder={`Max ${(state.availableOre / 100).toFixed(2)}`} />
            </label>
            <label className="text-sm">Kontotyp
              <select className="input-field mt-1 w-full" value={accountType}
                onChange={(e) => setAccountType(e.target.value as any)}>
                <option value="bankgiro">Bankgiro</option>
                <option value="plusgiro">Plusgiro</option>
                <option value="swish">Swish</option>
              </select>
            </label>
            <label className="text-sm">Nummer
              <input className="input-field mt-1 w-full" value={number} onChange={(e) => setNumber(e.target.value)} />
            </label>
            <label className="text-sm">Kontaktperson
              <input className="input-field mt-1 w-full" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="chip" style={{ background: "var(--mint)" }} disabled={busy} onClick={submit}>Skicka förfrågan</button>
            <button className="chip" disabled={busy} onClick={() => setShowForm(false)}>Avbryt</button>
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Minst 500 kr. Utbetalningar hanteras manuellt av SmartKlimat.
          </p>
        </div>
      )}

      {msg && <p className="mt-3 text-sm" style={{ color: "var(--muted-foreground)" }}>{msg}</p>}

      <div className="mt-5">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Historik</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
              <tr><th className="py-2">Datum</th><th>Belopp</th><th>Mottagare</th><th>Status</th><th>Notering</th></tr>
            </thead>
            <tbody>
              {(state.payouts ?? []).map((p: any) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 font-mono text-xs">{new Date(p.created_at).toLocaleDateString("sv-SE")}</td>
                  <td className="font-mono">{kr(p.amount_ore)}</td>
                  <td className="text-xs">{p.recipient?.accountType} · {p.recipient?.number}</td>
                  <td className="text-xs">{statusLabel(p.status)}</td>
                  <td className="text-xs" style={{ color: "var(--muted-foreground)" }}>{p.note ?? ""}</td>
                </tr>
              ))}
              {!(state.payouts ?? []).length && (
                <tr><td colSpan={5} className="py-4 text-center" style={{ color: "var(--muted-foreground)" }}>Inga utbetalningar ännu.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function FinanceCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: highlight ? "var(--mint)" : "transparent" }}>
      <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </div>
  );
}
