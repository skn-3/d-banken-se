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


// Godkänd Mockfjärds-bevismall — HÅLL I SYNK med src/lib/email/claim-mails.server.ts.
const BRICOLAGE = "'Bricolage Grotesque',Helvetica,Arial,sans-serif";
const BODY_FONT = "Helvetica,Arial,sans-serif";
const MONO = "'Courier New',monospace";
const STAMP_WHITE = "https://smartklimat.org/brand/logo-stamp-vit.png";
const MOCKFJARDS_BADGE = "https://smartklimat.org/brand/mockfjards-badge-vit.png";

interface Project {
  key: "khasi" | "copperbelt" | "pontal" | "generic";
  photo?: string;
  name: string;
  story: string;
  facts: string;
  link: string;
}

function resolveProject(locationName?: string | null): Project {
  const l = (locationName || "").toLowerCase();
  if (l.includes("khasi")) return {
    key: "khasi",
    photo: "https://smartklimat.org/projekt/kh-1.jpg",
    name: "Khasi Hills, Indien",
    story: "I Meghalayas molnskog — en av jordens våtaste platser — återställer 59 byar skogen som ger dem sitt vatten. Khasi är ett av världens få matrilinjära samhällen: kvinnorna bär projektet.",
    facts: "3 150 HA MOLNSKOG · 59 BYAR · MATRILINJÄRT SAMHÄLLE",
    link: "https://smartklimat.org/projekt/khasi-hills",
  };
  if (l.includes("copperbelt") || l.includes("zambia")) return {
    key: "copperbelt",
    photo: "https://smartklimat.org/projekt/cb-1.jpg",
    name: "Copperbelt, Zambia",
    story: "I miombobältet återställer över 800 småbrukarfamiljer skogen, gård för gård. Bikupor i trädkronorna gör den stående skogen mer värd än den fällda — och kronörnen har återvänt.",
    facts: "800+ FAMILJER · 70 TRÄDARTER · PREFERRED BY NATURE",
    link: "https://smartklimat.org/projekt/copperbelt",
  };
  if (l.includes("pontal") || l.includes("brasilien")) return {
    key: "pontal",
    photo: "https://smartklimat.org/projekt/po-3.jpg",
    name: "Pontal, Brasilien",
    story: "I Atlantskogen planteras korridorer som återkopplar reservaten — vandringsvägar för svart lejontamarin, jaguar och jättemyrslok. Mångfalden följs upp med ekoakustik och AI.",
    facts: "KORRIDORER FÖR 25+ ARTER · AI-FÖLJD MÅNGFALD · PARTNER: IPÊ",
    link: "https://smartklimat.org/projekt/pontal",
  };
  return {
    key: "generic",
    name: "Våra WeForest-projekt",
    story: "Era träd planteras i något av våra tre granskade projekt — molnskogen i Khasi Hills, miombon i Copperbelt eller vilddjurskorridorerna i Pontal.",
    facts: "TRE PROJEKT · TRE KONTINENTER · PREFERRED BY NATURE",
    link: "https://smartklimat.org/projekt",
  };
}

function whyRow(label: string, text: string, last = false) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${last ? "0" : "16px"};"><tr>
    <td width="16" valign="top" style="padding-top:6px;"><div style="width:6px;height:6px;border-radius:50%;background:#DCBE6E;"></div></td>
    <td style="padding-left:8px;">
      <div style="font-family:${MONO};font-weight:700;font-size:11px;letter-spacing:0.24em;color:#0B3D2E;text-transform:uppercase;">${label}</div>
      <div style="font-family:${BODY_FONT};font-size:14px;line-height:1.55;color:#52705F;margin-top:4px;">${text}</div>
    </td>
  </tr></table>`;
}

function addressRow(): string {
  const address = COMPANY_ADDRESS.trim();
  return address && address !== "[ADRESS]" ? `<div>${esc(address)}</div>` : "";
}

function legalFooter(revokeUrl: string): string {
  return `<tr><td align="center" style="padding:0 0 26px;font-family:${BODY_FONT};font-size:11.5px;line-height:1.6;color:#6E9483;">
  <div>${esc(COMPANY_NAME)} · Org.nr ${esc(COMPANY_ORGNR)}</div>
  ${addressRow()}
  <div style="margin-top:8px;">
    <a href="https://smartklimat.org/integritet" style="color:#15784F;text-decoration:underline;">Integritetspolicy</a>
    &nbsp;·&nbsp;
    <a href="${esc(revokeUrl)}" style="color:#15784F;text-decoration:underline;">Återkalla mitt samtycke</a>
  </div>
