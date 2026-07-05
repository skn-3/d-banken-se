// Server-only: never import from client code.
const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_GATEWAY_URL = "https://connector-gateway.lovable.dev/resend/emails";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface SendEmailResult {
  ok: boolean;
  provider: "resend" | "lovable-resend-gateway" | "none";
  status: number | null;
  body: string | null;
  messageId?: string | null;
  error?: string;
  skipped?: boolean;
}

export const AUTH_EMAIL_FROM = "Smaarty <konto@send.smartklimat.org>";
const SMARTKLIMAT_STAMP_WHITE = "https://smartklimat.org/brand/logo-stamp-vit.png";

function extractMessageId(body: string | null) {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { id?: unknown; data?: { id?: unknown } };
    return typeof parsed.id === "string" ? parsed.id : typeof parsed.data?.id === "string" ? parsed.data.id : null;
  } catch {
    return null;
  }
}

function summarizeBody(body: string | null) {
  if (!body) return null;
  return body.length > 4000 ? `${body.slice(0, 4000)}…[truncated]` : body;
}

export async function sendEmail({ to, subject, html, from: fromOverride }: SendArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const result: SendEmailResult = { ok: false, provider: "none", status: null, body: null, skipped: true, error: "RESEND_API_KEY missing" };
    console.error("[Resend] RESEND_API_KEY missing in server runtime", { to, subject, from: fromOverride ?? null, result });
    return result;
  }

  const from = fromOverride || process.env.RESEND_FROM_EMAIL || "SmartKlimat <onboarding@resend.dev>";

  const payload = { from, to, subject, html };
  const gatewayKey = process.env.LOVABLE_API_KEY;

  if (gatewayKey) {
    const gatewayRes = await fetch(RESEND_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gatewayKey}`,
        "X-Connection-Api-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });
    const gatewayBody = await gatewayRes.text();
    const gatewayResult: SendEmailResult = {
      ok: gatewayRes.ok,
      provider: "lovable-resend-gateway",
      status: gatewayRes.status,
      body: summarizeBody(gatewayBody),
      messageId: extractMessageId(gatewayBody),
      ...(!gatewayRes.ok ? { error: gatewayBody || `Gateway send failed ${gatewayRes.status}` } : {}),
    };
    console[gatewayRes.ok ? "log" : "error"]("[Resend] gateway response", {
      to,
      from,
      subject,
      status: gatewayResult.status,
      body: gatewayResult.body,
      messageId: gatewayResult.messageId,
    });
    return gatewayResult;
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  const result: SendEmailResult = {
    ok: res.ok,
    provider: "resend",
    status: res.status,
    body: summarizeBody(text),
    messageId: extractMessageId(text),
    ...(!res.ok ? { error: text || `Resend send failed ${res.status}` } : {}),
  };

  if (!res.ok) {
    console.error("[Resend] direct response", { to, from, subject, status: result.status, body: result.body });
    return result;
  }
  console.log("[Resend] direct response", { to, from, subject, status: result.status, body: result.body, messageId: result.messageId });
  return result;
}

interface AuthEmailArgs {
  actionUrl: string;
}

export function renderAuthResetEmail({ actionUrl }: AuthEmailArgs): { subject: string; html: string } {
  return renderAuthShell({
    subject: "Återställ ditt lösenord — Smaarty",
    title: "Glömt lösenordet?",
    body: "Ingen fara — tryck på knappen så väljer du ett nytt. Länken gäller i en timme.",
    cta: "Välj nytt lösenord",
    hint: "Bad du inte om detta? Ignorera mailet, inget händer.",
    actionUrl,
  });
}

export function renderAuthSignupEmail({ actionUrl }: AuthEmailArgs): { subject: string; html: string } {
  return renderAuthShell({
    subject: "Bekräfta ditt konto — Smaarty",
    title: "Bekräfta ditt konto",
    body: "Ett tryck så är du igång — välkommen till laget!",
    cta: "Bekräfta kontot",
    hint: "Bad du inte om detta? Ignorera mailet, inget händer.",
    actionUrl,
  });
}

function renderAuthShell(a: {
  subject: string;
  title: string;
  body: string;
  cta: string;
  hint: string;
  actionUrl: string;
}): { subject: string; html: string } {
  const html = `<div style="background:#F4FAF5;padding:32px 16px;font-family:Arial,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#0B3D2E;border-radius:16px 16px 0 0;padding:28px;text-align:center">
    <img src="${SMARTKLIMAT_STAMP_WHITE}" width="48" alt="SmartKlimat">
    <p style="color:#9FD9B6;font-family:monospace;font-size:11px;letter-spacing:3px;margin:12px 0 0">S M A A R T Y</p>
  </div>
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:0 0 16px 16px;padding:28px;text-align:center">
    <h1 style="color:#0B3D2E;font-size:20px;margin:0 0 8px">${escapeHtml(a.title)}</h1>
    <p style="color:#3D5648;font-size:14px;line-height:1.6;margin:0 0 20px">${escapeHtml(a.body)}</p>
    <a href="${a.actionUrl}" style="display:inline-block;background:#1E9E6A;color:#fff;text-decoration:none;padding:12px 28px;border-radius:24px;font-weight:bold;font-size:14px">${escapeHtml(a.cta)}</a>
    <p style="color:#6E9483;font-size:12px;margin:20px 0 0">${escapeHtml(a.hint)}</p>
  </div>
</div>`;
  return { subject: a.subject, html };
}

interface ThanksArgs {
  recipientName: string;
  recipientEmail: string;
  treeCount: number;
  totalKr: string;
  dateText: string;
  verificationId: string;
  verifyUrl: string;
  locationName?: string | null;
  giftMessage?: string | null;
  heroStampUrl?: string | null;
}

export function renderThanksEmail(a: ThanksArgs): { subject: string; html: string } {
  return buildThanksEmail(a);
}

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
  if (l.includes("khasi")) {
    return {
      key: "khasi",
      photo: "https://smartklimat.org/projekt/kh-1.jpg",
      name: "Khasi Hills, Indien",
      story: "I Meghalayas molnskog — en av jordens våtaste platser — återställer 59 byar skogen som ger dem sitt vatten. Khasi är ett av världens få matrilinjära samhällen: kvinnorna bär projektet.",
      facts: "3 150 HA MOLNSKOG · 59 BYAR · MATRILINJÄRT SAMHÄLLE",
      link: "https://smartklimat.org/projekt/khasi-hills",
    };
  }
  if (l.includes("copperbelt") || l.includes("zambia")) {
    return {
      key: "copperbelt",
      photo: "https://smartklimat.org/projekt/cb-1.jpg",
      name: "Copperbelt, Zambia",
      story: "I miombobältet återställer över 800 småbrukarfamiljer skogen, gård för gård. Bikupor i trädkronorna gör den stående skogen mer värd än den fällda — och kronörnen har återvänt.",
      facts: "800+ FAMILJER · 70 TRÄDARTER · PREFERRED BY NATURE",
      link: "https://smartklimat.org/projekt/copperbelt",
    };
  }
  if (l.includes("pontal") || l.includes("brasilien")) {
    return {
      key: "pontal",
      photo: "https://smartklimat.org/projekt/po-3.jpg",
      name: "Pontal, Brasilien",
      story: "I Atlantskogen planteras korridorer som återkopplar reservaten — vandringsvägar för svart lejontamarin, jaguar och jättemyrslok. Mångfalden följs upp med ekoakustik och AI.",
      facts: "KORRIDORER FÖR 25+ ARTER · AI-FÖLJD MÅNGFALD · PARTNER: IPÊ",
      link: "https://smartklimat.org/projekt/pontal",
    };
  }
  return {
    key: "generic",
    name: "Våra WeForest-projekt",
    story: "Dina träd planteras i något av våra tre granskade projekt — molnskogen i Khasi Hills, miombon i Copperbelt eller vilddjurskorridorerna i Pontal.",
    facts: "TRE PROJEKT · TRE KONTINENTER · PREFERRED BY NATURE",
    link: "https://smartklimat.org/projekt",
  };
}

export function buildThanksEmail(a: ThanksArgs): { subject: string; html: string } {
  const proj = resolveProject(a.locationName);
  const N = a.treeCount.toLocaleString("sv-SE");
  const nameHtml = escapeHtml(a.recipientName);
  const upperName = escapeHtml(a.recipientName.toUpperCase());
  const subject = proj.key === "generic"
    ? `${a.recipientName} — ${N} träd planterade i ditt namn`
    : `${a.recipientName} — dina ${N} träd växer i ${proj.name}`;

  const stampWhite = a.heroStampUrl && a.heroStampUrl.trim() ? a.heroStampUrl : "https://smartklimat.org/brand/logo-stamp-vit.png";
  const bricolage = "'Bricolage Grotesque',Helvetica,Arial,sans-serif";
  const body = "Helvetica,Arial,sans-serif";
  const mono = "'Courier New',monospace";

  const greetingBlock = a.giftMessage && a.giftMessage.trim()
    ? `<tr><td style="padding:0 0 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF7EE;border-radius:14px;"><tr><td style="padding:16px 20px;font-family:${body};font-style:italic;font-size:15px;line-height:1.5;color:#15784F;">${escapeHtml(a.giftMessage)}</td></tr></table></td></tr>`
    : "";

  const projectPhoto = proj.photo
    ? `<tr><td style="padding:0 0 18px;"><img src="${proj.photo}" width="536" alt="${escapeHtml(proj.name)}" style="display:block;width:100%;max-width:536px;height:auto;border-radius:10px;" /></td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="sv"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(subject)}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:${body};color:#0B3D2E;">
