// Original-tema: renderar från den pixelkalibrerade HTML-mallen (fonts + bakgrund inbäddat)
// och exporterar A4-PDF. Ingen QR/verifierings-ID visas — troget originaldesignen.
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const TEMPLATE_URL = "/certs/vardebevis-original.html";

// A4 i CSS-pixlar vid 96dpi (1pt = 4/3 px). 595.28pt × 841.89pt.
const A4_W_PX = 794;
const A4_H_PX = 1123;

export interface OriginalCertData {
  verification_id: string;
  recipient_name: string;
  tree_count: number;
  location_name: string;   // "Ort, Region, Land"
  latitude: number | string;
  longitude: number | string;
  issued_date: string;     // ISO
  project_name?: string | null; // ej använd — mall är generisk
}

function formatDDMMYYYY(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function ensureDot(s: string): string {
  const t = (s || "").trim();
  if (!t) return "";
  return t.endsWith(".") ? t : t + ".";
}

async function fetchTemplate(): Promise<string> {
  const res = await fetch(TEMPLATE_URL, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Kunde inte ladda mall (${res.status})`);
  return await res.text();
}

function populate(html: string, d: OriginalCertData): string {
  // Ersätt data-falt-spans utan att röra mallens övriga struktur.
  const doc = new DOMParser().parseFromString(html, "text/html");
  const setFalt = (key: string, value: string) => {
    doc.querySelectorAll(`[data-falt="${key}"]`).forEach((el) => {
      el.textContent = value;
    });
  };
  setFalt("mottagare", d.recipient_name);
  setFalt("antal", String(d.tree_count));
  setFalt("lat", String(d.latitude));
  setFalt("lon", String(d.longitude));
  setFalt("plats", ensureDot(d.location_name));
  setFalt("datum", formatDDMMYYYY(d.issued_date));
  return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
}

export async function downloadOriginalCertPdf(data: OriginalCertData): Promise<void> {
  const raw = await fetchTemplate();
  const html = populate(raw, data);

  // Rendera i sandboxad iframe med A4-mått i CSS-pixlar; låt fonts hinna laddas.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-99999px";
  iframe.style.top = "0";
  iframe.style.width = `${A4_W_PX}px`;
  iframe.style.height = `${A4_H_PX}px`;
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error("iframe onerror"));
      iframe.srcdoc = html;
    });

    const doc = iframe.contentDocument!;
    // Vänta in fonts + bakgrund
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fontsReady: Promise<unknown> = (doc as any).fonts?.ready ?? Promise.resolve();
    await fontsReady;
    await new Promise((r) => setTimeout(r, 250));

    const body = doc.body;
    body.style.width = `${A4_W_PX}px`;
    body.style.height = `${A4_H_PX}px`;

    const canvas = await html2canvas(body, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      width: A4_W_PX,
      height: A4_H_PX,
      windowWidth: A4_W_PX,
      windowHeight: A4_H_PX,
    });
    const img = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    pdf.addImage(img, "JPEG", 0, 0, 210, 297, undefined, "FAST");
    pdf.save(`vardebevis-${data.verification_id}.pdf`);
  } finally {
    iframe.remove();
  }
}