</td></tr>`;
}

function treesText(n: number): string {
  return n === 1 ? "ett träd" : `${n.toLocaleString("sv-SE")} träd`;
}

interface MailArgs {
  recipientName: string;
  treeCount: number;
  verificationId: string;
  verifyUrl: string;
  revokeUrl: string;
  locationName?: string | null;
  dateText?: string | null;
  previousTreeCount?: number | null;
}

function buildMail(a: MailArgs, mode: "cert" | "update"): { subject: string; html: string } {
  const proj = resolveProject(a.locationName);
  const N = a.treeCount.toLocaleString("sv-SE");
  const singular = a.treeCount === 1;
  const upperName = esc(a.recipientName.toUpperCase());
  const prev = Math.max(0, Math.floor(Number(a.previousTreeCount ?? 0)));
  const dateText = (a.dateText && a.dateText.trim())
    ? a.dateText
    : new Date().toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });

  const updateLine = prev === 1
    ? `Ert träd har blivit ${N}`
    : `Era ${prev.toLocaleString("sv-SE")} träd har blivit ${N}`;

  const subject = mode === "update"
    ? updateLine
    : (proj.key === "generic"
        ? (singular
            ? `${a.recipientName} — ert träd är planterat i ert namn`
            : `${a.recipientName} — era ${N} träd planterade i ert namn`)
        : (singular
            ? `${a.recipientName} — ert träd växer i ${proj.name}`
            : `${a.recipientName} — era ${N} träd växer i ${proj.name}`));

  const preheader = mode === "update"
    ? "Fler träd har planterats i ert namn — här är ert uppdaterade bevis."
    : "Ett träd för varje fönster. Här är ert bevis — och skogen det växer i.";

  const ownershipLabel = singular ? "TRÄD PLANTERAT I ERT NAMN" : "TRÄD PLANTERADE I ERT NAMN";
  const ctaLabel = mode === "update" ? "Visa ert uppdaterade bevis →" : "Visa och verifiera ert bevis →";

  const partnerRow = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto 0;"><tr>
        <td valign="middle" style="padding-right:10px;"><img src="${MOCKFJARDS_BADGE}" width="28" height="28" alt="" style="display:block;width:28px;height:28px;" /></td>
        <td valign="middle" style="font-family:${MONO};font-size:10px;letter-spacing:0.28em;color:#9FD9B6;text-transform:uppercase;">I SAMARBETE MED MOCKFJÄRDS FÖNSTER</td>
      </tr></table>`;

  const introText = mode === "update"
    ? `${esc(updateLine)} — ert värdebevis är uppdaterat med den nya totalen.`
    : `Mockfjärds Fönster har tillsammans med SmartKlimat planterat ${treesText(a.treeCount)} i ert namn.`;

  const contextBox = `<tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #D9EBE0;border-radius:14px;">
          <tr><td align="center" style="padding:16px 22px;font-family:${BODY_FONT};font-size:13px;line-height:1.55;color:#52705F;">${introText}</td></tr>
        </table>
      </td></tr>`;

  const projectPhoto = proj.photo
    ? `<tr><td style="padding:0 0 18px;"><img src="${proj.photo}" width="536" alt="${esc(proj.name)}" style="display:block;width:100%;max-width:536px;height:auto;border-radius:10px;" /></td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="sv"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(subject)}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:${BODY_FONT};color:#0B3D2E;">
<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B3D2E;border-radius:20px;overflow:hidden;">
          <tr><td align="center" style="padding:36px 28px 32px;">
            <img src="${STAMP_WHITE}" width="68" height="68" alt="" style="display:block;margin:0 auto 18px;width:68px;height:68px;" />
            <div style="font-family:${MONO};font-size:11px;letter-spacing:0.32em;color:#9FD9B6;text-transform:uppercase;">DITT TRÄD HAR FÅTT EN PLATS</div>
            <div style="margin-top:14px;font-family:${BRICOLAGE};font-weight:700;font-size:28px;line-height:1.2;color:#ffffff;">Tack, från ett gemensamt klimat.</div>
            ${partnerRow}
          </td></tr>
        </table>
      </td></tr>

      ${contextBox}

      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #D9EBE0;border-radius:18px;">
          <tr><td style="padding:32px 32px 28px;">
            <div style="text-align:center;font-family:${MONO};font-size:11px;letter-spacing:0.28em;color:#15784F;text-transform:uppercase;padding-bottom:20px;">TILL ${upperName}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;">
              <tr>
                <td width="40%" style="border-right:1px solid #DCBE6E;height:96px;">&nbsp;</td>
                <td align="center" style="font-family:${BRICOLAGE};font-weight:700;font-size:76px;line-height:1;color:#1E9E6A;padding:0 12px;">${N}</td>
                <td width="40%" style="border-left:1px solid #DCBE6E;height:96px;">&nbsp;</td>
              </tr>
            </table>
            <div style="text-align:center;font-family:${MONO};font-size:11px;letter-spacing:0.28em;color:#0B3D2E;text-transform:uppercase;margin-top:14px;">${ownershipLabel}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:26px 0 6px;">
              <a href="${esc(a.verifyUrl)}" style="display:inline-block;background:#1E9E6A;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-family:${BODY_FONT};font-weight:600;font-size:14px;">${ctaLabel}</a>
            </td></tr></table>
            <div style="text-align:center;font-family:${MONO};font-size:10px;letter-spacing:0.22em;color:#6E9483;text-transform:uppercase;margin-top:16px;">BEVIS ${esc(a.verificationId)} · ${esc(dateText)} · VIA MOCKFJÄRDS FÖNSTER</div>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF7EE;border-radius:22px;">
          <tr><td style="padding:9px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #D9EBE0;border-radius:15px;">
              <tr><td style="padding:22px 22px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${projectPhoto}
                  <tr><td style="font-family:${MONO};font-size:11px;letter-spacing:0.28em;color:#15784F;text-transform:uppercase;padding-bottom:6px;">${singular ? "ERT TRÄD VÄXER I" : "ERA TRÄD VÄXER I"}</td></tr>
                  <tr><td style="font-family:${BRICOLAGE};font-weight:700;font-size:24px;line-height:1.2;color:#0B3D2E;padding-bottom:12px;">${esc(proj.name)}</td></tr>
                  <tr><td style="font-family:${BODY_FONT};font-size:14px;line-height:1.6;color:#52705F;padding-bottom:18px;">${esc(proj.story)}</td></tr>
                  <tr><td style="border-top:1px solid #DCBE6E;font-size:0;line-height:0;">&nbsp;</td></tr>
                  <tr><td style="font-family:${MONO};font-size:11px;letter-spacing:0.22em;color:#6E9483;text-transform:uppercase;padding:14px 0 14px;">${esc(proj.facts)}</td></tr>
                  <tr><td><a href="${proj.link}" style="font-family:${BODY_FONT};font-weight:700;font-size:14px;color:#15784F;text-decoration:none;">Läs om projektet →</a></td></tr>
                </table>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF7EE;border-radius:20px;">
          <tr><td style="padding:26px 28px;">
            ${whyRow("KLIMAT", "Ett växande träd binder ungefär 20 kg koldioxid — varje år, i decennier.")}
            ${whyRow("MÄNNISKOR", "Skogen är inkomst: biodlaren Alfred tar en sjättedel av familjens kontantinkomst ur kupor i trädkronorna.")}
            ${whyRow("MÅNGFALD", "Tamarinen syns i kamerafällorna igen. Kronörnen är tillbaka.")}
            ${whyRow("TECH", "Varje träd är en rad i vårt system — planterat, tidsstämplat, spårbart.", true)}
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 0 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B3D2E;border-radius:20px;">
          <tr><td align="center" style="padding:30px 28px;">
            <div style="font-family:${BRICOLAGE};font-weight:700;font-size:22px;color:#ffffff;">Vill du plantera fler?</div>
            <div style="margin-top:10px;font-family:${MONO};font-size:13px;color:#9FD9B6;"><a href="https://smartklimat.org/plantera" style="color:#9FD9B6;text-decoration:none;">smartklimat.org/plantera</a></div>
          </td></tr>
        </table>
      </td></tr>

      <tr><td align="center" style="padding:18px 0 6px;font-family:${BODY_FONT};font-size:12px;color:#6E9483;">Tänk smart, vi har ett gemensamt klimat.</td></tr>
      <tr><td align="center" style="padding:0 0 14px;font-family:${MONO};font-size:11px;color:#6E9483;letter-spacing:0.08em;">SmartKlimat · Stockholm</td></tr>
      ${legalFooter(a.revokeUrl)}

    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject, html };
}

function certMail(a: MailArgs) {
  return buildMail(a, "cert");
}

function updateMail(name: string, fromCount: number, toCount: number, verificationId: string, verifyUrl: string, revokeUrl: string, locationName?: string | null) {
  return buildMail({
    recipientName: name,
    treeCount: toCount,
    previousTreeCount: fromCount,
    verificationId,
    verifyUrl,
    revokeUrl,
    locationName: locationName ?? null,
  }, "update");
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
      const certRow = await db.from("certificates").select("location_name").eq("id", kase.certificate_id).maybeSingle();
      const { subject, html } = updateMail(
        String(kase.claim_name ?? ""), prevTrees, newTotal, kase.verification_id, verifyUrl(kase.verification_id), revokeUrl,
        (certRow.data?.location_name as string | null) ?? null,
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
