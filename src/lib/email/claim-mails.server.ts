// Mail för Mockfjärds hämtningsflöde (bevismail + uppdateringsmail).
// Använder den godkända Mockfjärds-bevismallen (samma HTML som
// supabase/functions/_shared/thanks-email.ts, variant "mockfjards").
// Enda tilläggen: juridisk sidfot under tagline-sidfoten, korrekt
// singular/plural samt en introtext som passar både besök och signerad affär.
// HÅLL I SYNK med certMail/updateMail i supabase/functions/inbound-mockfjards/index.ts.

export const APP_PUBLIC_URL = "https://app.smartklimat.org";
export const COMPANY_NAME = "SmartKlimatKompensera på Tellus AB (SmartKlimat)";
export const COMPANY_ORGNR = "559370-9453";
// Postadress finns inte i kodbasen — platshållare tills den fylls i.
// Raden renderas aldrig så länge värdet är platshållaren.
export const COMPANY_ADDRESS = "[ADRESS]";
export const PRIVACY_URL = "https://smartklimat.org/integritet";
export const CONSENT_TEXT_VERSION = "v1-2026-09-22";

const BRICOLAGE = "'Bricolage Grotesque',Helvetica,Arial,sans-serif";
const BODY_FONT = "Helvetica,Arial,sans-serif";
const MONO = "'Courier New',monospace";
const STAMP_WHITE = "https://smartklimat.org/brand/logo-stamp-vit.png";
const MOCKFJARDS_BADGE = "https://smartklimat.org/brand/mockfjards-badge-vit.png";

function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
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

export function legalFooterHtml(revokeUrl: string): string {
  return `<tr><td align="center" style="padding:0 0 26px;font-family:${BODY_FONT};font-size:11.5px;line-height:1.6;color:#6E9483;">
  <div>${esc(COMPANY_NAME)} · Org.nr ${esc(COMPANY_ORGNR)}</div>
  ${addressRow()}
  <div style="margin-top:8px;">
    <a href="${PRIVACY_URL}" style="color:#15784F;text-decoration:underline;">Integritetspolicy</a>
    &nbsp;·&nbsp;
    <a href="${esc(revokeUrl)}" style="color:#15784F;text-decoration:underline;">Återkalla mitt samtycke</a>
  </div>
</td></tr>`;
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

function trees(n: number): string {
  return n === 1 ? "ett träd" : `${n.toLocaleString("sv-SE")} träd`;
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
    : `Mockfjärds Fönster har tillsammans med SmartKlimat planterat ${trees(a.treeCount)} i ert namn.`;

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
      ${legalFooterHtml(a.revokeUrl)}

    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject, html };
}

export function renderClaimCertEmail(a: MailArgs): { subject: string; html: string } {
  return buildMail(a, "cert");
}

export function renderClaimUpdateEmail(a: MailArgs & { previousTreeCount: number }): { subject: string; html: string } {
  return buildMail(a, "update");
}

/** @deprecated Använd renderClaimUpdateEmail. */
export const renderTreeUpdateEmail = renderClaimUpdateEmail;
