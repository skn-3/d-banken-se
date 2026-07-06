import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { adminUpdatePurchaseCorrection, adminReissueCertificate, adminAdjustPoints } from "@/lib/admin.functions";

// ---- Purchase correction --------------------------------------------------

export function PurchaseCorrectButton({ purchaseId, currentStatus, currentNote, onDone }: {
  purchaseId: string; currentStatus: string; currentNote: string | null; onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(currentStatus);
  const [note, setNote] = useState(currentNote ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const call = useServerFn(adminUpdatePurchaseCorrection);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await call({ data: {
        purchaseId,
        status: status as "pending" | "paid" | "failed" | "refunded" | "cancelled",
        adminNote: note.trim(),
        reason: reason.trim(),
      } });
      setOpen(false);
      onDone?.();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button className="btn-secondary !py-1 !px-2 text-xs" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>Korrigera status</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Korrigera köp</DialogTitle>
            <DialogDescription>Belopp och rad ändras inte. Endast status och admin-anteckning uppdateras. Alla ändringar loggas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Ny status</span>
              <select className="input-field !py-1.5 !text-sm w-full" value={status} onChange={e => setStatus(e.target.value)}>
                {["pending", "paid", "failed", "refunded", "cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Admin-anteckning</span>
              <textarea className="input-field w-full text-sm" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Valfri anteckning på köpet" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Motivering (obligatorisk, loggas)</span>
              <textarea className="input-field w-full text-sm" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="T.ex. Återbetald via Stripe #ch_xxx" />
            </label>
            {err && <div className="text-sm" style={{ color: "var(--destructive)" }}>{err}</div>}
          </div>
          <DialogFooter>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Avbryt</button>
            <button className="btn-primary" disabled={busy || reason.trim().length < 3} onClick={submit}>{busy ? "Sparar…" : "Spara"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- Certificate reissue --------------------------------------------------

export function CertReissueButton({ certificateId, currentName, currentGreeting, verificationId, onDone }: {
  certificateId: string; currentName: string; currentGreeting: string | null; verificationId: string; onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [greeting, setGreeting] = useState(currentGreeting ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const call = useServerFn(adminReissueCertificate);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await call({ data: {
        certificateId,
        recipientName: name.trim(),
        greeting: greeting.trim() ? greeting.trim() : null,
        reason: reason.trim(),
      } });
      setOpen(false);
      onDone?.();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button className="btn-secondary !py-1 !px-2 text-xs" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>Om-utfärda</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Om-utfärda certifikat</DialogTitle>
            <DialogDescription>Skapar en ny rad. Verifikat-ID <code>{verificationId}</code> pekar om till den nya raden. Den gamla raden bevaras (superseded).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Mottagarens namn</span>
              <input className="input-field w-full text-sm" value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Hälsning</span>
              <textarea className="input-field w-full text-sm" rows={2} value={greeting} onChange={e => setGreeting(e.target.value)} />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Motivering (obligatorisk, loggas)</span>
              <textarea className="input-field w-full text-sm" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="T.ex. Felstavat namn korrigerat efter kundmejl" />
            </label>
            {err && <div className="text-sm" style={{ color: "var(--destructive)" }}>{err}</div>}
          </div>
          <DialogFooter>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Avbryt</button>
            <button className="btn-primary" disabled={busy || reason.trim().length < 3 || name.trim().length === 0} onClick={submit}>{busy ? "Skapar…" : "Om-utfärda"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- Points adjustment ----------------------------------------------------

export function PointsAdjustButton({ sellerUserId, sellerName, onDone }: {
  sellerUserId: string; sellerName: string; onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState<string>("0");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const call = useServerFn(adminAdjustPoints);

  const n = Number(delta);
  const valid = Number.isFinite(n) && Number.isInteger(n) && n !== 0 && reason.trim().length >= 3;

  const submit = async () => {
    if (!valid) return;
    setBusy(true); setErr(null);
    try {
      await call({ data: { sellerUserId, delta: n, reason: reason.trim() } });
      setOpen(false);
      onDone?.();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button className="btn-secondary !py-1 !px-2 text-xs" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>Justera poäng</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Justera poäng — {sellerName}</DialogTitle>
            <DialogDescription>Skapar en ny transaktion (typ <code>adjustment</code>). Befintliga rader ändras aldrig.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Delta (kan vara negativt)</span>
              <input type="number" step={1} className="input-field w-full text-sm" value={delta} onChange={e => setDelta(e.target.value)} />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Motivering (obligatorisk, loggas)</span>
              <textarea className="input-field w-full text-sm" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="T.ex. Kompensation för dubbelbokförd försäljning" />
            </label>
            {err && <div className="text-sm" style={{ color: "var(--destructive)" }}>{err}</div>}
          </div>
          <DialogFooter>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Avbryt</button>
            <button className="btn-primary" disabled={busy || !valid} onClick={submit}>{busy ? "Sparar…" : "Bokför justering"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
