import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { renderNewsletterEmail } from "../_shared/newsletter-email.ts";
import { signEmail } from "../_shared/hmac.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const UNSUB_SECRET = Deno.env.get("SMARTKLIMAT_UNSUBSCRIBE_SECRET") ?? "";
const APP_PUBLIC_URL = (Deno.env.get("APP_PUBLIC_URL") ?? "https://smartklimat.org").replace(/\/+$/, "");
const FROM = "SmartKlimat <hej@send.smartklimat.org>";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

type AudienceKind = "all" | "manad" | "source" | "project";
interface Payload {
  subject: string;
  headline: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  audience: { kind: AudienceKind; value?: string | null };
  mode: "preview" | "count" | "send";
  testEmail?: string | null;
}

async function requireAdmin(req: Request): Promise<{ userId: string; email: string } | Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return new Response("unauthorized", { status: 401, headers: cors });
  const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData } = await asUser.auth.getUser();
  if (!userData?.user) return new Response("unauthorized", { status: 401, headers: cors });
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: role } = await db
    .from("user_roles").select("role")
    .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
  if (!role) return new Response("forbidden", { status: 403, headers: cors });
  return { userId: userData.user.id, email: userData.user.email ?? "" };
}

async function resolveRecipients(
  db: ReturnType<typeof createClient>,
  audience: Payload["audience"],
): Promise<string[]> {
  // Buyer emails come from customers.email joined via purchases.customer_id.
  // Never use recipient_email (gift recipient).
  let query = db.from("purchases")
    .select("customer_id, source, certificates(location_name)")
    .eq("status", "paid");

  if (audience.kind === "manad") {
    query = query.or("source.eq.stripe-manad,source.ilike.stripe:manad%");
  } else if (audience.kind === "source" && audience.value) {
    query = query.eq("source", audience.value);
  }

  const { data: rows, error } = await query.limit(50000);
  if (error) throw new Error("purchase_query: " + error.message);

  const customerIds = new Set<string>();
  for (const r of rows ?? []) {
    if (audience.kind === "project" && audience.value) {
      // deno-lint-ignore no-explicit-any
      const loc = (r as any).certificates?.[0]?.location_name ?? (r as any).certificates?.location_name;
      if (loc !== audience.value) continue;
    }
    // deno-lint-ignore no-explicit-any
    if ((r as any).customer_id) customerIds.add((r as any).customer_id);
  }
  if (!customerIds.size) return [];

  const { data: custs, error: cErr } = await db
    .from("customers").select("email")
    .in("id", Array.from(customerIds));
  if (cErr) throw new Error("customers_query: " + cErr.message);

  const emails = new Set<string>();
  for (const c of custs ?? []) {
    // deno-lint-ignore no-explicit-any
    const e = String((c as any).email ?? "").trim().toLowerCase();
    if (e) emails.add(e);
  }

  // Exclude suppressed
  const { data: sup } = await db.from("email_suppression").select("email");
  for (const s of sup ?? []) {
    // deno-lint-ignore no-explicit-any
    emails.delete(String((s as any).email ?? "").toLowerCase());
  }
  return Array.from(emails);
}

async function sendBatch(items: Array<{ to: string; subject: string; html: string }>) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");
  const body = items.map((x) => ({ from: FROM, to: [x.to], subject: x.subject, html: x.html }));
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`resend_batch ${res.status}: ${t}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405, headers: cors });

  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;

  let payload: Payload;
  try { payload = await req.json(); }
  catch { return new Response("bad_json", { status: 400, headers: cors }); }

  if (!payload.subject || !payload.headline || !payload.body || !payload.audience) {
    return new Response("missing_fields", { status: 400, headers: cors });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    if (payload.mode === "count") {
      const rec = await resolveRecipients(db, payload.audience);
      return new Response(JSON.stringify({ recipient_count: rec.length }), {
        status: 200, headers: { ...cors, "content-type": "application/json" },
      });
    }

    if (payload.mode === "preview") {
      const to = payload.testEmail || gate.email;
      if (!to) return new Response("missing_test_email", { status: 400, headers: cors });
      const sig = await signEmail(to, UNSUB_SECRET);
      const unsub = `${APP_PUBLIC_URL}/api/public/unsubscribe?e=${encodeURIComponent(to)}&t=${sig}`;
      const html = renderNewsletterEmail({
        subject: payload.subject,
        headline: payload.headline,
        body: payload.body,
        ctaLabel: payload.ctaLabel ?? null,
        ctaUrl: payload.ctaUrl ?? null,
        recipientEmail: to,
        unsubscribeUrl: unsub,
      });
      await sendBatch([{ to, subject: `[TEST] ${payload.subject}`, html }]);
      return new Response(JSON.stringify({ ok: true, test_to: to }), {
        status: 200, headers: { ...cors, "content-type": "application/json" },
      });
    }

    // mode === "send"
    const recipients = await resolveRecipients(db, payload.audience);
    if (!recipients.length) {
      return new Response(JSON.stringify({ ok: true, recipient_count: 0 }), {
        status: 200, headers: { ...cors, "content-type": "application/json" },
      });
    }

    // Build all messages
    const messages: Array<{ to: string; subject: string; html: string }> = [];
    for (const to of recipients) {
      const sig = await signEmail(to, UNSUB_SECRET);
      const unsub = `${APP_PUBLIC_URL}/api/public/unsubscribe?e=${encodeURIComponent(to)}&t=${sig}`;
      const html = renderNewsletterEmail({
        subject: payload.subject,
        headline: payload.headline,
        body: payload.body,
        ctaLabel: payload.ctaLabel ?? null,
        ctaUrl: payload.ctaUrl ?? null,
        recipientEmail: to,
        unsubscribeUrl: unsub,
      });
      messages.push({ to, subject: payload.subject, html });
    }

    // Send in batches of 100 (Resend batch limit)
    const chunkSize = 100;
    for (let i = 0; i < messages.length; i += chunkSize) {
      await sendBatch(messages.slice(i, i + chunkSize));
    }

    // Log
    await db.from("newsletters").insert({
      subject: payload.subject,
      audience_kind: payload.audience.kind,
      audience_value: payload.audience.value ?? null,
      headline: payload.headline,
      body: payload.body,
      cta_label: payload.ctaLabel ?? null,
      cta_url: payload.ctaUrl ?? null,
      recipient_count: recipients.length,
      sent_by: gate.userId,
    });
    await db.from("admin_activity").insert({
      user_id: gate.userId,
      action: "newsletter_send",
      detail: {
        subject: payload.subject,
        audience: payload.audience,
        recipient_count: recipients.length,
      },
    });

    return new Response(JSON.stringify({ ok: true, recipient_count: recipients.length }), {
      status: 200, headers: { ...cors, "content-type": "application/json" },
    });
  } catch (e) {
    console.error("send-newsletter error", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
});
