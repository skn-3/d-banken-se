import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden: admin role required");
}
async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
function origin() {
  try { return new URL(getRequest().url).origin; } catch { return "https://app.smartklimat.org"; }
}
async function logActivity(sb: any, userId: string, action: string, detail: Record<string, unknown>) {
  await sb.from("admin_activity").insert({ user_id: userId, action, detail });
}
const round2 = (n: number) => Math.round(n * 100) / 100;
function addDays(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function todayStockholm() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

export const listBusinessCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const [{ data: customers }, { data: balances }, { data: invoices }] = await Promise.all([
      sb.from("business_customers").select("*").order("customer_no"),
      sb.from("customer_tree_balance").select("*"),
      sb.from("invoices").select("customer_id, invoice_no, invoice_date, status, created_at").order("created_at", { ascending: false }),
    ]);
    return {
      customers: (customers ?? []).map((c: any) => {
        const b = (balances ?? []).find((x: any) => x.customer_id === c.id) ?? { credited: 0, consumed: 0, balance: 0 };
        const last = (invoices ?? []).find((i: any) => i.customer_id === c.id) ?? null;
        return { ...c, credited: b.credited, consumed: b.consumed, balance: b.balance, last_invoice: last };
      }),
    };
  });

export const getBusinessCustomer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data: customer, error } = await sb.from("business_customers").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const [{ data: balance }, { data: ledger }, { data: invoices }, { data: series }, { data: orgs }] = await Promise.all([
      sb.from("customer_tree_balance").select("*").eq("customer_id", data.id).maybeSingle(),
      sb.from("tree_ledger").select("id, entry_type, trees, invoice_id, purchase_id, note, created_at").eq("customer_id", data.id).order("created_at", { ascending: false }).limit(1000),
      sb.from("invoices").select("*").eq("customer_id", data.id).order("created_at", { ascending: false }),
      sb.from("invoice_series").select("next_seq").eq("prefix", customer.invoice_prefix).maybeSingle(),
      sb.from("organizations").select("id, name").order("name"),
    ]);
    const nextSeq = series?.next_seq ?? 1;
    return {
      customer,
      balance: balance ?? { credited: 0, consumed: 0, balance: 0 },
      ledger: ledger ?? [],
      invoices: invoices ?? [],
      nextInvoiceNo: `${customer.invoice_prefix}-${String(nextSeq).padStart(3, "0")}`,
      organizations: orgs ?? [],
    };
  });

const CustomerSchema = z.object({
  id: z.string().uuid().optional(),
  customer_no: z.string().trim().min(2).max(20),
  invoice_prefix: z.string().trim().min(2).max(10).regex(/^[A-Z0-9]+$/, "Prefix: versaler/siffror"),
  legal_name: z.string().trim().min(1).max(200),
  org_nr: z.string().trim().max(20).nullable(),
  address_line: z.string().trim().max(200).nullable(),
  postal_city: z.string().trim().max(200).nullable(),
  email: z.string().trim().max(255).nullable(),
  contact_reference: z.string().trim().max(200).nullable(),
  payment_terms_days: z.number().int().min(0).max(120),
  default_price_per_tree: z.number().min(0).max(100000),
  vat_rate: z.number().min(0).max(1),
  organization_id: z.string().uuid().nullable(),
  ledger_start_at: z.string().min(10),
  low_balance_threshold: z.number().int().min(0),
  active: z.boolean(),
  notes: z.string().max(5000).nullable(),
});

