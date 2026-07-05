import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPushState, getVapidPublicKey, subscribePush, unsubscribePush } from "@/lib/push.functions";
import { enablePush, disablePush } from "@/lib/push-client";

export function PushToggle() {
  const fetchState = useServerFn(getPushState);
  const fetchKey = useServerFn(getVapidPublicKey);
  const subFn = useServerFn(subscribePush);
  const unsubFn = useServerFn(unsubscribePush);
  const [enabled, setEnabled] = useState(false);
  const [isMinor, setIsMinor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSupported("serviceWorker" in navigator && "PushManager" in window);
    }
    fetchState().then((s) => { setEnabled(s.enabled); setIsMinor(s.isMinor); }).catch(() => {});
  }, [fetchState]);

  const onToggle = async () => {
    setBusy(true); setMsg(null);
    try {
      if (!enabled) {
        const { publicKey } = await fetchKey();
        if (!publicKey) throw new Error("Push är inte konfigurerat än.");
        const sub = await enablePush(publicKey);
        if (!sub) { setMsg("Notiser tilläts inte."); setBusy(false); return; }
        await subFn({ data: sub });
        setEnabled(true);
      } else {
        const ep = await disablePush();
        await unsubFn({ data: { endpoint: ep ?? undefined } });
        setEnabled(false);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Något gick fel");
    } finally { setBusy(false); }
  };

  if (!supported) return null;

  return (
    <div className="mt-8 surface-card p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">Notiser</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Få en puff när något kul händer — aldrig mer än några i veckan.
          </p>
          {isMinor && (
            <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
              Vårdnadshavare informeras när notiser aktiveras.
            </p>
          )}
          {msg && <p className="mt-2 text-xs" style={{ color: "var(--destructive)" }}>{msg}</p>}
        </div>
        <button
          onClick={onToggle}
          disabled={busy}
          aria-pressed={enabled}
          className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition"
          style={{ background: enabled ? "var(--forest)" : "var(--border)" }}
        >
          <span
            className="inline-block h-5 w-5 transform rounded-full bg-white transition"
            style={{ transform: enabled ? "translateX(24px)" : "translateX(4px)" }}
          />
        </button>
      </div>
    </div>
  );
}
