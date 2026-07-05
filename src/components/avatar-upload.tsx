import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import Cropper, { type Area } from "react-easy-crop";
import { Camera, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getAvatarState, saveUploadedPhoto, setAvatarKey } from "@/lib/avatars.functions";
import { AvatarCircle, useSignedAvatars } from "@/components/user-avatar";

interface CatalogItem { key: string; name: string; emoji: string; color: string; unlock_type: string; unlock_config: Record<string, unknown> }

export function AvatarUpload() {
  const { user } = useAuth();
  const fetchState = useServerFn(getAvatarState);
  const savePhoto = useServerFn(saveUploadedPhoto);
  const chooseAvatar = useServerFn(setAvatarKey);

  const [profile, setProfile] = useState<{ photo_path: string | null; avatar_key: string; name?: string } | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [fileSrc, setFileSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const s = await fetchState();
    setProfile(s.profile);
    setCatalog(s.catalog as CatalogItem[]);
    setUnlocked(new Set(s.unlocked));
  }, [fetchState]);

  useEffect(() => { reload(); }, [reload]);

  const urls = useSignedAvatars(profile?.photo_path && user?.id
    ? [{ user_id: user.id, avatar_key: profile.avatar_key, photo_path: profile.photo_path }]
    : []);

  const acceptFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Filen är inte en bild."); return; }
    if (f.size > 2 * 1024 * 1024) { toast.error("Max 2 MB. Välj en mindre bild."); return; }
    const url = URL.createObjectURL(f);
    setFileSrc(url); setZoom(1); setCrop({ x: 0, y: 0 });
    setPickedName(f.name);
  };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => acceptFile(e.target.files?.[0]);
  const openPicker = () => fileRef.current?.click();
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const uploadCropped = async () => {
    if (!fileSrc || !croppedArea || !user) return;
    setBusy(true);
    try {
      const blob = await renderCroppedBlob(fileSrc, croppedArea, 512);
      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage.from("avatars").upload(path, blob, {
        contentType: "image/jpeg", upsert: false,
      });
      if (up.error) throw up.error;
      await savePhoto({ data: { path } });
      toast.success("Ny profilbild sparad");
      setFileSrc(null); setPickedName(null); if (fileRef.current) fileRef.current.value = "";
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara bilden");
    } finally { setBusy(false); }
  };

  const pickAvatar = async (key: string) => {
    if (!unlocked.has(key)) return;
    await chooseAvatar({ data: { key } });
    toast.success("Avatar vald");
    await reload();
  };

  const removePhoto = async () => {
    if (!profile?.photo_path) return;
    await supabase.storage.from("avatars").remove([profile.photo_path]).catch(() => {});
    await savePhoto({ data: { path: `${user!.id}/.deleted` } }).catch(() => {});
    // Reset to avatar
    await chooseAvatar({ data: { key: profile.avatar_key } });
    // Clear via direct update through server fn: use dummy path unsupported → instead update via supabase client on profiles
    await supabase.from("profiles").update({ photo_path: null }).eq("user_id", user!.id);
    await reload();
    toast.success("Profilbild borttagen");
  };

  return (
    <div className="mt-8 surface-card p-8">
      <h2 className="font-display text-2xl font-semibold">Profilbild</h2>
      <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
        Ladda upp vad du vill — men inget olämpligt och inga bilder på andra utan lov.
      </p>

      <div
        className="mt-6 rounded-2xl border-2 border-dashed p-5 transition-colors"
        style={{
          borderColor: dragOver ? "var(--primary)" : "var(--border)",
          background: dragOver ? "var(--mint-paper)" : "transparent",
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="flex items-center gap-5 flex-wrap">
          {profile && user && (
            <button
              type="button"
              onClick={openPicker}
              aria-label="Byt profilbild"
              className="relative group rounded-full press-scale"
              style={{ width: 80, height: 80 }}
            >
              <AvatarCircle
                subject={{ user_id: user.id, avatar_key: profile.avatar_key, photo_path: profile.photo_path }}
                urls={urls}
                size={80}
              />
              <span
                className="absolute inset-0 rounded-full flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
                style={{ background: "rgba(11,61,46,0.55)" }}
              >
                <Camera size={20} />
                <span className="text-[10px] mt-0.5 font-medium">Byt bild</span>
              </span>
            </button>
          )}
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onFile}
              className="sr-only"
              aria-label="Välj profilbild"
            />
            <button
              type="button"
              onClick={openPicker}
              className="press-scale inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
              style={{
                border: "1.5px solid var(--primary)",
                color: "var(--primary)",
                background: "transparent",
              }}
            >
              <Camera size={16} />
              Ladda upp bild
            </button>
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
              <Upload size={12} />
              <span>eller släpp en bild här</span>
            </div>
            {pickedName && (
              <div className="text-xs truncate max-w-[220px]" style={{ color: "var(--muted-foreground)" }} title={pickedName}>
                {pickedName}
              </div>
            )}
            {profile?.photo_path && (
              <button className="text-xs underline text-left" onClick={removePhoto} style={{ color: "var(--destructive)" }}>Ta bort bilden</button>
            )}
          </div>
        </div>
      </div>

      {fileSrc && (
        <div className="mt-6">
          <div className="relative w-full rounded-2xl overflow-hidden" style={{ height: 320, background: "#000" }}>
            <Cropper
              image={fileSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, area) => setCroppedArea(area)}
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e)=>setZoom(parseFloat(e.target.value))} className="flex-1" />
            <button onClick={uploadCropped} disabled={busy} className="btn-primary !py-1.5 !px-4 text-sm">
              {busy ? "Sparar…" : "Spara"}
            </button>
            <button onClick={() => { setFileSrc(null); if (fileRef.current) fileRef.current.value=""; }} className="btn-secondary !py-1.5 !px-4 text-sm">Avbryt</button>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h3 className="font-display text-lg font-semibold">Eller välj en avatar</h3>
        <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Används om du inte har någon profilbild.</p>
        <div className="mt-4 grid grid-cols-4 sm:grid-cols-8 gap-3">
          {catalog.map(a => {
            const isUnlocked = unlocked.has(a.key);
            const isSelected = profile?.avatar_key === a.key;
            const req = a.unlock_type === "level" ? `Nivå ${Number((a.unlock_config as {threshold?:number}).threshold ?? 0)} träd`
              : a.unlock_type === "streak" ? `Streak ${Number((a.unlock_config as {weeks?:number}).weeks ?? 0)} v`
              : a.unlock_type === "badge" ? `Märke: ${String((a.unlock_config as {badge?:string}).badge ?? "")}`
              : "";
            return (
              <button key={a.key}
                disabled={!isUnlocked}
                onClick={() => pickAvatar(a.key)}
                className="flex flex-col items-center gap-1"
                title={isUnlocked ? a.name : req}>
                <div className="flex items-center justify-center rounded-full"
                  style={{
                    width: 56, height: 56, background: a.color, fontSize: 28,
                    opacity: isUnlocked ? 1 : 0.35,
                    boxShadow: isSelected ? "0 0 0 3px var(--forest)" : "0 0 0 2px #fff",
                  }}>
                  {a.emoji}
                </div>
                <span className="text-[10px] text-center" style={{ color: "var(--muted-foreground)" }}>
                  {isUnlocked ? a.name : req}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

async function renderCroppedBlob(src: string, area: Area, out: number): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = src; });
  const canvas = document.createElement("canvas");
  canvas.width = out; canvas.height = out;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, out, out);
  return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.9));
}
