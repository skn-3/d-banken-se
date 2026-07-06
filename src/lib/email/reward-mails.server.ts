// Server-only: mail för belöningsflödet (barnbekräftelse + ledarens packlista).
import { sendEmail } from "@/lib/email/resend.server";

const REWARD_FROM = "SmartKlimat <hej@send.smartklimat.org>";
const APP_BASE = "https://app.smartklimat.org";
const STAMP_WHITE = "https://smartklimat.org/brand/logo-stamp-vit.png";

function esc(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

interface ShellArgs {
  heroLine: string;
  title: string;
  intro?: string;
  cardExtraHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

function shell(a: ShellArgs, subject: string): { subject: string; html: string } {
  const bricolage = "'Bricolage Grotesque',Helvetica,Arial,sans-serif";
  const body = "Helvetica,Arial,sans-serif";
  const mono = "'Courier New',monospace";
  const cta = a.ctaLabel && a.ctaUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 0 4px;">
         <a href="${a.ctaUrl}" style="display:inline-block;background:#1E9E6A;color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:999px;font-family:${body};font-weight:600;font-size:14px;">${esc(a.ctaLabel)}</a>
       </td></tr></table>`
    : "";
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(subject)}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&display=swap');</style></head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:${body};color:#0B3D2E;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="padding:0 0 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B3D2E;border-radius:20px;"><tr><td align="center" style="padding:36px 28px 32px;">
      <img src="${STAMP_WHITE}" width="68" height="68" alt="" style="display:block;margin:0 auto 18px;"/>
      <div style="font-family:${mono};font-size:11px;letter-spacing:0.32em;color:#9FD9B6;text-transform:uppercase;">${esc(a.heroLine)}</div>
      <div style="margin-top:14px;font-family:${bricolage};font-weight:700;font-size:28px;line-height:1.2;color:#ffffff;">${esc(a.title)}</div>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:0 0 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #D9EBE0;border-radius:18px;"><tr><td style="padding:32px 32px 28px;">
      ${a.intro ? `<div style="font-family:${body};font-size:15px;line-height:1.6;color:#3D5648;text-align:center;margin:0 0 20px;">${a.intro}</div>` : ""}
      ${a.cardExtraHtml ?? ""}
      ${cta}
      ${a.footerNote ? `<div style="text-align:center;font-family:${mono};font-size:10px;letter-spacing:0.22em;color:#6E9483;text-transform:uppercase;margin-top:16px;">${esc(a.footerNote)}</div>` : ""}
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:0 0 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B3D2E;border-radius:20px;"><tr><td align="center" style="padding:24px 28px;">
    <div style="font-family:${mono};font-size:12px;color:#9FD9B6;letter-spacing:0.08em;">Tänk smart, vi har ett gemensamt klimat.</div>
  </td></tr></table></td></tr>
  <tr><td align="center" style="padding:6px 0 24px;font-family:${mono};font-size:11px;color:#6E9483;letter-spacing:0.08em;">SmartKlimat · Stockholm</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html };
}

/* -------------- Barnets bekräftelse -------------- */

export interface RewardClaimEmailArgs {
  to: string;
  firstName: string;
  rewardName: string;
  rewardImageUrl: string | null;
  costPoints: number;
  isDigital: boolean;
}

export async function sendRewardClaimEmail(a: RewardClaimEmailArgs) {
  const imgHtml = a.rewardImageUrl
    ? `<div style="text-align:center;margin:8px 0 18px;"><img src="${a.rewardImageUrl}" alt="" style="max-width:220px;max-height:180px;border-radius:14px;"/></div>`
    : `<div style="text-align:center;font-size:64px;margin:0 0 12px;">🎁</div>`;
  const rewardBox = `
    ${imgHtml}
    <div style="text-align:center;font-family:'Bricolage Grotesque',Helvetica,Arial,sans-serif;font-weight:700;font-size:22px;color:#0B3D2E;margin-bottom:8px;">${esc(a.rewardName)}</div>
    <div style="text-align:center;font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.18em;color:#15784F;text-transform:uppercase;margin-bottom:20px;">–${a.costPoints} p från ditt saldo</div>
    <div style="text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3D5648;padding:16px 12px;background:#EAF7EE;border-radius:12px;">
      ${a.isDigital
        ? "Din digitala belöning aktiveras direkt i appen."
        : "Priset kommer till en träning — din ledare delar ut det."}
    </div>`;
  const { subject, html } = shell({
    heroLine: "BELÖNING BESTÄLLD",
    title: `Snyggt, ${esc(a.firstName)}!`,
    intro: `Din inlösen är registrerad.`,
    cardExtraHtml: rewardBox,
    ctaLabel: "Öppna Smaarty",
    ctaUrl: `${APP_BASE}/beloningar`,
  }, `Belöning beställd — ${a.rewardName}`);
  return sendEmail({ to: a.to, subject, html, from: REWARD_FROM });
}

/* -------------- Ledarens packlista (skickad) -------------- */

export interface ShipmentEmailItem {
  rewardName: string;
  imageUrl: string | null;
  count: number;
  sellers: string[]; // förnamn
}

export interface LeaderShipmentEmailArgs {
  to: string;
  leaderFirstName: string;
  teamName: string;
  orgName: string | null;
  items: ShipmentEmailItem[];
}

export async function sendLeaderShipmentEmail(a: LeaderShipmentEmailArgs) {
  const totalItems = a.items.reduce((s, i) => s + i.count, 0);
  const rows = a.items.map((it, idx) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${idx === a.items.length - 1 ? "0" : "12px"};background:#F4FAF5;border-radius:12px;">
      <tr>
        <td width="72" valign="middle" style="padding:12px 8px 12px 14px;">
          ${it.imageUrl ? `<img src="${it.imageUrl}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:10px;background:#fff;"/>` : `<div style="width:56px;height:56px;border-radius:10px;background:#DCEDE1;font-size:28px;text-align:center;line-height:56px;">🎁</div>`}
        </td>
        <td valign="middle" style="padding:12px 14px 12px 0;">
          <div style="font-family:'Bricolage Grotesque',Helvetica,Arial,sans-serif;font-weight:700;font-size:16px;color:#0B3D2E;">${esc(it.rewardName)} <span style="font-family:'Courier New',monospace;font-size:12px;color:#15784F;">× ${it.count}</span></div>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#52705F;margin-top:2px;">Till: ${esc(it.sellers.join(", "))}</div>
        </td>
      </tr>
    </table>
  `).join("");
  const mottagare = a.orgName ? `${esc(a.orgName)} — ${esc(a.teamName)}` : esc(a.teamName);
  const packInfo = `
    <div style="text-align:center;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.24em;color:#15784F;text-transform:uppercase;margin-bottom:8px;">Mottagare</div>
    <div style="text-align:center;font-family:'Bricolage Grotesque',Helvetica,Arial,sans-serif;font-weight:700;font-size:20px;color:#0B3D2E;margin-bottom:20px;">${mottagare}</div>
    ${rows}
    <div style="margin-top:16px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.22em;color:#6E9483;text-transform:uppercase;text-align:center;">Totalt ${totalItems} priser i sändningen</div>`;
  const { subject, html } = shell({
    heroLine: "PRISER PÅ VÄG TILL ERT LAG",
    title: `Hej ${esc(a.leaderFirstName)} — ett paket är på väg`,
    intro: `Här är packlistan så du vet vad som kommer och vem som ska få vad. Kvittera "Utdelat" i appen när priset är i barnets hand.`,
    cardExtraHtml: packInfo,
    ctaLabel: "Öppna Priser att dela ut",
    ctaUrl: `${APP_BASE}/priser`,
  }, `Priser på väg till ${a.teamName} — ${totalItems} st`);
  return sendEmail({ to: a.to, subject, html, from: REWARD_FROM });
}
