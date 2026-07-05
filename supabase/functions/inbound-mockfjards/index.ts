import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INBOUND_SECRET = Deno.env.get("SMARTKLIMAT_INBOUND_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "SmartKlimat <onboarding@resend.dev>";
const APP_PUBLIC_URL = "https://smartklimat.org";
const PRICE_PER_TREE_ORE = 3500;
const SOURCE = "mockfjards";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < ab.length; i++) out |= ab[i] ^ bb[i];
  return out === 0;
}
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function esc(s: string) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c] as string));
}

function renderThanksEmail(a: { recipientName: string; treeCount: number; dateText: string; verificationId: string; verifyUrl: string }) {
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
  if (req.method !== "POST") return json(405, { ok: false, reason: "method_not_allowed" });

  const provided = req.headers.get("x-smartklimat-secret") ?? "";
  if (!INBOUND_SECRET || !timingSafeEqual(provided, INBOUND_SECRET))
    return json(401, { ok: false, reason: "unauthorized" });

  let p: any;
  try { p = await req.json(); } catch { return json(400, { ok: false, reason: "invalid_json" }); }

  const orderNumber = String(p?.order_number ?? "").trim();
  const treeCount = Math.floor(Number(p?.tree_count ?? 0));
  const customerName = String(p?.customer_name ?? "").trim();
  const recipientEmail = p?.recipient_email ? String(p.recipient_email).trim().toLowerCase() : null;
  const sellerName = p?.seller_name ? String(p.seller_name).trim() : null;

  if (!orderNumber) return json(400, { ok: false, reason: "missing_order_number" });
  if (!customerName) return json(400, { ok: false, reason: "missing_customer_name" });
  if (!(treeCount >= 1 && treeCount <= 500))
    return json(400, { ok: false, reason: "tree_count_out_of_range" });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const verifyUrl = (vid: string) => `${APP_PUBLIC_URL}/v/${vid}`;

  // 1) Idempotens på (source, order_number)
  const existing = await db
    .from("purchases").select("id")
    .eq("source", SOURCE).eq("source_order_ref", orderNumber)
    .maybeSingle();
  if (existing.data) {
    const cert = await db.from("certificates").select("verification_id").eq("purchase_id", existing.data.id).maybeSingle();
    const vid = cert.data?.verification_id ?? null;
    return json(200, { ok: true, verification_id: vid, url: vid ? verifyUrl(vid) : null });
  }

  // 2) Upsert kund — email är valfritt; hitta befintlig per namn+email om email finns
  let customerId: string;
  if (recipientEmail) {
    const ec = await db.from("customers").select("id, name").eq("email", recipientEmail).maybeSingle();
    if (ec.data) {
      customerId = ec.data.id;
      if (ec.data.name !== customerName)
        await db.from("customers").update({ name: customerName, updated_at: new Date().toISOString() }).eq("id", customerId);
    } else {
      const ins = await db.from("customers").insert({ email: recipientEmail, name: customerName }).select("id").single();
      if (ins.error) return json(500, { ok: false, reason: "customer_insert_failed", detail: ins.error.message });
      customerId = ins.data.id;
    }
  } else {
    // Ingen email: skapa en anonym kund per köp
    const ins = await db.from("customers").insert({ email: `mockfjards+${orderNumber}@no-reply.smartklimat.org`, name: customerName }).select("id").single();
    if (ins.error) return json(500, { ok: false, reason: "customer_insert_failed", detail: ins.error.message });
    customerId = ins.data.id;
  }

  // 3) Skapa purchase
  const total = treeCount * PRICE_PER_TREE_ORE;
  const pur = await db.from("purchases").insert({
    user_id: null, customer_id: customerId,
    recipient_name: customerName, recipient_email: recipientEmail,
    tree_count: treeCount, unit_price_ore: PRICE_PER_TREE_ORE, total_amount_ore: total,
    status: "paid", paid_at: new Date().toISOString(),
    registered_by_user_id: null, source: SOURCE, source_order_ref: orderNumber,
    source_seller: sellerName,
  }).select("id, created_at").single();

  if (pur.error) {
    if ((pur.error as any).code === "23505") {
      const ex2 = await db.from("purchases").select("id").eq("source", SOURCE).eq("source_order_ref", orderNumber).maybeSingle();
      const cert = ex2.data ? await db.from("certificates").select("verification_id").eq("purchase_id", ex2.data.id).maybeSingle() : { data: null } as any;
      const vid = cert.data?.verification_id ?? null;
      return json(200, { ok: true, verification_id: vid, url: vid ? verifyUrl(vid) : null });
    }
    return json(500, { ok: false, reason: "purchase_insert_failed", detail: pur.error.message });
  }

  // 4) Generera värdebevis
  const gen = await db.rpc("generate_certificate", { _purchase_id: pur.data.id });
  if (gen.error) return json(500, { ok: false, reason: "certificate_failed", detail: gen.error.message });
  const vid = (gen.data as any)?.verification_id ?? null;

  // 5) Mail — endast om recipient_email finns
  if (vid && recipientEmail) {
    const dateText = new Date(pur.data.created_at).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
    const { subject, html } = renderThanksEmail({
      recipientName: customerName, treeCount, dateText,
      verificationId: vid, verifyUrl: verifyUrl(vid),
    });
    await sendEmail(recipientEmail, subject, html);
  }

  console.log("inbound-mockfjards ok", { orderNumber, treeCount, vid, emailed: !!recipientEmail });
  return json(200, { ok: true, verification_id: vid, url: vid ? verifyUrl(vid) : null });
});