export const saveBusinessCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CustomerSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { id, ...row } = data;
    const q = id
      ? sb.from("business_customers").update(row).eq("id", id).select("id").single()
      : sb.from("business_customers").insert(row).select("id").single();
    const { data: saved, error } = await q;
    if (error) throw new Error(error.message);
    await logActivity(sb, context.userId, id ? "business_customer.update" : "business_customer.create", { customer_id: saved.id, customer_no: row.customer_no });
    return { id: saved.id as string };
  });

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    customerId: z.string().uuid(),
    trees: z.number().int().min(1).max(10_000_000),
    unitPrice: z.number().min(0).max(100000),
    description: z.string().trim().min(1).max(300),
    send: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data: c, error: cErr } = await sb.from("business_customers").select("*").eq("id", data.customerId).single();
    if (cErr) throw new Error(cErr.message);
    const { data: num, error: nErr } = await sb.rpc("next_invoice_no", { _prefix: c.invoice_prefix });
    if (nErr) throw new Error(nErr.message);
    const n = Array.isArray(num) ? num[0] : num;
    const net = round2(data.trees * data.unitPrice);
    const vat = round2(net * Number(c.vat_rate));
    const invoiceDate = todayStockholm();
    const { data: inv, error } = await sb.from("invoices").insert({
      customer_id: c.id, invoice_no: n.invoice_no, series_seq: n.seq,
      invoice_date: invoiceDate, due_date: addDays(invoiceDate, c.payment_terms_days),
      lines: [{ description: data.description, quantity: data.trees, unit: "st", unit_price: data.unitPrice }],
      trees: data.trees, net_amount: net, vat_amount: vat, total_amount: round2(net + vat),
      status: "utkast", created_by: context.userId,
    }).select("id, invoice_no").single();
    if (error) throw new Error(error.message);
    await logActivity(sb, context.userId, "invoice.create", { invoice_no: inv.invoice_no, trees: data.trees });
    if (data.send) await markSentInternal(sb, inv.id, context.userId);
    return { id: inv.id as string, invoice_no: inv.invoice_no as string };
  });

async function markSentInternal(sb: any, invoiceId: string, userId: string) {
  const { data: inv } = await sb.from("invoices").select("*").eq("id", invoiceId).single();
  if (!inv) throw new Error("Faktura saknas");
  if (inv.status !== "utkast") throw new Error("Fakturan är redan skickad");
  const { error } = await sb.from("invoices").update({ status: "skickad" }).eq("id", invoiceId).eq("status", "utkast");
  if (error) throw new Error(error.message);
  await sb.from("tree_ledger").insert({
    customer_id: inv.customer_id, entry_type: "invoice_credit", trees: inv.trees,
    invoice_id: inv.id, note: `Faktura ${inv.invoice_no}`, created_by: userId,
  });
  const { generateAndStoreInvoicePdf } = await import("@/lib/business.server");
  await generateAndStoreInvoicePdf(invoiceId, origin());
  await logActivity(sb, userId, "invoice.sent", { invoice_no: inv.invoice_no, trees: inv.trees });
}

export const markInvoiceSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await markSentInternal(await admin(), data.id, context.userId);
    return { ok: true };
  });

export const markInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data: inv, error } = await sb.from("invoices").update({ status: "betald", paid_at: new Date().toISOString() })
      .eq("id", data.id).eq("status", "skickad").is("credits_invoice_id", null).select("invoice_no").maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Endast skickade fakturor kan markeras betalda");
    await logActivity(sb, context.userId, "invoice.paid", { invoice_no: inv.invoice_no });
    return { ok: true };
  });

export const creditInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data: orig } = await sb.from("invoices").select("*").eq("id", data.id).single();
    if (!orig) throw new Error("Faktura saknas");
    if (!["skickad", "betald"].includes(orig.status) || orig.credits_invoice_id) throw new Error("Fakturan kan inte krediteras");
    const { data: c } = await sb.from("business_customers").select("*").eq("id", orig.customer_id).single();
    const { data: num, error: nErr } = await sb.rpc("next_invoice_no", { _prefix: c.invoice_prefix });
    if (nErr) throw new Error(nErr.message);
    const n = Array.isArray(num) ? num[0] : num;
    const date = todayStockholm();
    const lines = (orig.lines as any[]).map((l) => ({
      ...l, description: `Kreditering av faktura ${orig.invoice_no}: ${l.description}`, quantity: -l.quantity,
    }));
    const { data: cn, error } = await sb.from("invoices").insert({
      customer_id: c.id, invoice_no: n.invoice_no, series_seq: n.seq, invoice_date: date, due_date: date,
      lines, trees: -orig.trees, net_amount: -orig.net_amount, vat_amount: -orig.vat_amount, total_amount: -orig.total_amount,
      status: "skickad", credits_invoice_id: orig.id, created_by: context.userId,
    }).select("id, invoice_no").single();
    if (error) throw new Error(error.message);
    await sb.from("invoices").update({ status: "krediterad", credited_by_invoice_id: cn.id }).eq("id", orig.id);
    await sb.from("tree_ledger").insert({
      customer_id: c.id, entry_type: "credit_note", trees: -orig.trees, invoice_id: cn.id,
      note: `Kreditfaktura ${cn.invoice_no} för ${orig.invoice_no}: ${data.reason}`, created_by: context.userId,
    });
    const { generateAndStoreInvoicePdf } = await import("@/lib/business.server");
    await generateAndStoreInvoicePdf(cn.id, origin());
    await logActivity(sb, context.userId, "invoice.credited", { invoice_no: orig.invoice_no, credit_note_no: cn.invoice_no, reason: data.reason });
    return { ok: true, creditNoteNo: cn.invoice_no as string };
  });

