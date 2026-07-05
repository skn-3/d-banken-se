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
  const stamp = "https://smartklimat.org/brand/logo-stamp-guld.png";
  const html = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:Helvetica,Arial,sans-serif;color:#0B3D2E;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FBF9F2;border:1px solid rgba(11,61,46,0.14);border-radius:24px;overflow:hidden;">
        <tr><td style="padding:44px 44px 8px;text-align:center;">
          <div style="font-family:'Menlo','Courier New',monospace;font-size:11px;letter-spacing:0.42em;color:#4F6B5E;text-transform:uppercase;">VÄRDEBEVIS</div>
          <h1 style="margin:22px 0 0;font-size:30px;font-weight:700;color:#0B3D2E;letter-spacing:-0.01em;">${escapeHtml(a.recipientName)}</h1>
          <div style="margin:28px 0 6px;font-size:88px;font-weight:700;color:#1E9E6A;line-height:0.9;letter-spacing:-0.03em;">${a.treeCount.toLocaleString("sv-SE")}</div>
          <div style="font-size:14px;color:#385248;">träd planterade</div>
          <div style="margin-top:14px;font-family:'Menlo','Courier New',monospace;font-size:11px;letter-spacing:0.06em;color:#4F6B5E;text-transform:uppercase;">${escapeHtml(a.dateText)}</div>
          <img src="${stamp}" width="72" height="72" alt="" style="display:block;margin:28px auto 0;width:72px;height:72px;" />
        </td></tr>
        <tr><td align="center" style="padding:24px 44px 40px;">
          <a href="${a.verifyUrl}" style="display:inline-block;background:#1E9E6A;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:600;font-size:14px;">Visa och verifiera ditt bevis</a>
          <p style="margin:14px 0 0;font-size:11px;color:#7A8F84;font-family:'Menlo','Courier New',monospace;">Verifierings-ID: ${escapeHtml(a.verificationId)}</p>
        </td></tr>
      </table>

      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="margin-top:20px;background:#ffffff;border:1px solid rgba(11,61,46,0.10);border-radius:20px;">
        <tr><td style="padding:26px 32px;">
          <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#0B3D2E;letter-spacing:0.02em;">Varför träd?</h2>
          <p style="margin:0 0 10px;font-size:13px;line-height:1.55;color:#385248;">Ditt träd binder ungefär 20 kg koldioxid — varje år.</p>
          <p style="margin:0 0 10px;font-size:13px;line-height:1.55;color:#385248;">Det planteras i granskade WeForest-projekt i Indien, Zambia eller Brasilien.</p>
          <p style="margin:0 0 14px;font-size:13px;line-height:1.55;color:#385248;">Det är spårbart — följ det via länken ovan.</p>
          <a href="https://smartklimat.org/projekt" style="font-size:13px;font-weight:600;color:#1E9E6A;text-decoration:none;">Läs mer om projekten →</a>
        </td></tr>
      </table>

      <p style="margin:20px 0 0;font-size:11px;color:#7A8F84;font-family:Helvetica,Arial,sans-serif;">SmartKlimat · Tänk smart, vi har ett gemensamt klimat.</p>
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
