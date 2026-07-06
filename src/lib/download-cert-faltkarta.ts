// Generisk fältkarte-renderare för tema-certifikat.
// Läser /certs/faltkartor-teman.json en gång, ritar bg + varje fält
// på en 1240×1754-canvas, exporterar som A4-PDF.
import jsPDF from "jspdf";

const KARTOR_URL = "/certs/faltkartor-teman.json";

interface Falt {
  x: number; y: number;
  // FIELD (default) / STATIC
  size?: number; color?: string; font?: string;
  anchor?: "start" | "middle" | "end";
  weight?: string; letterSpacing?: number; italic?: boolean;
  template?: string;
  // Discriminator: undefined/"field" = dynamic field, "static" = fast text, "logo" = bild
  type?: "field" | "static" | "logo";
  text?: string;   // static
  url?: string;    // logo
  width?: number;  // logo (canvas-px)
}
interface Karta {
  bg: string;
  canvas: { w: number; h: number };
  falt: Record<string, Falt>;
}
type Faltkartor = Record<string, Karta>;

export interface FaltkartaData {
  verification_id: string;
  recipient_name: string;
  tree_count: number;
  location_name: string;   // "Ort, Region, Land"
  latitude: number | string;
  longitude: number | string;
  issued_date: string;     // ISO
}

let cache: Promise<Faltkartor> | null = null;
async function loadKartorFallback(): Promise<Faltkartor> {
  if (!cache) {
    cache = fetch(KARTOR_URL, { cache: "force-cache" }).then((r) => {
      if (!r.ok) throw new Error(`Kunde inte ladda fältkartor (${r.status})`);
      return r.json() as Promise<Faltkartor>;
    });
  }
  return cache;
}

// Hämtar en mall från cert_templates via slug. Faller tillbaka till statisk JSON
// om raden saknas eller är inaktiv. Cache per slug i minnet.
const dbCache = new Map<string, Karta>();
async function loadKartaFromDb(slug: string): Promise<Karta | null> {
  if (dbCache.has(slug)) return dbCache.get(slug)!;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("cert_templates")
      .select("bg_url, falt, canvas, aktiv")
      .eq("slug", slug)
      .eq("aktiv", true)
      .maybeSingle();
    if (error || !data) return null;
    const karta: Karta = {
      bg: data.bg_url,
      canvas: data.canvas ?? { w: 1240, h: 1754 },
      falt: data.falt ?? {},
    };
    dbCache.set(slug, karta);
    return karta;
  } catch {
    return null;
  }
}


// ---------- Font-registrering ----------
// De sju family-namnen som kartorna använder. Google Fonts-inbäddningar för
// Bricolage/Familjen/JetBrains finns redan i __root.tsx. De fyra lokala fonterna
// registreras här som @font-face en gång så canvas kan använda dem.
const LOCAL_FONT_CSS = `
@font-face { font-family: "Anton";          src: url("/fonts/Anton-Regular.ttf") format("truetype"); font-weight: 100 900; font-style: normal; font-display: swap; }
@font-face { font-family: "Space Grotesk";  src: url("/fonts/SpaceGrotesk-Medium.ttf") format("truetype"); font-weight: 100 900; font-style: normal; font-display: swap; }
@font-face { font-family: "Jost";           src: url("/fonts/Jost-Light.ttf") format("truetype"); font-weight: 100 900; font-style: normal italic; font-display: swap; }
@font-face { font-family: "Poppins";        src: url("/fonts/Poppins-Light.ttf") format("truetype"); font-weight: 100 400; font-style: normal; font-display: swap; }
@font-face { font-family: "Poppins";        src: url("/fonts/Poppins-SemiBold.ttf") format("truetype"); font-weight: 500 650; font-style: normal; font-display: swap; }
@font-face { font-family: "Poppins";        src: url("/fonts/Poppins-Bold.ttf") format("truetype"); font-weight: 651 900; font-style: normal; font-display: swap; }
`;

