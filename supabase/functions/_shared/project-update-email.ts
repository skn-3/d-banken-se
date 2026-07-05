// Branded planting-update email renderer (same skeleton as thanks/newsletter).

export interface ProjectUpdateArgs {
  subject: string;
  headline: string;
  body: string;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  recipientEmail: string;
  unsubscribeUrl: string;
}

function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

function paragraphs(text: string) {
  const body = "Helvetica,Arial,sans-serif";
  return text.split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 14px;font-family:${body};font-size:15px;line-height:1.6;color:#334E42;">${esc(p).replace(/\n/g, "<br/>")}</p>`
  ).join("");
}

export function renderProjectUpdateEmail(a: ProjectUpdateArgs): string {
  const bricolage = "'Bricolage Grotesque',Helvetica,Arial,sans-serif";
  const body = "Helvetica,Arial,sans-serif";
  const mono = "'Courier New',monospace";
  const stampWhite = "https://smartklimat.org/brand/logo-stamp-vit.png";

  const ctaBlock = a.ctaLabel && a.ctaUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:18px 0 4px;">
        <a href="${esc(a.ctaUrl)}" style="display:inline-block;background:#1E9E6A;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-family:${body};font-weight:600;font-size:14px;">${esc(a.ctaLabel)}</a>
       </td></tr></table>`
    : "";

  const imageBlock = a.imageUrl && a.imageUrl.trim()
    ? `<tr><td style="padding:0 0 18px;"><img src="${esc(a.imageUrl)}" width="536" alt="" style="display:block;width:100%;max-width:536px;height:auto;border-radius:12px;" /></td></tr>`
    : "";

  return `<!doctype html>
<html lang="sv"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${esc(a.subject)}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:${body};color:#0B3D2E;">
<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${esc(a.headline)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B3D2E;border-radius:20px;">
          <tr><td align="center" style="padding:34px 28px 30px;">
            <img src="${stampWhite}" width="60" height="60" alt="" style="display:block;margin:0 auto 14px;width:60px;height:60px;" />
            <div style="font-family:${mono};font-size:11px;letter-spacing:0.32em;color:#9FD9B6;text-transform:uppercase;">NYTT FRÅN DIN SKOG</div>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #D9EBE0;border-radius:18px;">
          <tr><td style="padding:30px 32px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${imageBlock}
              <tr><td>
                <h1 style="margin:0 0 16px;font-family:${bricolage};font-weight:700;font-size:26px;line-height:1.25;color:#0B3D2E;">${esc(a.headline)}</h1>
                ${paragraphs(a.body)}
                ${ctaBlock}
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 0 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B3D2E;border-radius:20px;">
          <tr><td align="center" style="padding:26px 28px;">
            <div style="font-family:${body};font-size:13px;color:#9FD9B6;">Tänk smart, vi har ett gemensamt klimat.</div>
            <div style="margin-top:8px;font-family:${mono};font-size:11px;color:#6E9483;">SmartKlimat · Stockholm</div>
          </td></tr>
        </table>
      </td></tr>

      <tr><td align="center" style="padding:12px 0 24px;font-family:${body};font-size:11px;color:#8AA69B;line-height:1.55;">
        Du får det här mailet för att träd är planterade i ditt namn hos SmartKlimat.<br/>
        <a href="${esc(a.unsubscribeUrl)}" style="color:#8AA69B;text-decoration:underline;">Avregistrera dig här</a>.
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}
