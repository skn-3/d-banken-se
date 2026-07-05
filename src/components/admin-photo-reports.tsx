import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listPhotoReports, dismissPhotoReport, adminRemovePhoto, signAvatarPaths } from "@/lib/avatars.functions";

interface Report { id: string; reported_user_id: string; reported_by_user_id: string; reason: string; photo_path: string | null; status: string; created_at: string }

export function AdminPhotoReports() {
  const load = useServerFn(listPhotoReports);
  const dismiss = useServerFn(dismissPhotoReport);
  const remove = useServerFn(adminRemovePhoto);
  const sign = useServerFn(signAvatarPaths);
  const [reports, setReports] = useState<Report[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => {
    const r = await load();
    setReports(r.reports as Report[]);
    const paths = (r.reports as Report[]).map(x => x.photo_path).filter(Boolean) as string[];
    if (paths.length) {
      const s = await sign({ data: { paths } });
      setUrls(s.urls);
    } else setUrls({});
  };

  useEffect(() => { reload(); }, []);

  const onDismiss = async (id: string) => {
    setBusy(id);
    try { await dismiss({ data: { id } }); toast.success("Anmälan avfärdad"); await reload(); }
    finally { setBusy(null); }
  };
  const onRemove = async (id: string) => {
    if (!confirm("Ta bort bilden och meddela användaren?")) return;
    setBusy(id);
    try { await remove({ data: { id } }); toast.success("Bilden togs bort"); await reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Fel"); }
    finally { setBusy(null); }
  };

  return (
    <div className="surface-card p-6">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-xl font-semibold">Anmälda bilder</h3>
        <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>{reports.length} öppna</span>
      </div>
      {reports.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--muted-foreground)" }}>Inga öppna anmälningar.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {reports.map(r => (
            <li key={r.id} className="flex items-start gap-4 rounded-2xl border p-3" style={{ borderColor: "var(--border)" }}>
              {r.photo_path && urls[r.photo_path]
                ? <img src={urls[r.photo_path]} alt="Anmäld" className="w-20 h-20 rounded-xl object-cover" />
                : <div className="w-20 h-20 rounded-xl bg-neutral-200 flex items-center justify-center text-xs">ingen bild</div>}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>{new Date(r.created_at).toLocaleString("sv-SE")}</div>
                <div className="text-sm mt-1"><strong>Skäl:</strong> {r.reason}</div>
                <div className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>Användare: {r.reported_user_id}</div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button disabled={busy===r.id} onClick={() => onDismiss(r.id)} className="btn-secondary !py-1.5 !px-3 text-xs">Avfärda</button>
                <button disabled={busy===r.id} onClick={() => onRemove(r.id)} className="btn-primary !py-1.5 !px-3 text-xs" style={{ background: "var(--destructive)" }}>Ta bort bild</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
