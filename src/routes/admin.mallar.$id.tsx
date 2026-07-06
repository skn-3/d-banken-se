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
import { studioGenerateSvg } from "@/lib/studio.functions";

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

const DEFAULT_FIELD = (): FaltkartaFalt => ({
  type: "field", x: 620, y: 800, size: 32, color: "#123326", font: "Bricolage Grotesque",
  anchor: "middle", weight: "bold", letterSpacing: 0, italic: false, template: "{v}",
});
const DEFAULT_STATIC = (): FaltkartaFalt => ({
  type: "static", x: 620, y: 400, size: 28, color: "#123326", font: "Bricolage Grotesque",
  anchor: "middle", weight: "500", letterSpacing: 0, italic: false, text: "Din text här",
});
const DEFAULT_LOGO = (url: string): FaltkartaFalt => ({
  type: "logo", x: 90, y: 90, url, width: 240,
});

const isFieldKey = (k: string): k is FieldKey => (FIELD_KEYS as readonly string[]).includes(k);
const elType = (f: FaltkartaFalt | undefined, key: string): "field" | "static" | "logo" => {
  if (!f) return "field";
  if (f.type === "static" || f.type === "logo") return f.type;
  return "field";
};

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/å|ä/g, "a").replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
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
  const genSvgFn = useServerFn(studioGenerateSvg);

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
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [snapX, setSnapX] = useState<number | null>(null);

  // Studio AI
  const [aiBrief, setAiBrief] = useState("");
  const [aiJust, setAiJust] = useState("");
  type AiVer = { url: string; svg: string; label: string };
  const [aiHistory, setAiHistory] = useState<AiVer[]>([]);
  const [aiCurrentSvg, setAiCurrentSvg] = useState<string | null>(null);

  const currentJson = useMemo(() => JSON.stringify({
    namn, slug, allowsGreeting, bgUrl, kortUrl, canvas, falt,
  }), [namn, slug, allowsGreeting, bgUrl, kortUrl, canvas, falt]);
  const dirty = initial !== "" && initial !== currentJson;

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

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const onNamnChange = (v: string) => {
    setNamn(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const displayW = 700;
  const displayH = Math.round(displayW * (canvas.h / canvas.w));
  const s = displayW / canvas.w;
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: string; dx: number; dy: number; kind: "text" | "logo" } | null>(null);

  const onChipDown = (key: string, kind: "text" | "logo", e: React.PointerEvent) => {
    e.preventDefault();
    setSelected(key);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = { key, dx: e.clientX - rect.left, dy: e.clientY - rect.top, kind };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onChipMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d || !stageRef.current) return;
    const box = stageRef.current.getBoundingClientRect();
    const chipEl = e.currentTarget as HTMLElement;
    const chipW = chipEl.offsetWidth;
    const chipH = chipEl.offsetHeight;
    const px = e.clientX - box.left - d.dx;
    const py = e.clientY - box.top - d.dy;
    const key = d.key;
    const f = falt[key];
    if (!f) return;

    let nx: number, ny: number;
    if (d.kind === "logo") {
      // Logo x/y = top-left in canvas
      nx = px / s;
      ny = py / s;
    } else {
      const anchor = f.anchor ?? "start";
      const anchorOffset = anchor === "middle" ? chipW / 2 : anchor === "end" ? chipW : 0;
      const anchorPxX = px + anchorOffset;
      const anchorPxY = py + chipH * 0.75;
      nx = anchorPxX / s;
      ny = anchorPxY / s;
    }

    // snap x only for text
    let hit: number | null = null;
    if (d.kind === "text") {
      const snaps = [620, 90, 1150];
      for (const sv of snaps) {
        if (Math.abs(nx - sv) * s < 8) { nx = sv; hit = sv; break; }
      }
    }
    setSnapX(hit);
    nx = Math.max(0, Math.min(canvas.w, Math.round(nx)));
    ny = Math.max(0, Math.min(canvas.h, Math.round(ny)));
    setFalt((prev) => ({ ...prev, [key]: { ...prev[key], x: nx, y: ny } }));
  };
  const onChipUp = (e: React.PointerEvent) => {
    dragRef.current = null; setSnapX(null);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const toggleField = (key: FieldKey) => {
    setFalt((prev) => {
      const next = { ...prev };
      if (next[key]) { delete next[key]; }
      else { next[key] = DEFAULT_FIELD(); }
      return next;
    });
    setSelected(key);
  };
  const addStatic = () => {
    const key = `static:${shortId()}`;
    setFalt((prev) => ({ ...prev, [key]: DEFAULT_STATIC() }));
    setSelected(key);
  };
  const addLogo = async (file: File) => {
    setBusy("logo"); setMsg(null);
    try {
      const { b64, type } = await fileToBase64(file);
      const r = await uploadFn({ data: { kind: "logo", filename: file.name, contentType: type, dataBase64: b64 } });
      const key = `logo:${shortId()}`;
      setFalt((prev) => ({ ...prev, [key]: DEFAULT_LOGO(r.url) }));
      setSelected(key);
    } catch (e: any) { setMsg(`Loggafel: ${e?.message ?? e}`); }
    finally { setBusy(null); }
  };
  const removeEl = (key: string) => {
    setFalt((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setSelected(null);
  };
  const updateEl = (key: string, patch: Partial<FaltkartaFalt>) => {
    setFalt((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

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


  // ---- AI-genererad SVG-bakgrund ----
  const pushAi = (ver: AiVer) => {
    setAiHistory((prev) => {
      const next = [ver, ...prev].slice(0, 5);
      return next;
    });
  };
  const generateBg = async () => {
    if (!aiBrief.trim()) { setMsg("Skriv en brief först."); return; }
    setBusy("ai"); setMsg(null);
    try {
      const r = await genSvgFn({ data: { brief: aiBrief, slug: slug || "ai" } });
      setBgUrl(r.url);
      setAiCurrentSvg(r.svg);
      pushAi({ url: r.url, svg: r.svg, label: aiBrief.slice(0, 60) });
    } catch (e: any) { setMsg(`AI-fel: ${e?.message ?? e}`); }
    finally { setBusy(null); }
  };
  const adjustBg = async () => {
    if (!aiCurrentSvg) { setMsg("Generera först en bakgrund."); return; }
    if (!aiJust.trim()) { setMsg("Beskriv justeringen."); return; }
    setBusy("ai"); setMsg(null);
    try {
      const r = await genSvgFn({ data: {
        brief: aiBrief || "justering", nuvarande_svg: aiCurrentSvg, justering: aiJust, slug: slug || "ai",
      } });
      setBgUrl(r.url);
      setAiCurrentSvg(r.svg);
      pushAi({ url: r.url, svg: r.svg, label: `↻ ${aiJust.slice(0, 60)}` });
      setAiJust("");
    } catch (e: any) { setMsg(`AI-fel: ${e?.message ?? e}`); }
    finally { setBusy(null); }
  };
  const restoreAi = (v: AiVer) => { setBgUrl(v.url); setAiCurrentSvg(v.svg); };

  // ---- Auto-generera kort (1080×1350) om saknas ----
  const generateKortFromBg = async (): Promise<string | null> => {
    if (!bgUrl) return null;
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("bg load"));
        i.src = bgUrl;
      });
      const KW = 1080, KH = 1350;
      const cv = document.createElement("canvas");
      cv.width = KW; cv.height = KH;
      const ctx = cv.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      // Beskär övre 4:5 av canvasens virtuella yta
      const cropW = canvas.w;
      const cropH = Math.round(canvas.w * (KH / KW)); // 1240 * 1.25 = 1550
      // Rita bakgrund (SVG rasteriseras crisp vid drawImage-skalning)
      ctx.drawImage(img, 0, 0, canvas.w, cropH, 0, 0, KW, KH);
      // Rita statiska texter som ligger i övre kropp-området
      const sX = KW / cropW;
      const sY = KH / cropH;
      for (const f of Object.values(falt)) {
        if (f.type !== "static" || !f.text) continue;
        if (f.y > cropH) continue;
        ctx.save();
        const style = f.italic ? "italic " : "";
        const w = /^\d+$/.test(f.weight ?? "400") ? (f.weight ?? "400") : (f.weight === "bold" ? "700" : "400");
        ctx.font = `${style}${w} ${(f.size ?? 32) * sX}px "${f.font ?? "Bricolage Grotesque"}"`;
        ctx.fillStyle = f.color ?? "#123326";
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = (f.anchor ?? "start") === "middle" ? "center" : (f.anchor === "end" ? "right" : "left");
        ctx.fillText(f.text, f.x * sX, f.y * sY);
        ctx.restore();
      }
      const b64 = cv.toDataURL("image/jpeg", 0.9).split(",")[1];
      const r = await uploadFn({ data: { kind: "kort", filename: `${slug || "ai"}-auto.jpg`, contentType: "image/jpeg", dataBase64: b64 } });
      return r.url;
    } catch (e) {
      console.warn("Auto-kort misslyckades", e);
      return null;
    }
  };

  const save = async () => {
    setBusy("save"); setMsg(null);
    try {
      let kort = kortUrl;
      if (!kort && bgUrl) {
        kort = await generateKortFromBg();
        if (kort) setKortUrl(kort);
      }
      await saveFn({ data: {
        id, namn, slug, allows_greeting: allowsGreeting,
        bg_url: bgUrl, kort_url: kort, canvas, falt: falt as any,
      } });
      setInitial(JSON.stringify({
        namn, slug, allowsGreeting, bgUrl, kortUrl: kort, canvas, falt,
      }));
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
  const selType = selected ? elType(selF ?? undefined, selected) : null;

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
            {snapX !== null && (
              <div style={{
                position: "absolute", top: 0, bottom: 0, left: snapX * s,
                width: 1, background: "rgba(255,60,60,0.7)", pointerEvents: "none",
              }} />
            )}
            {[90, 620, 1150].map((v) => (
              <div key={v} style={{
                position: "absolute", top: 0, bottom: 0, left: v * s, width: 1,
                background: "rgba(0,0,0,0.06)", pointerEvents: "none",
              }} />
            ))}
            {/* chips */}
            {Object.entries(falt).map(([k, f]) => {
              const t = elType(f, k);
              const isSel = selected === k;
              if (t === "logo") {
                const w = (f.width ?? 200) * s;
                return (
                  <div
                    key={k}
                    onPointerDown={(e) => onChipDown(k, "logo", e)}
                    onPointerMove={onChipMove}
                    onPointerUp={onChipUp}
                    onPointerCancel={onChipUp}
                    style={{
                      position: "absolute",
                      left: f.x * s, top: f.y * s, width: w,
                      cursor: "grab", touchAction: "none",
                      outline: isSel ? "1.5px dashed rgba(0,120,255,0.9)" : "1px dashed rgba(0,0,0,0.35)",
                      background: "rgba(255,255,255,0.02)",
                    }}
                    title={`${k}  (${f.x}, ${f.y})  w=${f.width ?? 200}`}
                  >
                    {f.url ? (
                      // eslint-disable-next-line jsx-a11y/alt-text
                      <img src={f.url} draggable={false}
                        style={{ display: "block", width: "100%", height: "auto", pointerEvents: "none" }} />
                    ) : null}
                  </div>
                );
              }
              // text (field or static)
              const raw = t === "static" ? (f.text ?? "") : (isFieldKey(k) ? SAMPLE[k] : "");
              const text = t === "field"
                ? (f.template ? f.template.replace("{v}", raw) : raw)
                : raw;
              const fontSizePx = (f.size ?? 32) * s;
              const anchor = f.anchor ?? "start";
              const anchorOffset = anchor === "middle" ? "-50%" : anchor === "end" ? "-100%" : "0";
              const weight = f.weight ?? "400";
              return (
                <div
                  key={k}
                  onPointerDown={(e) => onChipDown(k, "text", e)}
                  onPointerMove={onChipMove}
                  onPointerUp={onChipUp}
                  onPointerCancel={onChipUp}
                  style={{
                    position: "absolute",
                    left: f.x * s, top: f.y * s,
                    transform: `translate(${anchorOffset}, -75%)`,
                    fontFamily: `"${f.font ?? "Bricolage Grotesque"}", sans-serif`,
                    fontSize: fontSizePx,
                    fontWeight: weight === "bold" ? 700 : (/^\d+$/.test(weight) ? Number(weight) : 400),
                    fontStyle: f.italic ? "italic" : "normal",
                    color: f.color ?? "#123326",
                    letterSpacing: (f.letterSpacing || 0) * s,
                    whiteSpace: "nowrap",
                    cursor: "grab", touchAction: "none",
                    padding: "1px 3px",
                    outline: isSel
                      ? "1.5px dashed rgba(0,120,255,0.9)"
                      : (t === "static" ? "1px dashed rgba(180,80,0,0.4)" : "1px dashed rgba(0,0,0,0.25)"),
                    background: isSel ? "rgba(0,120,255,0.06)" : "rgba(255,255,255,0.02)",
                    borderRadius: 3,
                  }}
                  title={`${k}  (${f.x}, ${f.y})`}
                >
                  {text || <span style={{ opacity: 0.5 }}>(tom)</span>}
                </div>
              );
            })}
          </div>

          {/* fältväxlare + lägg till + assets */}
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
            <button onClick={addStatic}
              className="text-xs px-2 py-1 rounded border"
              style={{ borderColor: "var(--border)", background: "rgba(180,80,0,0.08)" }}>
              + statisk text
            </button>
            <label className="text-xs px-2 py-1 rounded border cursor-pointer"
              style={{ borderColor: "var(--border)", background: "rgba(0,120,255,0.08)" }}>
              {busy === "logo" ? "Laddar…" : "+ logga"}
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void addLogo(f); }} />
            </label>
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
            <h3 className="font-semibold mb-2">Element</h3>
            {!selF && <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Klicka på ett element på canvasen för att redigera. Använd knapparna nedanför canvasen för att lägga till fält, statisk text eller en logga.
            </div>}
            {selected && selF && selType === "logo" && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-mono">logga</div>
                  <div className="font-mono" style={{ color: "var(--muted-foreground)" }}>
                    x={selF.x} · y={selF.y}
                  </div>
                </div>
                <label className="block">
                  <div className="mb-1">Bredd: {selF.width ?? 200}px (canvas-px)</div>
                  <input type="range" min={40} max={800} value={selF.width ?? 200} className="w-full"
                    onChange={(e) => updateEl(selected, { width: Number(e.target.value) })} />
                </label>
                <div className="truncate" style={{ color: "var(--muted-foreground)" }}>
                  {selF.url}
                </div>
                <button onClick={() => removeEl(selected)}
                  className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)", color: "#c33" }}>
                  Ta bort logga
                </button>
              </div>
            )}
            {selected && selF && (selType === "field" || selType === "static") && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-mono">{selType === "static" ? "statisk text" : selected}</div>
                  <div className="font-mono" style={{ color: "var(--muted-foreground)" }}>
                    x={selF.x} · y={selF.y}
                  </div>
                </div>
                {selType === "static" && (
                  <label className="block">
                    <div className="mb-1">Text</div>
                    <textarea value={selF.text ?? ""} rows={2}
                      onChange={(e) => updateEl(selected, { text: e.target.value })}
                      className="w-full border rounded px-2 py-1" style={{ borderColor: "var(--border)" }} />
                  </label>
                )}
                <label className="block">
                  <div className="mb-1">Storlek: {selF.size ?? 32}px</div>
                  <input type="range" min={10} max={160} value={selF.size ?? 32} className="w-full"
                    onChange={(e) => updateEl(selected, { size: Number(e.target.value) })} />
                </label>
                <label className="block">
                  <div className="mb-1">Färg</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="color" value={selF.color ?? "#123326"}
                      onChange={(e) => updateEl(selected, { color: e.target.value })} />
                    <input value={selF.color ?? "#123326"}
                      onChange={(e) => updateEl(selected, { color: e.target.value })}
                      className="border rounded px-1 py-0.5 font-mono w-24" style={{ borderColor: "var(--border)" }} />
                    {PALETTE.map((p) => (
                      <button key={p.label} onClick={() => updateEl(selected, { color: p.hex })}
                        className="px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", background: p.hex, color: p.hex === "#FFFFFF" ? "#000" : "#fff" }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="block">
                  <div className="mb-1">Font</div>
                  <select value={selF.font ?? "Bricolage Grotesque"} onChange={(e) => updateEl(selected, { font: e.target.value })}
                    className="w-full border rounded px-2 py-1" style={{ borderColor: "var(--border)" }}>
                    {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <div className="mb-1">Anchor</div>
                    <select value={selF.anchor ?? "start"} onChange={(e) => updateEl(selected, { anchor: e.target.value as any })}
                      className="w-full border rounded px-2 py-1" style={{ borderColor: "var(--border)" }}>
                      <option value="start">Vänster</option>
                      <option value="middle">Mitt</option>
                      <option value="end">Höger</option>
                    </select>
                  </label>
                  <label className="block">
                    <div className="mb-1">Weight</div>
                    <select value={selF.weight ?? "400"} onChange={(e) => updateEl(selected, { weight: e.target.value })}
                      className="w-full border rounded px-2 py-1" style={{ borderColor: "var(--border)" }}>
                      {["300", "400", "500", "600", "bold", "800", "900"].map((w) => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <div className="mb-1">Letter-spacing: {selF.letterSpacing ?? 0}</div>
                  <input type="range" min={-2} max={20} step={0.5} value={selF.letterSpacing ?? 0} className="w-full"
                    onChange={(e) => updateEl(selected, { letterSpacing: Number(e.target.value) })} />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!selF.italic}
                    onChange={(e) => updateEl(selected, { italic: e.target.checked })} />
                  Italic
                </label>
                {selType === "field" && (
                  <label className="block">
                    <div className="mb-1">Mall (använd <span className="font-mono">{"{v}"}</span> för värdet)</div>
                    <input value={selF.template ?? "{v}"}
                      onChange={(e) => updateEl(selected, { template: e.target.value })}
                      className="w-full border rounded px-2 py-1 font-mono" style={{ borderColor: "var(--border)" }} />
                  </label>
                )}
                <button
                  onClick={() => selType === "field" && isFieldKey(selected) ? toggleField(selected) : removeEl(selected)}
                  className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)", color: "#c33" }}>
                  Ta bort element
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
