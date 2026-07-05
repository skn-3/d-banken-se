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
  const stamp = "https://smartklimat.org/brand/logo-stamp-guld.png";
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:Helvetica,Arial,sans-serif;color:#0B3D2E;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:32px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FBF9F2;border:1px solid rgba(11,61,46,0.14);border-radius:24px;overflow:hidden;">
<tr><td style="padding:44px 44px 8px;text-align:center;">
<div style="font-family:'Menlo','Courier New',monospace;font-size:11px;letter-spacing:0.42em;color:#4F6B5E;text-transform:uppercase;">VÄRDEBEVIS</div>
<h1 style="margin:22px 0 0;font-size:30px;font-weight:700;color:#0B3D2E;letter-spacing:-0.01em;">${esc(a.recipientName)}</h1>
<div style="margin:28px 0 6px;font-size:88px;font-weight:700;color:#1E9E6A;line-height:0.9;letter-spacing:-0.03em;">${a.treeCount.toLocaleString("sv-SE")}</div>
<div style="font-size:14px;color:#385248;">träd planterade</div>
<div style="margin-top:14px;font-family:'Menlo','Courier New',monospace;font-size:11px;letter-spacing:0.06em;color:#4F6B5E;text-transform:uppercase;">${esc(a.dateText)}</div>
<img src="${stamp}" width="72" height="72" alt="" style="display:block;margin:28px auto 0;width:72px;height:72px;" />
</td></tr>
<tr><td align="center" style="padding:24px 44px 40px;">
<a href="${a.verifyUrl}" style="display:inline-block;background:#1E9E6A;color:#fff;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:600;font-size:14px;">Visa och verifiera ditt bevis</a>
<p style="margin:14px 0 0;font-size:11px;color:#7A8F84;font-family:'Menlo','Courier New',monospace;">Verifierings-ID: ${esc(a.verificationId)}</p>
</td></tr></table>
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="margin-top:20px;background:#ffffff;border:1px solid rgba(11,61,46,0.10);border-radius:20px;">
<tr><td style="padding:26px 32px;">
<h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#0B3D2E;">Varför träd?</h2>
<p style="margin:0 0 10px;font-size:13px;line-height:1.55;color:#385248;">Ditt träd binder ungefär 20 kg koldioxid — varje år.</p>
<p style="margin:0 0 10px;font-size:13px;line-height:1.55;color:#385248;">Det planteras i granskade WeForest-projekt i Indien, Zambia eller Brasilien.</p>
<p style="margin:0 0 14px;font-size:13px;line-height:1.55;color:#385248;">Det är spårbart — följ det via länken ovan.</p>
<a href="https://smartklimat.org/projekt" style="font-size:13px;font-weight:600;color:#1E9E6A;text-decoration:none;">Läs mer om projekten →</a>
</td></tr></table>
<p style="margin:20px 0 0;font-size:11px;color:#7A8F84;">SmartKlimat · Tänk smart, vi har ett gemensamt klimat.</p>
</td></tr></table></body></html>`;
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