export const getInvoicePdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), regenerate: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data: inv } = await sb.from("invoices").select("pdf_path").eq("id", data.id).single();
    let path = inv?.pdf_path as string | null;
    if (!path || data.regenerate) {
      const { generateAndStoreInvoicePdf } = await import("@/lib/business.server");
      path = (await generateAndStoreInvoicePdf(data.id, origin())).path;
    }
    const { data: sig, error } = await sb.storage.from("invoices").createSignedUrl(path, 300, { download: true });
    if (error) throw new Error(error.message);
    return { url: sig.signedUrl as string };
  });

export const sendInvoiceToBookkeeping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data: inv } = await sb.from("invoices").select("*").eq("id", data.id).single();
    if (!inv || inv.status === "utkast") throw new Error("Utkast kan inte skickas till bokföringen");
    const { data: settings } = await sb.from("company_settings").select("*").eq("id", 1).single();
    const { generateAndStoreInvoicePdf } = await import("@/lib/business.server");
    const { bytes } = await generateAndStoreInvoicePdf(data.id, origin());
    const { sendEmail } = await import("@/lib/email/resend.server");
    const res = await sendEmail({
      to: settings.bookkeeping_email,
      subject: `Faktura ${inv.invoice_no}`,
      html: `<p>Kopia av faktura ${inv.invoice_no} från ${settings.legal_name}.</p>`,
      attachments: [{ filename: `${inv.invoice_no}.pdf`, content: Buffer.from(bytes).toString("base64") }],
    });
    if (!res.ok) throw new Error(`Mail misslyckades: ${res.error ?? res.status}`);
    const sentAt = new Date().toISOString();
    await sb.from("invoices").update({ bookkeeping_sent_at: sentAt }).eq("id", data.id);
    await logActivity(sb, context.userId, "invoice.bookkeeping_copy", { invoice_no: inv.invoice_no, to: settings.bookkeeping_email, message_id: res.messageId });
    return { ok: true, sentAt };
  });

export const syncConsumption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data, error } = await sb.rpc("sync_all_consumption");
    if (error) throw new Error(error.message);
    await logActivity(sb, context.userId, "business_customer.sync_consumption", { added: data });
    return { added: data as number };
  });

export const getCompanySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await (await admin()).from("company_settings").select("*").eq("id", 1).single();
    return { settings: data };
  });

export const saveCompanySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    legal_name: z.string().trim().min(1).max(200), org_nr: z.string().trim().max(20), vat_nr: z.string().trim().max(30),
    address_line: z.string().trim().max(200), postal_city: z.string().trim().max(200), bankgiro: z.string().trim().max(30),
    email: z.string().trim().max(255), phone: z.string().trim().max(40), website: z.string().trim().max(200),
    our_reference: z.string().trim().max(100), tagline: z.string().trim().max(200), bookkeeping_email: z.string().trim().email(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { error } = await sb.from("company_settings").update({ ...data, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
    await logActivity(sb, context.userId, "company_settings.update", {});
    return { ok: true };
  });
