// Shared branded thank-you email renderer for edge functions.
// Keep in sync with src/lib/email/resend.server.ts buildThanksEmail.

export interface ThanksArgs {
  recipientName: string;
  treeCount: number;
  dateText: string;
  verificationId: string;
  verifyUrl: string;
  locationName?: string | null;
  giftMessage?: string | null;
  giftFromName?: string | null;
  heroStampUrl?: string | null;
  heroImageUrl?: string | null;
  variant?: "mockfjards" | null;

}

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
    story: "Dina träd planteras i något av våra tre granskade projekt — molnskogen i Khasi Hills, miombon i Copperbelt eller vilddjurskorridorerna i Pontal.",
    facts: "TRE PROJEKT · TRE KONTINENTER · PREFERRED BY NATURE",
    link: "https://smartklimat.org/projekt",
  };
}

function whyRow(label: string, text: string, last = false) {
  const body = "Helvetica,Arial,sans-serif";
  const mono = "'Courier New',monospace";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${last ? "0" : "16px"};"><tr>
    <td width="16" valign="top" style="padding-top:6px;"><div style="width:6px;height:6px;border-radius:50%;background:#DCBE6E;"></div></td>
    <td style="padding-left:8px;">
      <div style="font-family:${mono};font-weight:700;font-size:11px;letter-spacing:0.24em;color:#0B3D2E;text-transform:uppercase;">${label}</div>
      <div style="font-family:${body};font-size:14px;line-height:1.55;color:#52705F;margin-top:4px;">${text}</div>
    </td>
  </tr></table>`;
}

export function renderThanksEmail(a: ThanksArgs): { subject: string; html: string } {
  const proj = resolveProject(a.locationName);
  const isMf = a.variant === "mockfjards";
  const N = a.treeCount.toLocaleString("sv-SE");
  const upperName = esc(a.recipientName.toUpperCase());
  const subject = isMf
    ? (proj.key === "generic"
        ? `${a.recipientName} — era ${N} träd planterade i ert namn`
        : `${a.recipientName} — era ${N} träd växer i ${proj.name}`)
    : (proj.key === "generic"
        ? `${a.recipientName} — ${N} träd planterade i ditt namn`
        : `${a.recipientName} — dina ${N} träd växer i ${proj.name}`);

  const stampWhite = a.heroStampUrl && a.heroStampUrl.trim() ? a.heroStampUrl : "https://smartklimat.org/brand/logo-stamp-vit.png";
  const bricolage = "'Bricolage Grotesque',Helvetica,Arial,sans-serif";
  const body = "Helvetica,Arial,sans-serif";
  const mono = "'Courier New',monospace";

  const preheader = isMf
    ? "Ett träd för varje fönster. Här är ert bevis — och skogen det växer i."
    : "Berättelsen om skogen dina träd blir en del av.";

  const ownershipLabel = isMf ? "TRÄD PLANTERADE I ERT NAMN" : "TRÄD PLANTERADE I DITT NAMN";
  const ctaLabel = isMf ? "Visa och verifiera ert bevis →" : "Visa och verifiera ditt bevis →";
  const certSuffix = isMf ? " · VIA MOCKFJÄRDS FÖNSTER" : "";

  const partnerRow = isMf
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto 0;"><tr>
        <td valign="middle" style="padding-right:10px;"><img src="https://smartklimat.org/brand/mockfjards-badge-vit.png" width="28" height="28" alt="" style="display:block;width:28px;height:28px;" /></td>
        <td valign="middle" style="font-family:${mono};font-size:10px;letter-spacing:0.28em;color:#9FD9B6;text-transform:uppercase;">I SAMARBETE MED MOCKFJÄRDS FÖNSTER</td>
      </tr></table>`
    : "";

  const contextBox = isMf
    ? `<tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #D9EBE0;border-radius:14px;">
          <tr><td align="center" style="padding:16px 22px;font-family:${body};font-size:13px;line-height:1.55;color:#52705F;">I samband med ert fönsterbyte har Mockfjärds Fönster planterat träd i ert namn — ett träd för varje fönster.</td></tr>
        </table>
      </td></tr>`
    : "";

  const greetingBlock = !isMf && a.giftMessage && a.giftMessage.trim()
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="background:#EAF7EE;border-radius:14px;padding:16px 20px;font-family:${body};font-style:italic;font-size:15px;line-height:1.5;color:#15784F;">${esc(a.giftMessage)}</td></tr></table>`
    : "";

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
<body style="margin:0;padding:0;background:#F4FAF5;font-family:${body};color:#0B3D2E;">
<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B3D2E;border-radius:20px;overflow:hidden;">
          ${a.heroImageUrl ? `<tr><td style="padding:0;line-height:0;font-size:0;"><img src="${a.heroImageUrl}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border-radius:20px 20px 0 0;" /></td></tr>` : ""}
          <tr><td align="center" style="padding:36px 28px 32px;">
            <img src="${stampWhite}" width="68" height="68" alt="" style="display:block;margin:0 auto 18px;width:68px;height:68px;" />
            <div style="font-family:${mono};font-size:11px;letter-spacing:0.32em;color:#9FD9B6;text-transform:uppercase;">DITT TRÄD HAR FÅTT EN PLATS</div>
            <div style="margin-top:14px;font-family:${bricolage};font-weight:700;font-size:28px;line-height:1.2;color:#ffffff;">Tack, från ett gemensamt klimat.</div>
            ${partnerRow}
          </td></tr>
        </table>
      </td></tr>

      ${contextBox}

      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #D9EBE0;border-radius:18px;">
          <tr><td style="padding:32px 32px 28px;">
            <div style="text-align:center;font-family:${mono};font-size:11px;letter-spacing:0.28em;color:#15784F;text-transform:uppercase;padding-bottom:20px;">TILL ${upperName}</div>
            ${greetingBlock}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;">
              <tr>
                <td width="40%" style="border-right:1px solid #DCBE6E;height:96px;">&nbsp;</td>
                <td align="center" style="font-family:${bricolage};font-weight:700;font-size:76px;line-height:1;color:#1E9E6A;padding:0 12px;">${N}</td>
                <td width="40%" style="border-left:1px solid #DCBE6E;height:96px;">&nbsp;</td>
              </tr>
            </table>
            <div style="text-align:center;font-family:${mono};font-size:11px;letter-spacing:0.28em;color:#0B3D2E;text-transform:uppercase;margin-top:14px;">${ownershipLabel}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:26px 0 6px;">
              <a href="${a.verifyUrl}" style="display:inline-block;background:#1E9E6A;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-family:${body};font-weight:600;font-size:14px;">${ctaLabel}</a>
            </td></tr></table>
            <div style="text-align:center;font-family:${mono};font-size:10px;letter-spacing:0.22em;color:#6E9483;text-transform:uppercase;margin-top:16px;">BEVIS ${esc(a.verificationId)} · ${esc(a.dateText)}${certSuffix}</div>
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
                  <tr><td style="font-family:${mono};font-size:11px;letter-spacing:0.28em;color:#15784F;text-transform:uppercase;padding-bottom:6px;">DINA TRÄD VÄXER I</td></tr>
                  <tr><td style="font-family:${bricolage};font-weight:700;font-size:24px;line-height:1.2;color:#0B3D2E;padding-bottom:12px;">${esc(proj.name)}</td></tr>
                  <tr><td style="font-family:${body};font-size:14px;line-height:1.6;color:#52705F;padding-bottom:18px;">${esc(proj.story)}</td></tr>
                  <tr><td style="border-top:1px solid #DCBE6E;font-size:0;line-height:0;">&nbsp;</td></tr>
                  <tr><td style="font-family:${mono};font-size:11px;letter-spacing:0.22em;color:#6E9483;text-transform:uppercase;padding:14px 0 14px;">${esc(proj.facts)}</td></tr>
                  <tr><td><a href="${proj.link}" style="font-family:${body};font-weight:700;font-size:14px;color:#15784F;text-decoration:none;">Läs om projektet →</a></td></tr>
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
