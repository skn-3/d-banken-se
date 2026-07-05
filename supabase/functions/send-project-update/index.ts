import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { renderProjectUpdateEmail } from "../_shared/project-update-email.ts";
import { signEmail } from "../_shared/hmac.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const UNSUB_SECRET = Deno.env.get("SMARTKLIMAT_UNSUBSCRIBE_SECRET") ?? "";
const APP_PUBLIC_URL = (Deno.env.get("APP_PUBLIC_URL") ?? "https://smartklimat.org").replace(/\/+$/, "");
const FROM = "SmartKlimat <uppdateringar@send.smartklimat.org>";

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
  imageUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  audience: { kind: AudienceKind; value?: string | null };
  mode: "preview" | "count" | "send";
  testEmail?: string | null;
}

interface Recipient {
  email: string;
  name: string;
  trees: number;
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
): Promise<Recipient[]> {
  // Target = every certificate holder with an email address (buyer OR gift recipient).
  let q = db.from("purchases")
    .select("tree_count, source, recipient_email, recipient_name, customer_id, certificates!inner(location_name)")
    .eq("status", "paid");

  if (audience.kind === "manad") {
    q = q.or("source.eq.stripe-manad,source.ilike.stripe:manad%");
  } else if (audience.kind === "source" && audience.value) {
    q = q.eq("source", audience.value);
  }
  if (audience.kind === "project" && audience.value) {
    q = q.eq("certificates.location_name", audience.value);
  }

  const { data: rows, error } = await q.limit(50000);
  if (error) throw new Error("purchase_query: " + error.message);

  // Fetch customers we need
  const custIds = new Set<string>();
  for (const r of rows ?? []) {
    // deno-lint-ignore no-explicit-any
    const rr = r as any;
    if (!rr.recipient_email && rr.customer_id) custIds.add(rr.customer_id);
  }
  const custMap = new Map<string, { email: string; name: string }>();
  if (custIds.size) {
    const { data: cs } = await db.from("customers").select("id, email, name").in("id", Array.from(custIds));
    for (const c of cs ?? []) {
      // deno-lint-ignore no-explicit-any
      const cc = c as any;
      custMap.set(cc.id, { email: String(cc.email ?? "").trim().toLowerCase(), name: cc.name ?? "" });
    }
  }

  const acc = new Map<string, Recipient>();
  for (const r of rows ?? []) {
    // deno-lint-ignore no-explicit-any
    const rr = r as any;
    let email = String(rr.recipient_email ?? "").trim().toLowerCase();
    let name = rr.recipient_name ?? "";
    if (!email && rr.customer_id) {
      const c = custMap.get(rr.customer_id);
      if (c?.email) { email = c.email; if (!name) name = c.name; }
    }
    if (!email) continue;
    const prev = acc.get(email);
    if (prev) {
      prev.trees += Number(rr.tree_count ?? 0);
      if (!prev.name && name) prev.name = name;
    } else {
      acc.set(email, { email, name: name || "du", trees: Number(rr.tree_count ?? 0) });
    }
  }

  // Exclude suppressed
  const { data: sup } = await db.from("email_suppression").select("email");
  for (const s of sup ?? []) {
    // deno-lint-ignore no-explicit-any
    acc.delete(String((s as any).email ?? "").toLowerCase());
  }
  return Array.from(acc.values());
}

function fill(template: string, name: string, count: number): string {
  return template
    .replaceAll("{namn}", name || "du")
    .replaceAll("{antal}", count.toLocaleString("sv-SE"));
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
      const to = gate.email;
      if (!to) return new Response("missing_test_email", { status: 400, headers: cors });
      const sig = await signEmail(to, UNSUB_SECRET);
      const unsub = `${APP_PUBLIC_URL}/api/public/unsubscribe?e=${encodeURIComponent(to)}&t=${sig}`;
      const name = "Test";
      const count = 12;
      const html = renderProjectUpdateEmail({
        subject: fill(payload.subject, name, count),
        headline: fill(payload.headline, name, count),
        body: fill(payload.body, name, count),
        imageUrl: payload.imageUrl ?? null,
        ctaLabel: payload.ctaLabel ?? null,
        ctaUrl: payload.ctaUrl ?? null,
        recipientEmail: to,
        unsubscribeUrl: unsub,
      });
      await sendBatch([{ to, subject: `[TEST] ${fill(payload.subject, name, count)}`, html }]);
      return new Response(JSON.stringify({ ok: true, test_to: to }), {
        status: 200, headers: { ...cors, "content-type": "application/json" },
      });
    }

    // send
    const recipients = await resolveRecipients(db, payload.audience);
    if (!recipients.length) {
      return new Response(JSON.stringify({ ok: true, recipient_count: 0 }), {
        status: 200, headers: { ...cors, "content-type": "application/json" },
      });
    }

    const messages: Array<{ to: string; subject: string; html: string }> = [];
    for (const r of recipients) {
      const sig = await signEmail(r.email, UNSUB_SECRET);
      const unsub = `${APP_PUBLIC_URL}/api/public/unsubscribe?e=${encodeURIComponent(r.email)}&t=${sig}`;
      const subj = fill(payload.subject, r.name, r.trees);
      const html = renderProjectUpdateEmail({
        subject: subj,
        headline: fill(payload.headline, r.name, r.trees),
        body: fill(payload.body, r.name, r.trees),
        imageUrl: payload.imageUrl ?? null,
        ctaLabel: payload.ctaLabel ?? null,
        ctaUrl: payload.ctaUrl ?? null,
        recipientEmail: r.email,
        unsubscribeUrl: unsub,
      });
      messages.push({ to: r.email, subject: subj, html });
    }

    const chunkSize = 100;
    for (let i = 0; i < messages.length; i += chunkSize) {
      await sendBatch(messages.slice(i, i + chunkSize));
    }

    await db.from("project_updates").insert({
      subject: payload.subject,
      headline: payload.headline,
      body: payload.body,
      image_url: payload.imageUrl ?? null,
      cta_label: payload.ctaLabel ?? null,
      cta_url: payload.ctaUrl ?? null,
      audience_kind: payload.audience.kind,
      audience_value: payload.audience.value ?? null,
      recipient_count: recipients.length,
      sent_by: gate.userId,
    });
    await db.from("admin_activity").insert({
      user_id: gate.userId,
      action: "project_update_send",
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
    console.error("send-project-update error", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
});