<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">Berättelsen om skogen dina träd blir en del av.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- A: HERO -->
      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B3D2E;border-radius:20px;">
          <tr><td align="center" style="padding:36px 28px 32px;">
            <img src="${stampWhite}" width="68" height="68" alt="" style="display:block;margin:0 auto 18px;width:68px;height:68px;" />
            <div style="font-family:${mono};font-size:11px;letter-spacing:0.32em;color:#9FD9B6;text-transform:uppercase;">DITT TRÄD HAR FÅTT EN PLATS</div>
            <div style="margin-top:14px;font-family:${bricolage};font-weight:700;font-size:28px;line-height:1.2;color:#ffffff;">Tack, från ett gemensamt klimat.</div>
          </td></tr>
        </table>
      </td></tr>

      <!-- B: CONFIRMATION CARD -->
      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #D9EBE0;border-radius:18px;">
          <tr><td style="padding:32px 32px 28px;">
            <div style="text-align:center;font-family:${mono};font-size:11px;letter-spacing:0.28em;color:#15784F;text-transform:uppercase;">TILL ${upperName}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:20px 0 0;">
              ${greetingBlock ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${greetingBlock}</table>` : ""}
            </td></tr></table>

            <!-- ceremonial count -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;">
              <tr>
                <td width="40%" style="border-right:1px solid #DCBE6E;height:96px;">&nbsp;</td>
                <td align="center" style="font-family:${bricolage};font-weight:700;font-size:76px;line-height:1;color:#1E9E6A;padding:0 12px;">${N}</td>
                <td width="40%" style="border-left:1px solid #DCBE6E;height:96px;">&nbsp;</td>
              </tr>
            </table>
            <div style="text-align:center;font-family:${mono};font-size:11px;letter-spacing:0.28em;color:#0B3D2E;text-transform:uppercase;margin-top:14px;">TRÄD PLANTERADE I DITT NAMN</div>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:26px 0 6px;">
              <a href="${a.verifyUrl}" style="display:inline-block;background:#1E9E6A;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-family:${body};font-weight:600;font-size:14px;">Visa och verifiera ditt bevis →</a>
            </td></tr></table>

            <div style="text-align:center;font-family:${mono};font-size:10px;letter-spacing:0.22em;color:#6E9483;text-transform:uppercase;margin-top:16px;">BEVIS ${escapeHtml(a.verificationId)} · ${escapeHtml(a.dateText)}</div>
          </td></tr>
        </table>
      </td></tr>

      <!-- C: PROJECT BLOCK (double frame) -->
      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF7EE;border-radius:22px;">
          <tr><td style="padding:9px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #D9EBE0;border-radius:15px;">
              <tr><td style="padding:22px 22px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${projectPhoto}
                  <tr><td style="font-family:${mono};font-size:11px;letter-spacing:0.28em;color:#15784F;text-transform:uppercase;padding-bottom:6px;">DINA TRÄD VÄXER I</td></tr>
                  <tr><td style="font-family:${bricolage};font-weight:700;font-size:24px;line-height:1.2;color:#0B3D2E;padding-bottom:12px;">${escapeHtml(proj.name)}</td></tr>
                  <tr><td style="font-family:${body};font-size:14px;line-height:1.6;color:#52705F;padding-bottom:18px;">${escapeHtml(proj.story)}</td></tr>
                  <tr><td style="border-top:1px solid #DCBE6E;font-size:0;line-height:0;">&nbsp;</td></tr>
                  <tr><td style="font-family:${mono};font-size:11px;letter-spacing:0.22em;color:#6E9483;text-transform:uppercase;padding:14px 0 14px;">${escapeHtml(proj.facts)}</td></tr>
                  <tr><td><a href="${proj.link}" style="font-family:${body};font-weight:700;font-size:14px;color:#15784F;text-decoration:none;">Läs om projektet →</a></td></tr>
                </table>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>

      <!-- D: WHY TREES CAPSULE -->
      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF7EE;border-radius:20px;">
          <tr><td style="padding:26px 28px;">
            ${whyRow("KLIMAT", "Ett växande träd binder ungefär 20 kg koldioxid — varje år, i decennier.", bricolage, body, mono)}
            ${whyRow("MÄNNISKOR", "Skogen är inkomst: biodlaren Alfred tar en sjättedel av familjens kontantinkomst ur kupor i trädkronorna.", bricolage, body, mono)}
            ${whyRow("MÅNGFALD", "Tamarinen syns i kamerafällorna igen. Kronörnen är tillbaka.", bricolage, body, mono)}
            ${whyRow("TECH", "Varje träd är en rad i vårt system — planterat, tidsstämplat, spårbart.", bricolage, body, mono, true)}
          </td></tr>
        </table>
      </td></tr>

      <!-- E: CLOSING -->
      <tr><td style="padding:0 0 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B3D2E;border-radius:20px;">
          <tr><td align="center" style="padding:30px 28px;">
            <div style="font-family:${bricolage};font-weight:700;font-size:22px;color:#ffffff;">Vill du plantera fler?</div>
            <div style="margin-top:10px;font-family:${mono};font-size:13px;color:#9FD9B6;"><a href="https://smartklimat.org/plantera" style="color:#9FD9B6;text-decoration:none;">smartklimat.org/plantera</a></div>
          </td></tr>
        </table>
      </td></tr>

      <tr><td align="center" style="padding:18px 0 6px;font-family:${body};font-size:12px;color:#6E9483;">Tänk smart, vi har ett gemensamt klimat.</td></tr>
      <tr><td align="center" style="padding:0 0 24px;font-family:${mono};font-size:11px;color:#6E9483;letter-spacing:0.08em;">SmartKlimat · Stockholm</td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject, html };
}

function whyRow(label: string, text: string, bricolage: string, body: string, mono: string, last = false) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${last ? "0" : "16px"};"><tr>
    <td width="16" valign="top" style="padding-top:6px;"><div style="width:6px;height:6px;border-radius:50%;background:#DCBE6E;"></div></td>
    <td style="padding-left:8px;">
      <div style="font-family:${mono};font-weight:700;font-size:11px;letter-spacing:0.24em;color:#0B3D2E;text-transform:uppercase;">${label}</div>
      <div style="font-family:${body};font-size:14px;line-height:1.55;color:#52705F;margin-top:4px;">${text}</div>
    </td>
  </tr></table>`;
}


