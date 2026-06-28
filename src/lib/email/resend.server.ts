// Server-only: never import from client code.
const RESEND_API_URL = "https://api.resend.com/emails";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendArgs) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[Resend] RESEND_API_KEY missing — skipping email send");
    return { ok: false, skipped: true };
  }

  const from = process.env.RESEND_FROM_EMAIL || "SmartKlimat <onboarding@resend.dev>";

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[Resend] Send failed ${res.status}: ${text}`);
    return { ok: false, error: text };
  }
  return { ok: true };
}

interface ThanksArgs {
  recipientName: string;
  recipientEmail: string;
  treeCount: number;
  totalKr: string;
  dateText: string;
  verificationId: string;
  verifyUrl: string;
}

export function renderThanksEmail(a: ThanksArgs): { subject: string; html: string } {
  const subject = `Tack — ${a.treeCount} träd planterade i ditt namn`;
  const html = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:'Helvetica Neue',Arial,sans-serif;color:#0B3D2E;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 20px 50px -30px rgba(11,61,46,0.25);">
        <tr><td style="background:linear-gradient(155deg,#EAF7EE 0%,#C7EAD4 100%);padding:36px 40px;text-align:center;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:#fff;border:2px solid #1E9E6A;color:#1E9E6A;font-weight:700;font-size:22px;">SK</div>
          <h1 style="margin:18px 0 6px;font-size:24px;font-weight:600;color:#0B3D2E;">Tack, ${escapeHtml(a.recipientName)}!</h1>
          <p style="margin:0;font-size:14px;color:#385248;">Du har bidragit till plantering av riktiga träd.</p>
        </td></tr>
        <tr><td style="padding:32px 40px 8px;">
          <div style="text-align:center;font-family:'Menlo','Courier New',monospace;font-size:48px;font-weight:600;color:#1E9E6A;line-height:1;">${a.treeCount.toLocaleString("sv-SE")}</div>
          <div style="text-align:center;margin-top:6px;font-size:13px;color:#4F6B5E;">träd planterade</div>
        </td></tr>
        <tr><td style="padding:24px 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5EDE6;border-radius:16px;">
            <tr><td style="padding:14px 18px;border-bottom:1px solid #E5EDE6;font-size:13px;color:#4F6B5E;">Datum</td><td style="padding:14px 18px;border-bottom:1px solid #E5EDE6;text-align:right;font-family:'Menlo','Courier New',monospace;font-size:13px;color:#0B3D2E;">${escapeHtml(a.dateText)}</td></tr>
            <tr><td style="padding:14px 18px;border-bottom:1px solid #E5EDE6;font-size:13px;color:#4F6B5E;">Antal</td><td style="padding:14px 18px;border-bottom:1px solid #E5EDE6;text-align:right;font-family:'Menlo','Courier New',monospace;font-size:13px;color:#0B3D2E;">${a.treeCount} träd</td></tr>
            <tr><td style="padding:14px 18px;border-bottom:1px solid #E5EDE6;font-size:13px;color:#4F6B5E;">Belopp</td><td style="padding:14px 18px;border-bottom:1px solid #E5EDE6;text-align:right;font-family:'Menlo','Courier New',monospace;font-size:13px;color:#0B3D2E;">${escapeHtml(a.totalKr)}</td></tr>
            <tr><td style="padding:14px 18px;font-size:13px;color:#4F6B5E;">Verifierings-ID</td><td style="padding:14px 18px;text-align:right;font-family:'Menlo','Courier New',monospace;font-size:13px;color:#0B3D2E;">${escapeHtml(a.verificationId)}</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:8px 40px 36px;">
          <a href="${a.verifyUrl}" style="display:inline-block;background:#1E9E6A;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:600;font-size:14px;">Visa & ladda ner värdebevis</a>
          <p style="margin:16px 0 0;font-size:12px;color:#7A8F84;">Eller öppna direkt: <a href="${a.verifyUrl}" style="color:#1E9E6A;">${a.verifyUrl}</a></p>
        </td></tr>
        <tr><td style="background:#F8FBF6;padding:20px 40px;text-align:center;font-size:11px;color:#7A8F84;">
          SmartKlimat · Bryggan mellan dig och riktig trädplantering
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html };
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
