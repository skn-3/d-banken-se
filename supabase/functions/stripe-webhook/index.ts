import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "SmartKlimat <onboarding@resend.dev>";
const APP_PUBLIC_URL = (Deno.env.get("APP_PUBLIC_URL") ?? "https://smartklimat.org").replace(/\/+$/, "");
const PRICE_PER_TREE_ORE = 3500;

function esc(s: string) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c] as string));
}

function renderThanksEmail(a: { recipientName: string; treeCount: number; totalKr: string; dateText: string; verificationId: string; verifyUrl: string }) {
  const subject = `Tack — ${a.treeCount} träd planterade i ditt namn`;
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:'Helvetica Neue',Arial,sans-serif;color:#0B3D2E;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:32px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 20px 50px -30px rgba(11,61,46,.25);">
<tr><td style="background:linear-gradient(155deg,#EAF7EE,#C7EAD4);padding:36px 40px;text-align:center;">
<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:#fff;border:2px solid #1E9E6A;color:#1E9E6A;font-weight:700;font-size:22px;">SK</div>
<h1 style="margin:18px 0 6px;font-size:24px;font-weight:600;">Tack, ${esc(a.recipientName)}!</h1>
<p style="margin:0;font-size:14px;color:#385248;">Träden planteras tillsammans med WeForest.</p></td></tr>
<tr><td style="padding:32px 40px 8px;">
<div style="text-align:center;font-family:'Menlo','Courier New',monospace;font-size:48px;font-weight:600;color:#1E9E6A;line-height:1;">${a.treeCount.toLocaleString("sv-SE")}</div>
<div style="text-align:center;margin-top:6px;font-size:13px;color:#4F6B5E;">träd planterade</div></td></tr>
<tr><td style="padding:24px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5EDE6;border-radius:16px;">
<tr><td style="padding:14px 18px;border-bottom:1px solid #E5EDE6;font-size:13px;color:#4F6B5E;">Datum</td><td style="padding:14px 18px;border-bottom:1px solid #E5EDE6;text-align:right;font-family:monospace;font-size:13px;">${esc(a.dateText)}</td></tr>
<tr><td style="padding:14px 18px;border-bottom:1px solid #E5EDE6;font-size:13px;color:#4F6B5E;">Antal</td><td style="padding:14px 18px;border-bottom:1px solid #E5EDE6;text-align:right;font-family:monospace;font-size:13px;">${a.treeCount} träd</td></tr>
<tr><td style="padding:14px 18px;border-bottom:1px solid #E5EDE6;font-size:13px;color:#4F6B5E;">Belopp</td><td style="padding:14px 18px;border-bottom:1px solid #E5EDE6;text-align:right;font-family:monospace;font-size:13px;">${esc(a.totalKr)}</td></tr>
<tr><td style="padding:14px 18px;font-size:13px;color:#4F6B5E;">Verifierings-ID</td><td style="padding:14px 18px;text-align:right;font-family:monospace;font-size:13px;">${esc(a.verificationId)}</td></tr>
</table></td></tr>
<tr><td align="center" style="padding:8px 40px 36px;">
<a href="${a.verifyUrl}" style="display:inline-block;background:#1E9E6A;color:#fff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:600;font-size:14px;">Visa & ladda ner värdebevis</a>
<p style="margin:16px 0 0;font-size:12px;color:#7A8F84;">Eller öppna direkt: <a href="${a.verifyUrl}" style="color:#1E9E6A;">${a.verifyUrl}</a></p></td></tr>
<tr><td style="background:#F8FBF6;padding:20px 40px;text-align:center;font-size:11px;color:#7A8F84;">SmartKlimat · Träd som planteras genom WeForest</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html };
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) { console.error("RESEND_API_KEY missing"); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  if (!res.ok) { console.error("Resend fail", res.status, await res.text()); return false; }
  return true;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) return new Response("missing_stripe_secrets", { status: 500 });

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });
  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error("webhook signature failed", (e as Error).message);
    return new Response(`bad_signature: ${(e as Error).message}`, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true, ignored: event.type }), { status: 200, headers: { "content-type": "application/json" } });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const md = session.metadata ?? {};
    const type = String(md.type ?? "");
    const quantity = Math.max(1, Math.floor(Number(md.quantity ?? 0)));
    if (!quantity) return new Response("missing_quantity", { status: 400 });

    const custEmail = String(session.customer_details?.email ?? session.customer_email ?? "").trim().toLowerCase();
    const buyerName = String(session.customer_details?.name ?? "").trim();

    let recipientName = buyerName || "Privatperson";
    let greeting = "";
    if (type === "gava") {
      const cf = session.custom_fields ?? [];
      for (const f of cf) {
        if (f.key === "recipient_name") recipientName = String(f.text?.value ?? "").trim() || recipientName;
        if (f.key === "greeting") greeting = String(f.text?.value ?? "").trim();
      }
    }
    if (!custEmail) return new Response("missing_email", { status: 400 });

    // Idempotens
    const orderRef = `stripe:${session.id}`;
    const existing = await db.from("purchases").select("id").eq("source_order_ref", orderRef).maybeSingle();
    if (existing.data) return new Response(JSON.stringify({ received: true, idempotent: true }), { status: 200, headers: { "content-type": "application/json" } });

    // Upsert customer
    let customerId: string;
    const ec = await db.from("customers").select("id, name").eq("email", custEmail).maybeSingle();
    if (ec.data) {
      customerId = ec.data.id;
      if (ec.data.name !== recipientName)
        await db.from("customers").update({ name: recipientName, updated_at: new Date().toISOString() }).eq("id", customerId);
    } else {
      const ins = await db.from("customers").insert({ email: custEmail, name: recipientName }).select("id").single();
      if (ins.error) throw new Error("customer_insert: " + ins.error.message);
      customerId = ins.data.id;
    }

    // Insert purchase
    const total = quantity * PRICE_PER_TREE_ORE;
    const pur = await db.from("purchases").insert({
      user_id: null, customer_id: customerId,
      recipient_name: recipientName, recipient_email: custEmail,
      tree_count: quantity, unit_price_ore: PRICE_PER_TREE_ORE, total_amount_ore: total,
      status: "paid", paid_at: new Date().toISOString(),
      source: `stripe:${type}`, source_order_ref: orderRef,
    }).select("id, created_at").single();

    if (pur.error) {
      if ((pur.error as any).code === "23505") {
        return new Response(JSON.stringify({ received: true, idempotent: true }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error("purchase_insert: " + pur.error.message);
    }

    // Certificate
    const gen = await db.rpc("generate_certificate", { _purchase_id: pur.data.id });
    if (gen.error) throw new Error("certificate: " + gen.error.message);
    const vid = (gen.data as any)?.verification_id ?? null;

    // Email
    if (vid) {
      const verifyUrl = `${APP_PUBLIC_URL}/v/${vid}`;
      const totalKr = `${(total / 100).toLocaleString("sv-SE")} kr`;
      const dateText = new Date(pur.data.created_at).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
      const { subject, html } = renderThanksEmail({ recipientName, treeCount: quantity, totalKr, dateText, verificationId: vid, verifyUrl });
      await sendEmail(custEmail, subject, html);
    }

    console.log("stripe-webhook ok", { session: session.id, type, quantity, vid, greeting: greeting ? "yes" : "no" });
    return new Response(JSON.stringify({ received: true, verification_id: vid }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("stripe-webhook handler error", (e as Error).message);
    return new Response("handler_error: " + (e as Error).message, { status: 500 });
  }
});
