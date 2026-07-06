import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { renderThanksEmail } from "../_shared/thanks-email.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "SmartKlimat <onboarding@resend.dev>";
const APP_PUBLIC_URL = (Deno.env.get("APP_PUBLIC_URL") ?? "https://smartklimat.org").replace(/\/+$/, "");
const PRICE_PER_TREE_ORE = 3500;


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

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Handle recurring subscription invoices
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    try {
      const billingReason = String((invoice as any).billing_reason ?? "");
      if (billingReason !== "subscription_cycle") {
        return new Response(JSON.stringify({ received: true, ignored: `invoice.paid:${billingReason}` }), { status: 200, headers: { "content-type": "application/json" } });
      }

      const subId = typeof invoice.subscription === "string" ? invoice.subscription : (invoice.subscription as any)?.id;
      if (!subId) return new Response("missing_subscription", { status: 400 });

      const sub = await stripe.subscriptions.retrieve(subId);
      const quantity = Math.max(1, Math.floor(Number(sub.items?.data?.[0]?.quantity ?? 0)));
      if (!quantity) return new Response("missing_quantity", { status: 400 });

      const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as any)?.id;
      const cust = customerId ? await stripe.customers.retrieve(customerId) as Stripe.Customer : null;
      const custEmail = String(cust?.email ?? invoice.customer_email ?? "").trim().toLowerCase();
      const recipientName = String(cust?.name ?? "").trim() || "Privatperson";
      if (!custEmail) return new Response("missing_email", { status: 400 });

      const orderRef = `stripe:invoice:${invoice.id}`;
      const existing = await db.from("purchases").select("id").eq("source_order_ref", orderRef).maybeSingle();
      if (existing.data) return new Response(JSON.stringify({ received: true, idempotent: true }), { status: 200, headers: { "content-type": "application/json" } });

      // Upsert customer
      let dbCustomerId: string;
      const ec = await db.from("customers").select("id, name").eq("email", custEmail).maybeSingle();
      if (ec.data) {
        dbCustomerId = ec.data.id;
        if (ec.data.name !== recipientName)
          await db.from("customers").update({ name: recipientName, updated_at: new Date().toISOString() }).eq("id", dbCustomerId);
      } else {
        const ins = await db.from("customers").insert({ email: custEmail, name: recipientName }).select("id").single();
        if (ins.error) throw new Error("customer_insert: " + ins.error.message);
        dbCustomerId = ins.data.id;
      }

      const total = quantity * PRICE_PER_TREE_ORE;
      const pur = await db.from("purchases").insert({
        user_id: null, customer_id: dbCustomerId,
        recipient_name: recipientName, recipient_email: custEmail,
        tree_count: quantity, unit_price_ore: PRICE_PER_TREE_ORE, total_amount_ore: total,
        status: "paid", paid_at: new Date().toISOString(),
        source: "monthly", source_order_ref: orderRef,
      }).select("id, created_at").single();

      if (pur.error) {
        if ((pur.error as any).code === "23505") {
          return new Response(JSON.stringify({ received: true, idempotent: true }), { status: 200, headers: { "content-type": "application/json" } });
        }
        throw new Error("purchase_insert: " + pur.error.message);
      }

      const gen = await db.rpc("generate_certificate", { _purchase_id: pur.data.id });
      if (gen.error) throw new Error("certificate: " + gen.error.message);
      const vid = (gen.data as any)?.verification_id ?? null;

      if (vid) {
        const verifyUrl = `${APP_PUBLIC_URL}/v/${vid}`;
        const dateText = new Date(pur.data.created_at).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
        const locationName = (gen.data as any)?.location_name ?? null;
        const { subject, html } = renderThanksEmail({
          recipientName, treeCount: quantity, dateText,
          verificationId: vid, verifyUrl, locationName,
        });
        await sendEmail(custEmail, subject, html);
      }

      console.log("stripe-webhook invoice.paid ok", { invoice: invoice.id, quantity, vid });
      return new Response(JSON.stringify({ received: true, verification_id: vid }), { status: 200, headers: { "content-type": "application/json" } });
    } catch (e) {
      console.error("stripe-webhook invoice.paid error", (e as Error).message);
      return new Response("handler_error: " + (e as Error).message, { status: 500 });
    }
  }

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true, ignored: event.type }), { status: 200, headers: { "content-type": "application/json" } });
  }

  const session = event.data.object as Stripe.Checkout.Session;


  try {
    const md = session.metadata ?? {};
    const type = String(md.type ?? "");
    const quantity = Math.max(1, Math.floor(Number(md.quantity ?? 0)));
    if (!quantity) return new Response("missing_quantity", { status: 400 });

    const custEmail = String(session.customer_details?.email ?? session.customer_email ?? "").trim().toLowerCase();
    const buyerName = String(session.customer_details?.name ?? "").trim();

    let recipientName = buyerName || "Privatperson";
    let greeting = String(md.halsning ?? "").trim();
    const themeId = String(md.theme_id ?? "").trim() || null;
    if (type === "gava") {
      const cf = session.custom_fields ?? [];
      for (const f of cf) {
        if (f.key === "recipient_name") recipientName = String(f.text?.value ?? "").trim() || recipientName;
        if (f.key === "greeting" && !greeting) greeting = String(f.text?.value ?? "").trim();
      }
    }
    if (greeting.length > 120) greeting = greeting.slice(0, 120);
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
      source: (type === "gava" ? "gift" : type === "manad" ? "monthly" : "web"), source_order_ref: orderRef,
      theme_id: themeId, greeting: greeting || null,
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
      const dateText = new Date(pur.data.created_at).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
      const locationName = (gen.data as any)?.location_name ?? null;
      const { subject, html } = renderThanksEmail({
        recipientName,
        treeCount: quantity,
        dateText,
        verificationId: vid,
        verifyUrl,
        locationName,
        giftMessage: greeting || null,
      });
      await sendEmail(custEmail, subject, html);
    }


    console.log("stripe-webhook ok", { session: session.id, type, quantity, vid, greeting: greeting ? "yes" : "no" });
    return new Response(JSON.stringify({ received: true, verification_id: vid }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("stripe-webhook handler error", (e as Error).message);
    return new Response("handler_error: " + (e as Error).message, { status: 500 });
  }
});
