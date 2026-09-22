// Mail för Mockfjärds hämtningsflöde (bevismail + uppdateringsmail).
// Sidfoten innehåller de juridiska uppgifterna och återkallelselänken.

export const APP_PUBLIC_URL = "https://app.smartklimat.org";
export const COMPANY_NAME = "SmartKlimatKompensera på Tellus AB (SmartKlimat)";
export const COMPANY_ORGNR = "559370-9453";
// Postadress finns inte i kodbasen — platshållare tills den fylls i.
export const COMPANY_ADDRESS = "[ADRESS]";
export const PRIVACY_URL = "https://smartklimat.org/integritet";
export const CONSENT_TEXT_VERSION = "v1-2026-09-22";

const GOLD_STAMP_URL = `${APP_PUBLIC_URL}/brand/logo-stamp-guld.png`;
const MOCKFJARDS_BG_URL = `${APP_PUBLIC_URL}/certs/bg-mockfjards.jpg`;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function addressRow(): string {
  const address = COMPANY_ADDRESS.trim();
  return address && address !== "[ADRESS]" ? `<div>${esc(address)}</div>` : "";
}

export function legalFooterHtml(revokeUrl: string): string {
  return `<div style="max-width:536px;margin:22px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:11.5px;line-height:1.6;color:#6E9483;text-align:center">
  <div>${esc(COMPANY_NAME)} · Org.nr ${esc(COMPANY_ORGNR)}</div>
  ${addressRow()}
  <div style="margin-top:8px">
    <a href="${PRIVACY_URL}" style="color:#15784F;text-decoration:underline">Integritetspolicy</a>
    &nbsp;·&nbsp;
    <a href="${esc(revokeUrl)}" style="color:#15784F;text-decoration:underline">Återkalla mitt samtycke</a>
  </div>
</div>`;
}

interface CertMailArgs {
  recipientName: string;
  treeCount: number;
  verificationId: string;
  verifyUrl: string;
  revokeUrl: string;
  locationName?: string | null;
}

function miniCertificate(treeCount: number, verificationId: string): string {
  const n = treeCount.toLocaleString("sv-SE");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin:0 0 24px;background:#F3F0E6;border:1px solid #E4D7AA;border-radius:8px;overflow:hidden">
  <tr><td background="${MOCKFJARDS_BG_URL}" bgcolor="#F3F0E6" style="background-color:#F3F0E6;background-image:url('${MOCKFJARDS_BG_URL}');background-position:center;background-size:cover;padding:30px 18px;text-align:center">
    <div style="font-family:'Courier New',Courier,monospace;font-size:10px;line-height:1.4;letter-spacing:3px;color:#577064">SMARTKLIMAT · MOCKFJÄRDS</div>
    <div style="width:112px;height:1px;background:#DCBE6E;margin:14px auto 12px"></div>
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.1;color:#0B3D2E;font-weight:bold">VÄRDEBEVIS</div>
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:58px;line-height:1;color:#0B3D2E;font-weight:bold;margin-top:14px">${n}</div>
    <div style="font-family:'Courier New',Courier,monospace;font-size:10px;line-height:1.4;letter-spacing:3px;color:#9B7B2F;margin-top:4px">TRÄD</div>
    <div style="width:180px;height:1px;background:#DCBE6E;margin:16px auto 10px"></div>
    <div style="font-family:'Courier New',Courier,monospace;font-size:9px;line-height:1.5;color:#466355">${esc(verificationId)}</div>
  </td></tr>
</table>`;
}

function shell(inner: string, revokeUrl: string, title: string) {
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" /><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:Helvetica,Arial,sans-serif;color:#0B3D2E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#F4FAF5"><tr><td align="center" style="padding:34px 12px">
  <table role="presentation" width="536" cellpadding="0" cellspacing="0" style="width:100%;max-width:536px;border-collapse:separate;background:#ffffff;border:1px solid #DCBE6E;border-radius:12px">
    <tr><td align="center" style="padding:30px 28px 32px;text-align:center">
      <img src="${GOLD_STAMP_URL}" width="72" height="72" alt="SmartKlimat" style="display:block;width:72px;height:72px;margin:0 auto 18px;object-fit:contain" />
      ${inner}
    </td></tr>
  </table>
  ${legalFooterHtml(revokeUrl)}
</td></tr></table></body></html>`;
}

export function renderClaimCertEmail(a: CertMailArgs): { subject: string; html: string } {
  const n = a.treeCount.toLocaleString("sv-SE");
  const singular = a.treeCount === 1;
  const subject = singular ? `${a.recipientName} — ditt värdebevis` : `${a.recipientName} — ditt värdebevis för ${n} träd`;
  const planted = singular
    ? `Ditt träd är planterat${a.locationName ? ` i ${esc(a.locationName)}` : ""}`
    : `Dina <b>${n} träd</b> är planterade${a.locationName ? ` i ${esc(a.locationName)}` : ""}`;
  const inner = `
  <div style="font-family:'Courier New',Courier,monospace;font-size:10px;line-height:1.4;letter-spacing:3px;color:#15784F">SMARTKLIMAT · MOCKFJÄRDS</div>
  <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;font-weight:normal;margin:15px 0 10px;color:#0B3D2E">Tack, ${esc(a.recipientName)}.</h1>
  <p style="font-size:15px;line-height:1.65;color:#334E42;margin:0 0 24px">${planted} och ditt personliga värdebevis är nu utfärdat.</p>
  ${miniCertificate(a.treeCount, a.verificationId)}
  <a href="${esc(a.verifyUrl)}" style="display:inline-block;background:#0B3D2E;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:24px;font-weight:bold;font-size:14px;line-height:1.2">Se ditt värdebevis</a>`;
  return { subject, html: shell(inner, a.revokeUrl, subject) };
}

interface UpdateMailArgs extends CertMailArgs {
  previousTreeCount: number;
}

export function renderClaimUpdateEmail(a: UpdateMailArgs): { subject: string; html: string } {
  const from = a.previousTreeCount.toLocaleString("sv-SE");
  const to = a.treeCount.toLocaleString("sv-SE");
  const subject = a.previousTreeCount === 1 ? `Ditt träd har blivit ${to}` : `Dina ${from} träd har blivit ${to}`;
  const inner = `
  <div style="font-family:'Courier New',Courier,monospace;font-size:10px;line-height:1.4;letter-spacing:3px;color:#15784F">SMARTKLIMAT · MOCKFJÄRDS</div>
  <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;font-weight:normal;margin:15px 0 10px;color:#0B3D2E">${esc(subject)}.</h1>
  <p style="font-size:15px;line-height:1.65;color:#334E42;margin:0 0 24px">Hej ${esc(a.recipientName)}! Fler träd har planterats i ditt namn och ditt värdebevis är uppdaterat.</p>
  ${miniCertificate(a.treeCount, a.verificationId)}
  <a href="${esc(a.verifyUrl)}" style="display:inline-block;background:#0B3D2E;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:24px;font-weight:bold;font-size:14px;line-height:1.2">Se ditt uppdaterade bevis</a>`;
  return { subject, html: shell(inner, a.revokeUrl, subject) };
}

/** @deprecated Använd renderClaimUpdateEmail. */
export const renderTreeUpdateEmail = renderClaimUpdateEmail;