// Server-only: generering och lagring av faktura-PDF.
import { renderInvoicePdf, type InvoicePdfAssets, type InvoiceLine } from "@/lib/invoice-pdf";

const ASSET_PATHS = {
  logo: "/brand/smartklimat-logo-invoice.png",
  display: "/fonts/BricolageGrotesque-Bold.ttf",
  displayMed: "/fonts/BricolageGrotesque-Medium.ttf",
  body: "/fonts/FamiljenGrotesk-Regular.ttf",
  bodySemi: "/fonts/FamiljenGrotesk-SemiBold.ttf",
};

function toB64(buf: ArrayBuffer) {
  return Buffer.from(buf).toString("base64");
}

export async function loadInvoiceAssets(origin: string): Promise<InvoicePdfAssets> {
  const get = async (p: string) => {
    const r = await fetch(new URL(p, origin));
    if (!r.ok) throw new Error(`Kunde inte hämta ${p} (${r.status})`);
    return toB64(await r.arrayBuffer());
  };
  const [logo, display, displayMed, body, bodySemi] = await Promise.all([
    get(ASSET_PATHS.logo), get(ASSET_PATHS.display), get(ASSET_PATHS.displayMed), get(ASSET_PATHS.body), get(ASSET_PATHS.bodySemi),
  ]);
  return { logoPngBase64: logo, fonts: { display, displayMed, body, bodySemi } };
}

/** Genererar PDF för fakturan, laddar upp till privata bucketen 'invoices' och sparar pdf_path. */
export async function generateAndStoreInvoicePdf(invoiceId: string, origin: string): Promise<{ path: string; bytes: ArrayBuffer }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseAdmin as any;
  const { data: inv, error } = await sb.from("invoices").select("*").eq("id", invoiceId).single();
  if (error || !inv) throw new Error(error?.message ?? "Faktura saknas");
  const { data: cust } = await sb.from("business_customers").select("*").eq("id", inv.customer_id).single();
  const { data: seller } = await sb.from("company_settings").select("*").eq("id", 1).single();
  let creditsNo: string | null = null;
  if (inv.credits_invoice_id) {
    const { data: o } = await sb.from("invoices").select("invoice_no").eq("id", inv.credits_invoice_id).maybeSingle();
    creditsNo = o?.invoice_no ?? null;
  }
  const assets = await loadInvoiceAssets(origin);
  const bytes = renderInvoicePdf({
    invoice_no: inv.invoice_no,
    invoice_date: inv.invoice_date,
    due_date: inv.due_date,
    is_credit: !!inv.credits_invoice_id,
    credits_invoice_no: creditsNo,
    lines: inv.lines as InvoiceLine[],
    net_amount: Number(inv.net_amount),
    vat_amount: Number(inv.vat_amount),
    total_amount: Number(inv.total_amount),
    vat_rate: Number(cust.vat_rate),
    payment_terms_days: cust.payment_terms_days,
    customer: cust,
    seller,
  }, assets);
  const path = `${cust.customer_no}/${inv.invoice_no}.pdf`;
  const up = await supabaseAdmin.storage.from("invoices").upload(path, new Uint8Array(bytes), {
    contentType: "application/pdf", upsert: true,
  });
  if (up.error) throw new Error(up.error.message);
  await sb.from("invoices").update({ pdf_path: path }).eq("id", invoiceId);
  return { path, bytes };
}