let fontsInstalled = false;
function ensureFonts() {
  if (fontsInstalled || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-cert-faltkarta-fonts", "1");
  style.textContent = LOCAL_FONT_CSS;
  document.head.appendChild(style);
  fontsInstalled = true;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Bild kunde inte laddas: ${src}`));
    img.src = src;
  });
}

function fmtDateSv(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
}
function fmtCoord(lat: number | string, lon: number | string) {
  const a = typeof lat === "string" ? parseFloat(lat) : lat;
  const b = typeof lon === "string" ? parseFloat(lon) : lon;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  return `${a.toFixed(6)} · ${b.toFixed(6)}`;
}

function valueFor(key: string, d: FaltkartaData): string | null {
  switch (key) {
    case "namn":         return d.recipient_name;
    case "antal":        return String(d.tree_count);
    case "plats":        return (d.location_name || "").trim();
    case "koordinater":  return fmtCoord(d.latitude, d.longitude);
    case "datum":        return fmtDateSv(d.issued_date);
    case "id":           return d.verification_id;
    case "url":          return d.verification_id;
    default:             return null;
  }
}

function buildFontString(f: Falt, s = 1): string {
  const style = f.italic ? "italic " : "";
  const wRaw = f.weight ?? "400";
  const w = /^\d+$/.test(wRaw) ? wRaw : (wRaw === "bold" ? "700" : "400");
  const size = (f.size ?? 32) * s;
  const font = f.font ?? "Bricolage Grotesque";
  return `${style}${w} ${size}px "${font}"`;
}

async function preloadFonts(kartor: Karta, s = 1): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const specs = new Set<string>();
  Object.values(kartor.falt).forEach((f) => {
    if (f.type === "logo") return;
    specs.add(buildFontString(f, s));
  });
  await Promise.all(Array.from(specs).map((spec) =>
    document.fonts.load(spec, "ÅÄÖabcåäö0123456789· ").catch(() => null)
  ));
  await document.fonts.ready;
}

/** Rita en textrad med anchor + letterSpacing, skalad med faktorn s. */
function drawFieldText(ctx: CanvasRenderingContext2D, text: string, f: Falt, s: number) {
  ctx.save();
  ctx.font = buildFontString(f, s);
  ctx.fillStyle = f.color ?? "#123326";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const ls = (f.letterSpacing || 0) * s;
  let totalWidth = 0;
  for (const ch of Array.from(text)) totalWidth += ctx.measureText(ch).width + ls;
  totalWidth -= ls;

  const ax = f.x * s;
  const y = f.y * s;
  let x = ax;
  if (f.anchor === "middle") x = ax - totalWidth / 2;
  else if (f.anchor === "end") x = ax - totalWidth;

  for (const ch of Array.from(text)) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + ls;
  }
  ctx.restore();
}

async function drawLogo(ctx: CanvasRenderingContext2D, f: Falt, s: number) {
  if (!f.url) return;
  try {
    const img = await loadImage(f.url);
    const w = (f.width ?? 200) * s;
    const h = img.naturalHeight > 0 ? (w * img.naturalHeight) / img.naturalWidth : w;
    ctx.drawImage(img, f.x * s, f.y * s, w, h);
  } catch { /* noop */ }
}

export async function renderFaltkartaCertPdf(karta: Karta, data: FaltkartaData, filename: string): Promise<void> {
  ensureFonts();

  const bg = await loadImage(karta.bg);
  // SVG-bakgrunder saknar meningsfull naturalWidth — rendera 2× canvas för att bevara skärpa.
  const isSvg = /\.svg(\?|$)/i.test(karta.bg);
  const s = isSvg
    ? 2
    : (bg.naturalWidth > karta.canvas.w ? bg.naturalWidth / karta.canvas.w : 1);

  const outW = Math.round(karta.canvas.w * s);
  const outH = Math.round(karta.canvas.h * s);
  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bg, 0, 0, outW, outH);

  await preloadFonts(karta, s);

  for (const [key, f] of Object.entries(karta.falt)) {
    if (f.type === "logo") {
      await drawLogo(ctx, f, s);
      continue;
    }
    if (f.type === "static") {
      const text = f.text ?? "";
      if (!text) continue;
      drawFieldText(ctx, text, f, s);
      continue;
    }
    const raw = valueFor(key, data);
    if (raw == null || raw === "") continue;
    const text = f.template ? f.template.replace("{v}", raw) : raw;
    drawFieldText(ctx, text, f, s);
  }

  const img = canvas.toDataURL("image/jpeg", 0.95);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  pdf.addImage(img, "JPEG", 0, 0, 210, 297, undefined, "FAST");
  pdf.save(filename);
}

export async function downloadFaltkartaCertPdf(kartaSlug: string, data: FaltkartaData): Promise<void> {
  let karta = await loadKartaFromDb(kartaSlug);
  if (!karta) {
    const kartor = await loadKartorFallback();
    karta = kartor[kartaSlug] ?? null;
  }
  if (!karta) throw new Error(`Fältkarta saknas för slug: ${kartaSlug}`);
  await renderFaltkartaCertPdf(karta, data, `vardebevis-${data.verification_id}.pdf`);
}

export type { Karta as FaltkartaKarta, Falt as FaltkartaFalt };
