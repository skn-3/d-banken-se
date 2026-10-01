import { jsPDF } from "jspdf";

export interface InvoiceLine { description: string; quantity: number; unit: string; unit_price: number }
export interface InvoicePdfData {
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  is_credit: boolean;
  credits_invoice_no?: string | null;
  lines: InvoiceLine[];
  net_amount: number;
  vat_amount: number;
  total_amount: number;
  vat_rate: number;
  payment_terms_days: number;
  customer: { legal_name: string; org_nr: string | null; address_line: string | null; postal_city: string | null; customer_no: string; contact_reference: string | null };
  seller: { legal_name: string; org_nr: string; vat_nr: string; address_line: string; postal_city: string; bankgiro: string; email: string; phone: string; website: string; our_reference: string; tagline: string };
}
export interface InvoicePdfAssets { logoPngBase64: string; fonts: Record<"display" | "displayMed" | "body" | "bodySemi", string> }

/** Svensk beloppsformatering: "25 000 kr", decimaler bara när de inte är ,00. */
export function formatKr(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const whole = Number.isInteger(rounded);
  const s = rounded.toLocaleString("sv-SE", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  return `${s.replace(/\u00a0|\u202f/g, " ")} kr`;
}

const FOREST: [number, number, number] = [11, 61, 46];
const PRIMARY: [number, number, number] = [30, 158, 106];
const MINT: [number, number, number] = [234, 247, 238];
const MUTED: [number, number, number] = [90, 110, 100];

export function renderInvoicePdf(d: InvoicePdfData, a: InvoicePdfAssets): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const reg = (file: string, name: string, b64: string) => {
    doc.addFileToVFS(file, b64); doc.addFont(file, name, "normal");
  };
  reg("BG-Bold.ttf", "Display", a.fonts.display);
  reg("BG-Med.ttf", "DisplayMed", a.fonts.displayMed);
  reg("FG-Reg.ttf", "Body", a.fonts.body);
  reg("FG-Semi.ttf", "BodySemi", a.fonts.bodySemi);

  const W = 210, M = 18;
  doc.addImage(a.logoPngBase64, "PNG", M, 14, 26, 26);

  doc.setFont("Display"); doc.setTextColor(...FOREST); doc.setFontSize(24);
  doc.text(d.is_credit ? "KREDITFAKTURA" : "FAKTURA", W - M, 24, { align: "right" });
  doc.setFont("BodySemi"); doc.setFontSize(12); doc.setTextColor(...PRIMARY);
  doc.text(d.invoice_no, W - M, 31, { align: "right" });
  if (d.is_credit && d.credits_invoice_no) {
    doc.setFont("Body"); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text(`Krediterar faktura ${d.credits_invoice_no}`, W - M, 37, { align: "right" });
  }

  // Kort
  const cardY = 50, cardH = 44, cardW = (W - 2 * M - 6) / 2;
  const card = (x: number, title: string, rows: Array<[string, string] | string>) => {
    doc.setFillColor(...MINT); doc.roundedRect(x, cardY, cardW, cardH, 3, 3, "F");
    doc.setFont("DisplayMed"); doc.setFontSize(10); doc.setTextColor(...FOREST);
    doc.text(title.toUpperCase(), x + 5, cardY + 8);
    let y = cardY + 15;
    doc.setFontSize(9.5);
    for (const r of rows) {
      if (typeof r === "string") {
        doc.setFont("Body"); doc.setTextColor(30, 40, 35); doc.text(r, x + 5, y);
      } else {
        doc.setFont("Body"); doc.setTextColor(...MUTED); doc.text(r[0], x + 5, y);
        doc.setFont("BodySemi"); doc.setTextColor(30, 40, 35); doc.text(r[1], x + cardW - 5, y, { align: "right" });
      }
      y += 5.4;
    }
  };
  const c = d.customer;
  card(M, "Fakturamottagare", [
    c.legal_name,
    ...(c.org_nr ? [`Org.nr ${c.org_nr}`] : []),
    ...(c.address_line ? [c.address_line] : []),
    ...(c.postal_city ? [c.postal_city] : []),
    `Kundnr ${c.customer_no}`,
  ]);
  card(M + cardW + 6, "Fakturauppgifter", [
    ["Fakturadatum", d.invoice_date],
    ["Förfallodatum", d.due_date],
    ["Betalningsvillkor", `${d.payment_terms_days} dagar netto`],
    ["Er referens", c.contact_reference ?? "–"],
    ["Vår referens", d.seller.our_reference],
  ]);

  // Radtabell
  let y = 108;
  const cols = { desc: M + 4, qty: 128, price: 158, amount: W - M - 4 };
  doc.setFillColor(...FOREST); doc.roundedRect(M, y - 6, W - 2 * M, 10, 2, 2, "F");
  doc.setFont("DisplayMed"); doc.setFontSize(9.5); doc.setTextColor(255, 255, 255);
  doc.text("Beskrivning", cols.desc, y);
  doc.text("Antal", cols.qty, y, { align: "right" });
  doc.text("À-pris", cols.price, y, { align: "right" });
  doc.text("Belopp", cols.amount, y, { align: "right" });
  y += 11;
  doc.setFontSize(10);
  for (const l of d.lines) {
    doc.setFont("Body"); doc.setTextColor(30, 40, 35);
    const descLines = doc.splitTextToSize(l.description, 95) as string[];
    doc.text(descLines, cols.desc, y);
    doc.text(`${l.quantity.toLocaleString("sv-SE").replace(/\u00a0|\u202f/g, " ")} ${l.unit}`, cols.qty, y, { align: "right" });
    doc.text(formatKr(l.unit_price), cols.price, y, { align: "right" });
    doc.setFont("BodySemi");
    doc.text(formatKr(l.quantity * l.unit_price), cols.amount, y, { align: "right" });
    y += descLines.length * 5 + 4;
    doc.setDrawColor(220, 232, 224); doc.line(M, y - 3, W - M, y - 3);
  }

  // Summor
  y += 4;
  const sx = 120;
  doc.setFont("Body"); doc.setFontSize(10); doc.setTextColor(...MUTED);
  doc.text("Summa exkl. moms", sx, y); doc.setTextColor(30, 40, 35);
  doc.text(formatKr(d.net_amount), W - M - 4, y, { align: "right" });
  y += 6;
  doc.setTextColor(...MUTED);
  doc.text(`Moms ${Math.round(d.vat_rate * 100)} %`, sx, y); doc.setTextColor(30, 40, 35);
  doc.text(formatKr(d.vat_amount), W - M - 4, y, { align: "right" });
  y += 5;
  doc.setFillColor(...FOREST); doc.roundedRect(sx - 4, y, W - M - sx + 4, 15, 3, 3, "F");
  doc.setFont("DisplayMed"); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
  doc.text(d.is_credit ? "Att kreditera" : "Att betala", sx, y + 9.5);
  doc.setFont("Display"); doc.setFontSize(15);
  doc.text(formatKr(d.total_amount), W - M - 4, y + 10, { align: "right" });

  // Betalning + kontakt
  const by = 232, bh = 32;
  const s = d.seller;
  const infoCard = (x: number, title: string, rows: string[]) => {
    doc.setFillColor(...MINT); doc.roundedRect(x, by, cardW, bh, 3, 3, "F");
    doc.setFont("DisplayMed"); doc.setFontSize(10); doc.setTextColor(...FOREST);
    doc.text(title.toUpperCase(), x + 5, by + 8);
    doc.setFont("Body"); doc.setFontSize(9.5); doc.setTextColor(30, 40, 35);
    rows.forEach((r, i) => doc.text(r, x + 5, by + 15 + i * 5.4));
  };
  infoCard(M, "Betalning", [`Bankgiro ${s.bankgiro}`, "Ange fakturanummer vid betalning", "Dröjsmålsränta enligt räntelagen"]);
  infoCard(M + cardW + 6, "Kontakt", [s.email, s.phone, s.website]);

  // Sidfot
  doc.setDrawColor(...PRIMARY); doc.setLineWidth(0.4); doc.line(M, 276, W - M, 276);
  doc.setFont("Body"); doc.setFontSize(7.8); doc.setTextColor(...MUTED);
  doc.text(`${s.legal_name} · ${s.address_line}, ${s.postal_city} · Org.nr ${s.org_nr} · Momsreg.nr ${s.vat_nr}`, W / 2, 281, { align: "center" });
  doc.setFont("BodySemi"); doc.setTextColor(...FOREST);
  doc.text(s.tagline, W / 2, 286, { align: "center" });

  return doc.output("arraybuffer");
}
