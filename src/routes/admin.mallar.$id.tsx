import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import {
  adminGetCertTemplate,
  adminSaveCertTemplate,
  adminUploadCertAsset,
} from "@/lib/cert-templates.functions";
import {
  renderFaltkartaCertPdf,
  type FaltkartaKarta,
  type FaltkartaFalt,
} from "@/lib/download-cert-faltkarta";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const Route = createFileRoute("/admin/mallar/$id")({
  head: () => ({ meta: [{ title: "Redigera mall — Admin" }] }),
  component: EditorPage,
});

// ---------------- typer & konstanter ----------------
const FIELD_KEYS = ["namn", "antal", "plats", "koordinater", "datum", "id"] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

const SAMPLE: Record<FieldKey, string> = {
  namn: "Christer Svensson",
  antal: "5",
  plats: "Luanshya, Copperbelt, Zambia",
  koordinater: "-13.137300 · 28.416700",
  datum: "6 juli 2026",
  id: "SK-2026-K7M3Q9",
};

const FONTS = [
  "Anton", "Space Grotesk", "Jost", "Poppins",
  "Bricolage Grotesque", "Familjen Grotesk", "JetBrains Mono",
];

const PALETTE: Array<{ label: string; hex: string }> = [
  { label: "INK",   hex: "#123326" },
  { label: "EM",    hex: "#B04638" },
  { label: "GULD",  hex: "#F6E7C1" },
  { label: "Vit",   hex: "#FFFFFF" },
  { label: "Svart", hex: "#000000" },
];

const DEFAULT_FALT = (): FaltkartaFalt => ({
  x: 620, y: 800, size: 32, color: "#123326", font: "Bricolage Grotesque",
  anchor: "middle", weight: "bold", letterSpacing: 0, italic: false, template: "{v}",
});

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/å|ä/g, "a").replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

async function fileToBase64(f: File): Promise<{ b64: string; type: string; w: number; h: number }> {
  const buf = await f.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => rej(new Error("Kan ej läsa bild"));
    img.src = URL.createObjectURL(f);
  });
  return { b64, type: f.type || "image/jpeg", w: dims.w, h: dims.h };
}

