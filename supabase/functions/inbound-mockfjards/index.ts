// inbound-mockfjards v2 — anonyma händelser från CaseFlow.
// Ingen persondata tas emot eller lagras från denna väg: kunden hämtar själv
// sitt värdebevis via /h/{kod} och lämnar samtycke direkt hos oss.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INBOUND_SECRET = Deno.env.get("SMARTKLIMAT_INBOUND_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
// smartklimat.org är verifierad hos Resend; send.smartklimat.org har status "failed".
const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "SmartKlimat <bevis@smartklimat.org>";

const APP_PUBLIC_URL = "https://app.smartklimat.org";
const PRICE_PER_TREE_ORE = 3500;
const SOURCE = "mockfjards";
const COMPANY_NAME = "SmartKlimatKompensera på Tellus AB (SmartKlimat)";
const COMPANY_ORGNR = "559370-9453";
const COMPANY_ADDRESS = "[ADRESS]";
const CLAIM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
function randomFrom(alphabet: string, len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendEmail(to: string, subject: string, html: string) {
  // Testadresser (@example.com) skickas aldrig på riktigt.
  if (to.toLowerCase().endsWith("@example.com")) {
    console.log("dry-run mail (testadress)", { to, subject });
    return { ok: true, dryRun: true, messageId: null, status: null, body: null };
  }
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY missing", { to, subject });
    return { ok: false, dryRun: false, messageId: null, status: null, body: "resend_api_key_missing" };
  }

  const payload = JSON.stringify({ from: RESEND_FROM, to, subject, html });
  // RESEND_API_KEY är en kopplingsnyckel: mailen går via Lovables Resend-gateway.
  // Direktanropet mot api.resend.com finns kvar som reserv.
  const attempts: Array<{ label: string; url: string; headers: Record<string, string> }> = [];
  if (LOVABLE_API_KEY) {
    attempts.push({
      label: "gateway",
      url: "https://connector-gateway.lovable.dev/resend/emails",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${LOVABLE_API_KEY}`,
        "x-connection-api-key": RESEND_API_KEY,
      },
    });
  }
  attempts.push({
    label: "direct",
    url: "https://api.resend.com/emails",
    headers: { "content-type": "application/json", authorization: `Bearer ${RESEND_API_KEY}` },
  });

  let last = { ok: false, dryRun: false, messageId: null as string | null, status: null as number | null, body: null as string | null };
  for (const attempt of attempts) {
    const res = await fetch(attempt.url, { method: "POST", headers: attempt.headers, body: payload });
    const text = await res.text();
    if (!res.ok) {
      console.error("Resend fail", { via: attempt.label, to, from: RESEND_FROM, subject, status: res.status, body: text });
      last = { ok: false, dryRun: false, messageId: null, status: res.status, body: text };
      continue;
    }
    let messageId: string | null = null;
    try {
      const parsed = JSON.parse(text) as { id?: string; data?: { id?: string } };
      messageId = parsed.id ?? parsed.data?.id ?? null;
    } catch { /* ignore */ }
    console.log("Resend ok", { via: attempt.label, to, from: RESEND_FROM, subject, messageId, body: text });
    return { ok: true, dryRun: false, messageId, status: res.status, body: text };
  }
  return last;
}


function legalFooter(revokeUrl: string): string {
  return `<div style="max-width:536px;margin:22px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:11.5px;line-height:1.6;color:#6E9483;text-align:center">
  <div>${esc(COMPANY_NAME)} · Org.nr ${esc(COMPANY_ORGNR)}</div>
  <div>${esc(COMPANY_ADDRESS)}</div>
  <div style="margin-top:8px">
    <a href="https://smartklimat.org/integritet" style="color:#15784F;text-decoration:underline">Integritetspolicy</a>
    &nbsp;·&nbsp;
    <a href="${esc(revokeUrl)}" style="color:#15784F;text-decoration:underline">Återkalla mitt samtycke</a>
  </div>
</div>`;
}

// Bevismail — identisk mall och sidfot som src/lib/email/claim-mails.server.ts.
function certMail(a: {
  recipientName: string; treeCount: number; verificationId: string;
  verifyUrl: string; revokeUrl: string; locationName?: string | null;
}) {
  const n = a.treeCount.toLocaleString("sv-SE");
  const subject = `${a.recipientName} — ditt värdebevis för ${n} träd`;
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" /><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:Helvetica,Arial,sans-serif;color:#0B3D2E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:26px 12px"><tr><td align="center">
<table role="presentation" width="536" cellpadding="0" cellspacing="0" style="max-width:536px;width:100%;background:#fff;border-radius:16px;border:1px solid #D9EBE0">
<tr><td style="padding:30px 28px;text-align:center">
  <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.26em;color:#15784F">SMARTKLIMAT · MOCKFJÄRDS</div>
  <h1 style="font-size:24px;margin:14px 0 10px;color:#0B3D2E">Tack, ${esc(a.recipientName)}.</h1>
  <p style="font-size:15px;line-height:1.6;color:#334E42;margin:0 0 6px">Dina <b>${n} träd</b> är planterade${a.locationName ? ` i ${esc(a.locationName)}` : ""} och ditt personliga värdebevis är nu utfärdat.</p>
  <p style="font-size:13px;color:#6E9483;margin:0 0 20px">Verifierings-id: <b>${esc(a.verificationId)}</b></p>
  <a href="${esc(a.verifyUrl)}" style="display:inline-block;background:#0B3D2E;color:#fff;text-decoration:none;padding:13px 28px;border-radius:24px;font-weight:bold;font-size:14px">Se ditt värdebevis</a>
</td></tr></table>
${legalFooter(a.revokeUrl)}
</td></tr></table></body></html>`;
  return { subject, html };
}


function updateMail(name: string, from: number, to: number, verifyUrl: string, revokeUrl: string) {
  const subject = `Dina ${from.toLocaleString("sv-SE")} träd har blivit ${to.toLocaleString("sv-SE")}`;
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" /><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:Helvetica,Arial,sans-serif;color:#0B3D2E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:26px 12px"><tr><td align="center">
<table role="presentation" width="536" cellpadding="0" cellspacing="0" style="max-width:536px;width:100%;background:#fff;border-radius:16px;border:1px solid #D9EBE0">
<tr><td style="padding:30px 28px;text-align:center">
  <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.26em;color:#15784F">SMARTKLIMAT · MOCKFJÄRDS</div>
  <h1 style="font-size:24px;margin:14px 0 10px">Dina ${from.toLocaleString("sv-SE")} träd har blivit ${to.toLocaleString("sv-SE")}.</h1>
  <p style="font-size:15px;line-height:1.6;color:#334E42;margin:0 0 20px">Hej ${esc(name)}! Fler träd har planterats i ditt namn och ditt värdebevis är uppdaterat.</p>
  <a href="${verifyUrl}" style="display:inline-block;background:#0B3D2E;color:#fff;text-decoration:none;padding:13px 28px;border-radius:24px;font-weight:bold;font-size:14px">Se ditt uppdaterade bevis</a>
</td></tr></table>
<div style="max-width:536px;margin:22px auto 0;font-size:11.5px;line-height:1.6;color:#6E9483;text-align:center">
  <div>${esc(COMPANY_NAME)} · Org.nr ${COMPANY_ORGNR}</div>
  <div>${esc(COMPANY_ADDRESS)}</div>
  <div style="margin-top:8px">
    <a href="https://smartklimat.org/integritet" style="color:#15784F;text-decoration:underline">Integritetspolicy</a>
    &nbsp;·&nbsp;
    <a href="${revokeUrl}" style="color:#15784F;text-decoration:underline">Återkalla mitt samtycke</a>
  </div>
</div>
</td></tr></table></body></html>`;
  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, reason: "method_not_allowed" });

  const provided = req.headers.get("x-smartklimat-secret") ?? "";
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const bySecret = !!INBOUND_SECRET && timingSafeEqual(provided, INBOUND_SECRET);
  const bearerMatchesEnv = !!SERVICE_KEY && bearer.length > 0 && timingSafeEqual(bearer, SERVICE_KEY);

  // Servernyckeln kan finnas i olika format (legacy JWT / sb_secret) mellan
  // körmiljöerna, så en nyckel som inte är identisk verifieras mot admin-API:t.
  async function isServiceRole(): Promise<boolean> {
    if (bearerMatchesEnv) return true;
    if (!bearer) return false;
    try {
      const probe = createClient(SUPABASE_URL, bearer, { auth: { persistSession: false } });
      const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
      return !error;
    } catch { return false; }
  }

  if (!bySecret && !(await isServiceRole())) return json(401, { ok: false, reason: "unauthorized" });

  // deno-lint-ignore no-explicit-any
  let p: any;
  try { p = await req.json(); } catch { return json(400, { ok: false, reason: "invalid_json" }); }

  // Bevismail-läge: endast service role-anrop (från hämtningsflödets serverfunktion).
  if (String(p?.action ?? "") === "send_claim_mail") {
    if (!(await isServiceRole())) return json(401, { ok: false, reason: "service_role_required" });

    const to = String(p?.to ?? "").trim().toLowerCase();
    const recipientName = String(p?.recipient_name ?? "").trim();
    const verificationId = String(p?.verification_id ?? "").trim();
    const revokeToken = String(p?.revoke_token ?? "").trim();
    const trees = Math.floor(Number(p?.tree_count ?? 0));
    if (!to || !recipientName || !verificationId || !revokeToken)
      return json(400, { ok: false, reason: "missing_fields" });
    const { subject, html } = certMail({
      recipientName, treeCount: trees, verificationId,
      verifyUrl: `${APP_PUBLIC_URL}/v/${verificationId}`,
      revokeUrl: `${APP_PUBLIC_URL}/api/public/aterkalla?t=${revokeToken}`,
      locationName: p?.location_name ? String(p.location_name) : null,
    });
    const sent = await sendEmail(to, subject, html);
    console.log("[send_claim_mail] resultat", { to, verificationId, ...sent });
    return json(sent.ok ? 200 : 502, { ok: sent.ok, ...sent, subject });
  }



  // Persondata ignoreras helt — endast dessa fält läses.
  const caseId = String(p?.case_id ?? "").trim();
  const eventType = String(p?.event_type ?? "").trim().toLowerCase();
  const treeCount = Math.floor(Number(p?.tree_count ?? 0));
  const seller = p?.seller ? String(p.seller).trim().slice(0, 120) : null;
  const eventRef = String(p?.event_ref ?? "").trim() || `${eventType}-${caseId}`;

  if (!caseId) return json(400, { ok: false, reason: "missing_case_id" });
  if (eventType !== "visit" && eventType !== "signing")
    return json(400, { ok: false, reason: "invalid_event_type" });
  if (!(treeCount >= 1 && treeCount <= 500))
    return json(400, { ok: false, reason: "tree_count_out_of_range" });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const verifyUrl = (vid: string) => `${APP_PUBLIC_URL}/v/${vid}`;
  const claimUrl = (code: string) => `${APP_PUBLIC_URL}/h/${code}`;

  const tpl = await db.from("cert_templates").select("id").eq("slug", "mockfjards").eq("aktiv", true).maybeSingle();
  if (tpl.error || !tpl.data) return json(500, { ok: false, reason: "mockfjards_template_missing" });

  // 1) Idempotens: logga händelsen; dubbletter räknas aldrig två gånger.
  const evt = await db.from("mockfjards_events")
    .insert({ case_id: caseId, event_type: eventType, event_ref: eventRef, tree_count: treeCount, seller })
    .select("id").maybeSingle();
  const isDuplicate = !!evt.error && String((evt.error as { code?: string }).code) === "23505";
  if (evt.error && !isDuplicate)
    return json(500, { ok: false, reason: "event_log_failed", detail: evt.error.message });

  const existing = await db.from("mockfjards_cases")
    .select("*").eq("case_id", caseId).maybeSingle();

  if (isDuplicate) {
    if (!existing.data) return json(200, { ok: true, duplicate: true, claim_url: null, verification_id: null, total_trees: 0 });
    return json(200, {
      ok: true, duplicate: true,
      claim_url: claimUrl(existing.data.claim_code),
      verification_id: existing.data.verification_id,
      total_trees: existing.data.total_trees,
    });
  }

  // 2a) Första händelsen för ärendet: skapa köp + bevis + hämtningskod.
  if (!existing.data) {
    const total = treeCount * PRICE_PER_TREE_ORE;
    const pur = await db.from("purchases").insert({
      user_id: null, customer_id: null,
      recipient_name: "", recipient_email: null,
      tree_count: treeCount, unit_price_ore: PRICE_PER_TREE_ORE, total_amount_ore: total,
      status: "paid", paid_at: new Date().toISOString(),
      registered_by_user_id: null, source: SOURCE, source_order_ref: caseId,
      source_seller: seller,
      certificate_template_id: tpl.data.id,
    }).select("id").single();
    if (pur.error) return json(500, { ok: false, reason: "purchase_insert_failed", detail: pur.error.message });

    const gen = await db.rpc("generate_certificate", { _purchase_id: pur.data.id });
    if (gen.error) return json(500, { ok: false, reason: "certificate_failed", detail: gen.error.message });
    // deno-lint-ignore no-explicit-any
    const row = Array.isArray(gen.data) ? (gen.data as any)[0] : (gen.data as any);
    const certId = row?.id as string;
    const vid = row?.verification_id as string;

    const cur = await db.from("certificates").select("template_snapshot").eq("id", certId).maybeSingle();
    await db.from("certificates").update({
      template_snapshot: {
        // deno-lint-ignore no-explicit-any
        ...(((cur.data as any)?.template_snapshot) ?? {}),
        partner: { name: "Mockfjärds Fönster", logo: "/brand/mockfjards-badge.png" },
      },
    }).eq("id", certId);

    let code = randomFrom(CLAIM_CODE_ALPHABET, 8);
    const revokeToken = randomFrom("abcdefghijklmnopqrstuvwxyz0123456789", 40);
    for (let attempt = 0; attempt < 5; attempt++) {
      const ins = await db.from("mockfjards_cases").insert({
        case_id: caseId, claim_code: code, purchase_id: pur.data.id, certificate_id: certId,
        verification_id: vid, total_trees: treeCount, seller, revoke_token: revokeToken,
      }).select("claim_code").maybeSingle();
      if (!ins.error) break;
      if (String((ins.error as { code?: string }).code) !== "23505")
        return json(500, { ok: false, reason: "case_insert_failed", detail: ins.error.message });
      code = randomFrom(CLAIM_CODE_ALPHABET, 8);
    }

    console.log("inbound-mockfjards created", { caseId, eventType, treeCount, vid });
    return json(200, { ok: true, claim_url: claimUrl(code), verification_id: vid, total_trees: treeCount });
  }

  // 2b) Senare händelse på samma ärende: öka trädantalet på samma bevis.
  const kase = existing.data;
  const prevTrees = kase.total_trees as number;
  const newTotal = prevTrees + treeCount;

  await db.from("purchases").update({
    tree_count: newTotal,
    total_amount_ore: newTotal * PRICE_PER_TREE_ORE,
  }).eq("id", kase.purchase_id);
  await db.from("certificates").update({ tree_count: newTotal }).eq("id", kase.certificate_id);
  await db.from("mockfjards_cases").update({
    total_trees: newTotal, seller: seller ?? kase.seller, updated_at: new Date().toISOString(),
  }).eq("case_id", caseId);

  // 3) Uppdateringsmail om ärendet redan är hämtat (inget nytt samtycke krävs).
  if (kase.claimed_at && kase.claim_email && !kase.revoked_at) {
    const supp = await db.from("email_suppression").select("email").eq("email", kase.claim_email).maybeSingle();
    if (!supp.data) {
      const revokeUrl = `${APP_PUBLIC_URL}/api/public/aterkalla?t=${kase.revoke_token}`;
      const { subject, html } = updateMail(
        String(kase.claim_name ?? ""), prevTrees, newTotal, verifyUrl(kase.verification_id), revokeUrl,
      );
      await sendEmail(kase.claim_email, subject, html);
    }
  }

  console.log("inbound-mockfjards updated", { caseId, eventType, treeCount, newTotal });
  return json(200, {
    ok: true, claim_url: claimUrl(kase.claim_code),
    verification_id: kase.verification_id, total_trees: newTotal,
  });
});
