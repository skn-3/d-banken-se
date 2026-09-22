// Mail för Mockfjärds hämtningsflöde (bevismail + uppdateringsmail).
// Sidfoten innehåller de juridiska uppgifterna och återkallelselänken.

export const COMPANY_NAME = "SmartKlimatKompensera på Tellus AB (SmartKlimat)";
export const COMPANY_ORGNR = "559370-9453";
// Postadress finns inte i kodbasen — platshållare tills den fylls i.
export const COMPANY_ADDRESS = "[ADRESS]";
export const PRIVACY_URL = "https://smartklimat.org/integritet";
export const CONSENT_TEXT_VERSION = "v1-2026-09-22";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function legalFooterHtml(revokeUrl: string): string {
  return `<div style="max-width:536px;margin:22px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:11.5px;line-height:1.6;color:#6E9483;text-align:center">
  <div>${esc(COMPANY_NAME)} · Org.nr ${esc(COMPANY_ORGNR)}</div>
  <div>${esc(COMPANY_ADDRESS)}</div>
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

function shell(inner: string, revokeUrl: string, title: string) {
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:Helvetica,Arial,sans-serif;color:#0B3D2E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:26px 12px"><tr><td align="center">
  <table role="presentation" width="536" cellpadding="0" cellspacing="0" style="max-width:536px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #D9EBE0">
    <tr><td style="padding:30px 28px;text-align:center">${inner}</td></tr>
  </table>
  ${legalFooterHtml(revokeUrl)}
</td></tr></table>
</body></html>`;
}

export function renderClaimCertEmail(a: CertMailArgs): { subject: string; html: string } {
  const n = a.treeCount.toLocaleString("sv-SE");
  const subject = `${a.recipientName} — ditt värdebevis för ${n} träd`;
  const inner = `
  <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.26em;color:#15784F">SMARTKLIMAT · MOCKFJÄRDS</div>
  <h1 style="font-size:24px;margin:14px 0 10px;color:#0B3D2E">Tack, ${esc(a.recipientName)}.</h1>
  <p style="font-size:15px;line-height:1.6;color:#334E42;margin:0 0 6px">Dina <b>${n} träd</b> är planterade${a.locationName ? ` i ${esc(a.locationName)}` : ""} och ditt personliga värdebevis är nu utfärdat.</p>
  <p style="font-size:13px;color:#6E9483;margin:0 0 20px">Verifierings-id: <b>${esc(a.verificationId)}</b></p>
  <a href="${esc(a.verifyUrl)}" style="display:inline-block;background:#0B3D2E;color:#fff;text-decoration:none;padding:13px 28px;border-radius:24px;font-weight:bold;font-size:14px">Se ditt värdebevis</a>`;
  return { subject, html: shell(inner, a.revokeUrl, subject) };
}

interface UpdateMailArgs extends CertMailArgs {
  previousTreeCount: number;
}

export function renderTreeUpdateEmail(a: UpdateMailArgs): { subject: string; html: string } {
  const from = a.previousTreeCount.toLocaleString("sv-SE");
  const to = a.treeCount.toLocaleString("sv-SE");
  const subject = `Dina ${from} träd har blivit ${to}`;
  const inner = `
  <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.26em;color:#15784F">SMARTKLIMAT · MOCKFJÄRDS</div>
  <h1 style="font-size:24px;margin:14px 0 10px;color:#0B3D2E">Dina ${from} träd har blivit ${to}.</h1>
  <p style="font-size:15px;line-height:1.6;color:#334E42;margin:0 0 20px">Hej ${esc(a.recipientName)}! Fler träd har planterats i ditt namn och ditt värdebevis är uppdaterat.</p>
  <a href="${esc(a.verifyUrl)}" style="display:inline-block;background:#0B3D2E;color:#fff;text-decoration:none;padding:13px 28px;border-radius:24px;font-weight:bold;font-size:14px">Se ditt uppdaterade bevis</a>`;
  return { subject, html: shell(inner, a.revokeUrl, subject) };
}