interface InviteArgs {
  recipientName?: string | null;
  teamName?: string | null;
  orgName?: string | null;
  activationUrl: string;
}

export function renderInviteEmail(a: InviteArgs): { subject: string; html: string } {
  const greet = a.recipientName ? `Hej ${escapeHtml(a.recipientName)}!` : "Hej!";
  const where = a.teamName
    ? `med <b>${escapeHtml(a.teamName)}</b>${a.orgName ? ` (${escapeHtml(a.orgName)})` : ""}`
    : a.orgName ? `med <b>${escapeHtml(a.orgName)}</b>` : "med din grupp";
  const subject = "Välkommen till Smaarty — sätt ditt lösenord";
  const html = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:'Helvetica Neue',Arial,sans-serif;color:#0B3D2E;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 20px 50px -30px rgba(11,61,46,0.25);">
        <tr><td style="background:linear-gradient(155deg,#EAF7EE 0%,#C7EAD4 100%);padding:36px 40px;text-align:center;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:#fff;border:2px solid #1E9E6A;color:#1E9E6A;font-weight:700;font-size:22px;">🌱</div>
          <h1 style="margin:18px 0 6px;font-size:24px;font-weight:600;color:#0B3D2E;">${greet}</h1>
          <p style="margin:0;font-size:14px;color:#385248;">Du har blivit inbjuden att vara med och plantera träd ${where} i Smaarty.</p>
        </td></tr>
        <tr><td style="padding:28px 40px 8px;font-size:15px;line-height:1.55;color:#385248;">
          <p style="margin:0 0 16px;">Klicka på knappen nedan för att sätta ditt lösenord och komma igång. Det tar 30 sekunder.</p>
        </td></tr>
        <tr><td align="center" style="padding:8px 40px 36px;">
          <a href="${a.activationUrl}" style="display:inline-block;background:#1E9E6A;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:14px;">Sätt mitt lösenord</a>
          <p style="margin:16px 0 0;font-size:12px;color:#7A8F84;">Eller öppna länken direkt:<br/><a href="${a.activationUrl}" style="color:#1E9E6A;word-break:break-all;">${a.activationUrl}</a></p>
        </td></tr>
        <tr><td style="background:#F8FBF6;padding:20px 40px;text-align:center;font-size:11px;color:#7A8F84;">
          Smaarty · SmartKlimat — Tänk smart. Vi har ett gemensamt klimat.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html };
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