// ---------------- component ----------------
function EditorPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const getFn = useServerFn(adminGetCertTemplate);
  const saveFn = useServerFn(adminSaveCertTemplate);
  const uploadFn = useServerFn(adminUploadCertAsset);

  const [state, setState] = useState<"checking" | "denied" | "ok" | "notfound">("checking");
  const [namn, setNamn] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [allowsGreeting, setAllowsGreeting] = useState(false);
  const [bgUrl, setBgUrl] = useState("");
  const [kortUrl, setKortUrl] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<{ w: number; h: number }>({ w: 1240, h: 1754 });
  const [falt, setFalt] = useState<Record<string, FaltkartaFalt>>({});
  const [initial, setInitial] = useState<string>("");
  const [selected, setSelected] = useState<FieldKey | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [snapX, setSnapX] = useState<number | null>(null);

  const currentJson = useMemo(() => JSON.stringify({
    namn, slug, allowsGreeting, bgUrl, kortUrl, canvas, falt,
  }), [namn, slug, allowsGreeting, bgUrl, kortUrl, canvas, falt]);
  const dirty = initial !== "" && initial !== currentJson;

  // ladda mall
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    let cancelled = false;
    (async () => {
      const { data: role } = await supabase.from("user_roles").select("role")
        .eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (cancelled) return;
      if (!role) { setState("denied"); return; }
      try {
        const r = await getFn({ data: { id } });
        if (cancelled) return;
        const t = r.template;
        setNamn(t.namn); setSlug(t.slug); setSlugTouched(true);
        setAllowsGreeting(!!t.allows_greeting);
        setBgUrl(t.bg_url); setKortUrl(t.kort_url);
        setCanvas(t.canvas ?? { w: 1240, h: 1754 });
        setFalt((t.falt ?? {}) as Record<string, FaltkartaFalt>);
        setInitial(JSON.stringify({
          namn: t.namn, slug: t.slug, allowsGreeting: !!t.allows_greeting,
          bgUrl: t.bg_url, kortUrl: t.kort_url,
          canvas: t.canvas ?? { w: 1240, h: 1754 }, falt: t.falt ?? {},
        }));
        setState("ok");
      } catch { setState("notfound"); }
    })();
    return () => { cancelled = true; };
  }, [id, user, authLoading, navigate, getFn]);

  // varna vid navigation med osparat
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // slug auto ur namn tills användaren rör
  const onNamnChange = (v: string) => {
    setNamn(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  // ---------- canvas render (max 700px bred, A4-ratio bibehålls via bilden) ----------
  const displayW = 700;
  const displayH = Math.round(displayW * (canvas.h / canvas.w));
  const s = displayW / canvas.w;
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: FieldKey; dx: number; dy: number } | null>(null);

  const onChipDown = (key: FieldKey, e: React.PointerEvent) => {
    e.preventDefault();
    setSelected(key);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = { key, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onChipMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d || !stageRef.current) return;
    const box = stageRef.current.getBoundingClientRect();
    const chipEl = e.currentTarget as HTMLElement;
    const chipW = chipEl.offsetWidth;
    const chipH = chipEl.offsetHeight;
    let px = e.clientX - box.left - d.dx;
    let py = e.clientY - box.top - d.dy;
    // vi placerar chip så att dess vänsterkant ligger på f-koord vs anchor
    // för enkelhet: sätt f.x baserat på anchor mot chippens vänsterkant + halva/hela bredd
    const key = d.key;
    const f = falt[key] ?? DEFAULT_FALT();
    // beräkna anchor-punkt inom chippet
    const anchorOffset = f.anchor === "middle" ? chipW / 2 : f.anchor === "end" ? chipW : 0;
    let anchorPxX = px + anchorOffset;
    const anchorPxY = py + chipH * 0.75; // baseline ≈ 75% ned
    // konvertera till 1240-space
    let nx = anchorPxX / s;
    let ny = anchorPxY / s;
    // snap
    const snaps = [620, 90, 1150];
    let hit: number | null = null;
    for (const sv of snaps) {
      if (Math.abs(nx - sv) * s < 8) { nx = sv; hit = sv; break; }
    }
    setSnapX(hit);
    nx = Math.max(0, Math.min(canvas.w, Math.round(nx)));
    ny = Math.max(0, Math.min(canvas.h, Math.round(ny)));
    setFalt((prev) => ({ ...prev, [key]: { ...(prev[key] ?? DEFAULT_FALT()), x: nx, y: ny } }));
  };
  const onChipUp = (e: React.PointerEvent) => {
    dragRef.current = null; setSnapX(null);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const toggleField = (key: FieldKey) => {
    setFalt((prev) => {
      const next = { ...prev };
      if (next[key]) { delete next[key]; }
      else { next[key] = DEFAULT_FALT(); }
      return next;
    });
    setSelected(key);
  };
  const updateField = (key: FieldKey, patch: Partial<FaltkartaFalt>) => {
    setFalt((prev) => ({ ...prev, [key]: { ...(prev[key] ?? DEFAULT_FALT()), ...patch } }));
  };

  // ---------- uppladdningar ----------
  const uploadBg = async (file: File) => {
    setBusy("bg"); setMsg(null);
    try {
      const { b64, type, w, h } = await fileToBase64(file);
      const ratio = w / h;
      const a4 = 1240 / 1754;
      if (Math.abs(ratio - a4) / a4 > 0.02) setMsg(`Varning: bakgrund avviker från A4-ratio (${w}×${h}). Rekommendation: 2480×3508.`);
      else if (w < 1240) setMsg(`Varning: bakgrund ${w}×${h} är under 1240 px bred. Rekommendation: 2480×3508.`);
      const r = await uploadFn({ data: { kind: "bg", filename: file.name, contentType: type, dataBase64: b64 } });
      setBgUrl(r.url);
    } catch (e: any) { setMsg(`Bakgrundsfel: ${e?.message ?? e}`); }
    finally { setBusy(null); }
  };
  const uploadKort = async (file: File) => {
    setBusy("kort"); setMsg(null);
    try {
      const { b64, type, w, h } = await fileToBase64(file);
      if (w !== 1080 || h !== 1350) setMsg(`Notis: kort ${w}×${h}. Rekommendation: 1080×1350.`);
      const r = await uploadFn({ data: { kind: "kort", filename: file.name, contentType: type, dataBase64: b64 } });
      setKortUrl(r.url);
    } catch (e: any) { setMsg(`Kortfel: ${e?.message ?? e}`); }
    finally { setBusy(null); }
  };

  // ---------- save & test-pdf ----------
  const save = async () => {
    setBusy("save"); setMsg(null);
    try {
      await saveFn({ data: {
        id, namn, slug, allows_greeting: allowsGreeting,
        bg_url: bgUrl, kort_url: kortUrl, canvas, falt: falt as any,
      } });
      setInitial(currentJson);
      setMsg("Sparat.");
    } catch (e: any) { setMsg(`Fel: ${e?.message ?? e}`); }
    finally { setBusy(null); }
  };

  const testPdf = async () => {
    setBusy("pdf"); setMsg(null);
    try {
      const karta: FaltkartaKarta = { bg: bgUrl, canvas, falt };
      await renderFaltkartaCertPdf(karta, {
        verification_id: "SK-2026-K7M3Q9",
        recipient_name: "Christer Svensson",
        tree_count: 5,
        location_name: "Luanshya, Copperbelt, Zambia",
        latitude: -13.1373, longitude: 28.4167,
        issued_date: "2026-07-06",
      }, `test-${slug || "utkast"}.pdf`);
    } catch (e: any) { setMsg(`PDF-fel: ${e?.message ?? e}`); }
    finally { setBusy(null); }
  };

  const cancel = useCallback(() => {
    if (dirty && !confirm("Osparade ändringar. Lämna ändå?")) return;
    navigate({ to: "/admin/mallar" });
  }, [dirty, navigate]);

  if (state === "checking") return <Shell><div className="surface-card p-8 text-center">Laddar…</div></Shell>;
  if (state === "denied") return <Shell><div className="surface-card p-8 text-center">Ingen åtkomst.</div></Shell>;
  if (state === "notfound") return <Shell><div className="surface-card p-8 text-center">Hittades inte.</div></Shell>;

  const selF = selected ? falt[selected] : null;

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Redigera mall</h1>
          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {dirty ? "• Osparade ändringar" : "Alla ändringar sparade"}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={testPdf} disabled={busy !== null || !bgUrl}
            className="text-sm px-3 py-2 rounded border" style={{ borderColor: "var(--border)" }}>
            {busy === "pdf" ? "Renderar…" : "Ladda ner test-PDF"}
          </button>
          <button onClick={cancel} disabled={busy !== null}
            className="text-sm px-3 py-2 rounded border" style={{ borderColor: "var(--border)" }}>Avbryt</button>
          <button onClick={save} disabled={busy !== null || !dirty}
            className="text-sm px-3 py-2 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            {busy === "save" ? "Sparar…" : "Spara"}
          </button>
        </div>
      </div>

      {msg && <div className="mb-3 text-sm p-2 rounded" style={{ background: "rgba(255,200,80,0.15)" }}>{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[720px_1fr] gap-6">
        {/* CANVAS */}
        <div className="surface-card p-3">
          <div
            ref={stageRef}
            className="relative mx-auto select-none"
            style={{
              width: displayW, height: displayH,
              backgroundImage: bgUrl ? `url("${bgUrl}")` : "linear-gradient(#eee,#ddd)",
              backgroundSize: "cover", backgroundPosition: "center",
              borderRadius: 6, overflow: "hidden",
            }}
          >
            {/* snap-linjer */}
            {snapX !== null && (
              <div style={{
                position: "absolute", top: 0, bottom: 0, left: snapX * s,
                width: 1, background: "rgba(255,60,60,0.7)", pointerEvents: "none",
              }} />
            )}
            {/* marginaler & mitt (svaga) */}
            {[90, 620, 1150].map((v) => (
              <div key={v} style={{
                position: "absolute", top: 0, bottom: 0, left: v * s, width: 1,
                background: "rgba(0,0,0,0.06)", pointerEvents: "none",
              }} />
            ))}
            {/* chips */}
            {FIELD_KEYS.map((k) => {
              const f = falt[k]; if (!f) return null;
              const sample = SAMPLE[k];
              const text = f.template ? f.template.replace("{v}", sample) : sample;
              const fontSizePx = f.size * s;
              const anchorOffset = f.anchor === "middle" ? "-50%" : f.anchor === "end" ? "-100%" : "0";
              const isSel = selected === k;
              return (
                <div
                  key={k}
                  onPointerDown={(e) => onChipDown(k, e)}
                  onPointerMove={onChipMove}
                  onPointerUp={onChipUp}
                  onPointerCancel={onChipUp}
                  style={{
                    position: "absolute",
                    left: f.x * s, top: f.y * s,
                    transform: `translate(${anchorOffset}, -75%)`,
                    fontFamily: `"${f.font}", sans-serif`,
                    fontSize: fontSizePx,
                    fontWeight: f.weight === "bold" ? 700 : (/^\d+$/.test(f.weight) ? Number(f.weight) : 400),
                    fontStyle: f.italic ? "italic" : "normal",
                    color: f.color,
                    letterSpacing: (f.letterSpacing || 0) * s,
                    whiteSpace: "nowrap",
                    cursor: "grab", touchAction: "none",
                    padding: "1px 3px",
                    outline: isSel ? "1.5px dashed rgba(0,120,255,0.9)" : "1px dashed rgba(0,0,0,0.25)",
                    background: isSel ? "rgba(0,120,255,0.06)" : "rgba(255,255,255,0.02)",
                    borderRadius: 3,
                  }}
                  title={`${k}  (${f.x}, ${f.y})`}
                >
                  {text}
                </div>
              );
            })}
          </div>

          {/* fältväxlare + assets */}
          <div className="mt-3 flex flex-wrap gap-2">
            {FIELD_KEYS.map((k) => (
              <button key={k} onClick={() => toggleField(k)}
                className="text-xs px-2 py-1 rounded border"
                style={{
                  borderColor: "var(--border)",
                  background: falt[k] ? "rgba(30,158,106,0.12)" : "transparent",
                }}>
                {falt[k] ? "✓ " : "+ "}{k}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <label className="border rounded p-2 cursor-pointer" style={{ borderColor: "var(--border)" }}>
              <div className="font-semibold mb-1">Bakgrund</div>
              <div style={{ color: "var(--muted-foreground)" }} className="truncate">{bgUrl || "(ingen)"}</div>
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadBg(f); }} />
              <div className="mt-1 text-[11px] underline">Byt bild</div>
            </label>
            <label className="border rounded p-2 cursor-pointer" style={{ borderColor: "var(--border)" }}>
              <div className="font-semibold mb-1">Kort (1080×1350)</div>
              <div style={{ color: "var(--muted-foreground)" }} className="truncate">{kortUrl || "(ingen)"}</div>
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadKort(f); }} />
              <div className="mt-1 text-[11px] underline">Byt bild</div>
            </label>
          </div>
        </div>

        {/* SIDOPANEL */}
        <div className="space-y-4">
          <div className="surface-card p-4 space-y-3">
            <h3 className="font-semibold">Metadata</h3>
            <label className="block text-xs">
              <div className="mb-1">Namn</div>
              <input value={namn} onChange={(e) => onNamnChange(e.target.value)}
                className="w-full border rounded px-2 py-1" style={{ borderColor: "var(--border)" }} />
            </label>
            <label className="block text-xs">
              <div className="mb-1">Slug</div>
              <input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
                className="w-full border rounded px-2 py-1 font-mono" style={{ borderColor: "var(--border)" }} />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={allowsGreeting}
                onChange={(e) => setAllowsGreeting(e.target.checked)} />
              Tillåter hälsningstext (allows_greeting)
            </label>
          </div>

          <div className="surface-card p-4">
            <h3 className="font-semibold mb-2">Fält</h3>
            {!selF && <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Klicka på ett chip på canvasen för att redigera. Använd knapparna nedanför canvasen för att lägga till/ta bort fält.
            </div>}
            {selected && selF && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-mono">{selected}</div>
                  <div className="font-mono" style={{ color: "var(--muted-foreground)" }}>
                    x={selF.x} · y={selF.y}
                  </div>
                </div>
                <label className="block">
                  <div className="mb-1">Storlek: {selF.size}px</div>
                  <input type="range" min={10} max={120} value={selF.size} className="w-full"
                    onChange={(e) => updateField(selected, { size: Number(e.target.value) })} />
                </label>
                <label className="block">
                  <div className="mb-1">Färg</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="color" value={selF.color}
                      onChange={(e) => updateField(selected, { color: e.target.value })} />
                    <input value={selF.color}
                      onChange={(e) => updateField(selected, { color: e.target.value })}
                      className="border rounded px-1 py-0.5 font-mono w-24" style={{ borderColor: "var(--border)" }} />
                    {PALETTE.map((p) => (
                      <button key={p.label} onClick={() => updateField(selected, { color: p.hex })}
                        className="px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", background: p.hex, color: p.hex === "#FFFFFF" ? "#000" : "#fff" }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="block">
                  <div className="mb-1">Font</div>
                  <select value={selF.font} onChange={(e) => updateField(selected, { font: e.target.value })}
                    className="w-full border rounded px-2 py-1" style={{ borderColor: "var(--border)" }}>
                    {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <div className="mb-1">Anchor</div>
                    <select value={selF.anchor} onChange={(e) => updateField(selected, { anchor: e.target.value as any })}
                      className="w-full border rounded px-2 py-1" style={{ borderColor: "var(--border)" }}>
                      <option value="start">Vänster</option>
                      <option value="middle">Mitt</option>
                      <option value="end">Höger</option>
                    </select>
                  </label>
                  <label className="block">
                    <div className="mb-1">Weight</div>
                    <select value={selF.weight} onChange={(e) => updateField(selected, { weight: e.target.value })}
                      className="w-full border rounded px-2 py-1" style={{ borderColor: "var(--border)" }}>
                      {["300", "400", "500", "600", "bold", "800", "900"].map((w) => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <div className="mb-1">Letter-spacing: {selF.letterSpacing}</div>
                  <input type="range" min={-2} max={20} step={0.5} value={selF.letterSpacing} className="w-full"
                    onChange={(e) => updateField(selected, { letterSpacing: Number(e.target.value) })} />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={selF.italic}
                    onChange={(e) => updateField(selected, { italic: e.target.checked })} />
                  Italic
                </label>
                <label className="block">
                  <div className="mb-1">Mall (använd <span className="font-mono">{"{v}"}</span> för värdet)</div>
                  <input value={selF.template}
                    onChange={(e) => updateField(selected, { template: e.target.value })}
                    className="w-full border rounded px-2 py-1 font-mono" style={{ borderColor: "var(--border)" }} />
                </label>
                <button onClick={() => toggleField(selected)}
                  className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)", color: "#c33" }}>
                  Ta bort fält
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Blobs />
      <SiteHeader />
      <main className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-20 pt-4">
        {children}
      </main>
    </div>
  );
}
