import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { renderThanksEmail } from "../_shared/thanks-email.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "SmartKlimat <bevis@send.smartklimat.org>";
const RESEND_REPLY_TO = "hej@smartklimat.org";
const APP_PUBLIC_URL = (Deno.env.get("APP_PUBLIC_URL") ?? "https://app.smartklimat.org").replace(/\/+$/, "");
const PRICE_PER_TREE_ORE = 3500;


async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) { console.error("RESEND_API_KEY missing"); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html, reply_to: RESEND_REPLY_TO }),
  });
  if (!res.ok) { console.error("Resend fail", res.status, await res.text()); return false; }
  return true;
}

// LARM-flöde: logga in failed_purchases, larma hej@smartklimat.org (max 1 mail / 5 min).
async function recordFailure(db: any, sessionId: string, eventType: string, errorMessage: string) {
  try {
    // Upsert (unikt session_id) — öka attempts och uppdatera error/updated_at.
    const { data: existing } = await db.from("failed_purchases").select("id, attempts, alert_sent_at").eq("session_id", sessionId).maybeSingle();
    if (existing) {
      await db.from("failed_purchases").update({
        error: errorMessage,
        event_type: eventType,
        attempts: (existing.attempts ?? 1) + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await db.from("failed_purchases").insert({
        session_id: sessionId, error: errorMessage, event_type: eventType,
      });
    }

    // Throttla larmmailet: max ett mail per 5 minuter (globalt).
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: recent } = await db.from("failed_purchases")
      .select("id").gte("alert_sent_at", fiveMinAgo).limit(1);
    if (recent && recent.length > 0) {
      console.warn("failed_purchases alert throttled", { sessionId });
      return;
    }

    const subject = "LARM: betalning utan bevis";
    const html = `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;color:#111;">
      <h2 style="color:#b91c1c;">🚨 Betalning utan bevis</h2>
      <p>Stripe-webhooken misslyckades med att skapa ett bevis efter en betalning.</p>
      <table cellpadding="4" style="border-collapse:collapse;font-size:14px;">
        <tr><td><b>Session/Invoice-ID:</b></td><td><code>${sessionId}</code></td></tr>
        <tr><td><b>Event:</b></td><td>${eventType}</td></tr>
        <tr><td><b>Fel:</b></td><td><code>${errorMessage.replace(/</g, "&lt;")}</code></td></tr>
        <tr><td><b>Tid:</b></td><td>${new Date().toISOString()}</td></tr>
      </table>
      <p>Öppna adminpanelen → "Betalningar utan bevis" och kör "Försök igen".</p>
    </body></html>`;
    const ok = await sendEmail("hej@smartklimat.org", subject, html);
    if (ok) {
      // Markera senaste failed_purchase-raden för denna session som "alert skickat".
      await db.from("failed_purchases").update({ alert_sent_at: new Date().toISOString() })
        .eq("session_id", sessionId);
    }
  } catch (e) {
    console.error("recordFailure error", (e as Error).message);
  }
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
      const msg = (e as Error).message;
      console.error("stripe-webhook invoice.paid error", msg);
      await recordFailure(db, `invoice:${invoice.id}`, "invoice.paid", msg);
      return new Response("handler_error: " + msg, { status: 500 });
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

    // Schemalagd leverans: endast gåvor, framtida datum + separat mottagar-epost.
    const deliverAtRaw = String(md.deliver_at ?? "").trim();
    const recipientDeliveryEmail = String(md.recipient_delivery_email ?? "").trim().toLowerCase() || null;
    let deliverAt: Date | null = null;
    if (type === "gava" && deliverAtRaw && recipientDeliveryEmail) {
      const d = new Date(deliverAtRaw);
      if (!isNaN(d.getTime()) && d.getTime() > Date.now() + 60_000) deliverAt = d;
    }

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
    const locationName = (gen.data as any)?.location_name ?? null;

    // Temats kort-bild används som hero när köpets tema har en /kort/-asset.
    let heroImageUrl: string | null = null;
    if (themeId) {
      const th = await db.from("greeting_themes").select("config").eq("id", themeId).maybeSingle();
      const kort = (th.data?.config as any)?.kort as string | undefined;
      if (kort) heroImageUrl = kort.startsWith("http") ? kort : `${APP_PUBLIC_URL}${kort}`;
    }

    // Schemalagd gåva: markera cert som 'scheduled', skicka bekräftelse till köparen.
    if (vid && deliverAt) {
      const upd = await db.from("certificates").update({
        status: "scheduled",
        deliver_at: deliverAt.toISOString(),
        recipient_delivery_email: recipientDeliveryEmail,
        buyer_name_snapshot: buyerName || null,
      }).eq("verification_id", vid);
      if (upd.error) console.error("schedule_cert_update", upd.error.message);

      const dateText = deliverAt.toLocaleDateString("sv-SE", {
        year: "numeric", month: "long", day: "numeric", timeZone: "Europe/Stockholm",
      });
      const confHtml = `<!doctype html><html><body style="margin:0;padding:0;background:#EAF7EE;font-family:Helvetica,Arial,sans-serif;color:#0B3D2E;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:32px 24px;">
          <tr><td style="background:#fff;border-radius:16px;padding:28px;">
            <h1 style="font-size:22px;margin:0 0 12px 0;">Din gåva är planterad 🌳</h1>
            <p style="font-size:15px;line-height:1.55;color:#15784F;">Tack ${recipientName ? "" : ""}för att du planterade <b>${quantity} träd</b> som gåva till <b>${recipientDeliveryEmail}</b>.</p>
            <p style="font-size:15px;line-height:1.55;color:#15784F;">Beviset skickas automatiskt till mottagaren <b>${dateText} kl 08:00</b>.</p>
            <p style="font-size:13px;color:#4F6B5E;margin-top:20px;">Vill du ändra datum eller mottagare? Mejla <a href="mailto:hej@smartklimat.org" style="color:#15784F;">hej@smartklimat.org</a>.</p>
            <p style="font-size:13px;color:#4F6B5E;margin-top:16px;">Bevis-ID: ${vid}</p>
          </td></tr>
        </table></body></html>`;
      await sendEmail(custEmail, `Din gåva är planterad — beviset skickas ${dateText}`, confHtml);
    } else if (vid) {
      // Direkt-leverans: dagens flöde.
      const verifyUrl = `${APP_PUBLIC_URL}/v/${vid}`;
      const dateText = new Date(pur.data.created_at).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
      const { subject, html } = renderThanksEmail({
        recipientName,
        treeCount: quantity,
        dateText,
        verificationId: vid,
        verifyUrl,
        locationName,
        giftMessage: greeting || null,
        heroImageUrl,
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
