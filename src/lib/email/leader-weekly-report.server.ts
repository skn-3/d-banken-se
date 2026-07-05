// Server-only: render "Lagets vecka" leader weekly report email.
import { createHmac } from "crypto";

const STAMP_WHITE = "https://smartklimat.org/brand/logo-stamp-vit.png";
const APP_BASE = "https://app.smartklimat.org";
const UNSUB_BASE = "https://smartklimat.org";

function esc(s: string) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unsubscribeUrlFor(email: string, secret: string): string {
  const sig = b64url(createHmac("sha256", secret).update(email.toLowerCase()).digest());
  return `${UNSUB_BASE}/api/public/unsubscribe?e=${encodeURIComponent(email)}&t=${sig}`;
}

const AVATAR_COLORS = ["#1E9E6A", "#DCBE6E", "#0B3D2E", "#3D8F71", "#B47B2B"];
function initialAvatar(name: string, size: number, i: number) {
  const bg = AVATAR_COLORS[i % AVATAR_COLORS.length];
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:#fff;font-family:'Bricolage Grotesque',Helvetica,Arial,sans-serif;font-weight:700;font-size:${Math.round(size*0.42)}px;line-height:${size}px;text-align:center;margin:0 auto;">${esc(letter)}</div>`;
}

export interface LeaderReportArgs {
  leaderFirstName: string;
  teamName: string;
  weekTrees: number;
  prevWeekTrees: number;
  goalTrees: number | null;
  goalTotalTrees: number;              // totalt paid för lagets medlemmar
  goalEndDate: string | null;
  top3: { firstName: string; trees: number }[];
  streakAtRisk: { firstName: string; weeks: number }[];
  unclaimedRewards: number;
  rangeLabel: string;                   // "V. 27 · 30 jun – 6 jul"
  unsubscribeUrl: string;
  recipientEmail: string;
}

export function renderLeaderWeeklyReport(a: LeaderReportArgs): { subject: string; html: string } {
  const bricolage = "'Bricolage Grotesque',Helvetica,Arial,sans-serif";
  const body = "Helvetica,Arial,sans-serif";
  const mono = "'Courier New',monospace";

  const delta = a.weekTrees - a.prevWeekTrees;
  const deltaLabel = delta === 0
    ? "oförändrat mot förra veckan"
    : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)} mot förra veckan`;
  const deltaColor = delta > 0 ? "#1E9E6A" : delta < 0 ? "#B4482B" : "#6E9483";

  // Goal progress
  let goalBlock = "";
  if (a.goalTrees && a.goalTrees > 0) {
    const pct = Math.min(100, Math.round((a.goalTotalTrees / a.goalTrees) * 100));
    goalBlock = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
        <tr><td style="font-family:${mono};font-size:11px;letter-spacing:0.24em;color:#15784F;text-transform:uppercase;padding-bottom:8px;">KAMPANJMÅLET</td></tr>
        <tr><td>
          <div style="background:#EAF7EE;border-radius:999px;height:14px;overflow:hidden;">
            <div style="background:#1E9E6A;width:${pct}%;height:14px;border-radius:999px;"></div>
          </div>
          <div style="margin-top:8px;font-family:${body};font-size:14px;color:#0B3D2E;"><b>${a.goalTotalTrees.toLocaleString("sv-SE")}</b> av ${a.goalTrees.toLocaleString("sv-SE")} träd${a.goalEndDate ? ` · slutdatum ${esc(a.goalEndDate)}` : ""} · ${pct}%</div>
        </td></tr>
      </table>`;
  }

  // Top 3
  const top3Cells = a.top3.length
    ? a.top3.map((p, i) => `
      <td width="33%" align="center" style="padding:6px 6px 0;">
        ${initialAvatar(p.firstName || "?", 56, i)}
        <div style="margin-top:8px;font-family:${body};font-size:14px;font-weight:700;color:#0B3D2E;">${esc(p.firstName || "Säljare")}</div>
        <div style="font-family:${mono};font-size:12px;color:#15784F;letter-spacing:0.08em;">${p.trees} träd</div>
      </td>`).join("")
    : `<td align="center" style="padding:12px 0;font-family:${body};font-size:14px;color:#6E9483;">Ingen försäljning registrerad i veckan.</td>`;
  const top3Padding = a.top3.length < 3 ? Array.from({ length: 3 - a.top3.length }).map(() => `<td width="33%">&nbsp;</td>`).join("") : "";

  const top3Block = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;">
      <tr><td colspan="3" style="font-family:${mono};font-size:11px;letter-spacing:0.24em;color:#15784F;text-transform:uppercase;padding-bottom:10px;">VECKANS TOPP 3</td></tr>
      <tr>${top3Cells}${top3Padding}</tr>
    </table>`;

  // Streak-at-risk list
  const streakBlock = a.streakAtRisk.length
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;background:#FDF6E4;border-radius:14px;">
        <tr><td style="padding:16px 18px;">
          <div style="font-family:${mono};font-size:11px;letter-spacing:0.24em;color:#8A6C1D;text-transform:uppercase;">STREAKS I FARA</div>
          <div style="margin-top:6px;font-family:${body};font-size:14px;color:#3D2E0B;line-height:1.55;">
            ${a.streakAtRisk.slice(0, 8).map(s => `<b>${esc(s.firstName)}</b> (${s.weeks} v)`).join(" · ")}
            ${a.streakAtRisk.length > 8 ? ` <span style="color:#8A6C1D;">+${a.streakAtRisk.length - 8} till</span>` : ""}
          </div>
          <div style="margin-top:8px;font-family:${body};font-size:13px;color:#6E5518;">En knuff imorgon räddar elden. 🔥</div>
        </td></tr>
      </table>`
    : "";

  // Rewards
  const rewardBlock = a.unclaimedRewards > 0
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;background:#EAF7EE;border-radius:14px;">
        <tr><td style="padding:16px 18px;font-family:${body};font-size:14px;color:#0B3D2E;">
          🎁 <b>${a.unclaimedRewards}</b> ohämtad${a.unclaimedRewards === 1 ? "" : "e"} pris att dela ut till laget.
        </td></tr>
      </table>`
    : "";

  const subject = `Lagets vecka — ${a.teamName}: ${a.weekTrees} träd`;

  const html = `<!doctype html>
<html lang="sv"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${esc(subject)}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:${body};color:#0B3D2E;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- HERO -->
      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B3D2E;border-radius:20px;">
          <tr><td align="center" style="padding:34px 28px 30px;">
            <img src="${STAMP_WHITE}" width="60" height="60" alt="" style="display:block;margin:0 auto 16px;width:60px;height:60px;" />
            <div style="font-family:${mono};font-size:11px;letter-spacing:0.32em;color:#9FD9B6;text-transform:uppercase;">LAGETS VECKA</div>
            <div style="margin-top:12px;font-family:${bricolage};font-weight:700;font-size:26px;line-height:1.2;color:#ffffff;">${esc(a.teamName)}</div>
            <div style="margin-top:6px;font-family:${mono};font-size:11px;color:#9FD9B6;letter-spacing:0.2em;">${esc(a.rangeLabel)}</div>
          </td></tr>
        </table>
      </td></tr>

      <!-- CONTENT CARD -->
      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #D9EBE0;border-radius:18px;">
          <tr><td style="padding:28px 30px 26px;">
            <div style="text-align:center;font-family:${mono};font-size:11px;letter-spacing:0.28em;color:#15784F;text-transform:uppercase;">Hej ${esc(a.leaderFirstName)} — så gick veckan</div>

            <!-- Big number -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 4px;">
              <tr>
                <td width="30%" style="border-right:1px solid #DCBE6E;height:96px;">&nbsp;</td>
                <td align="center" style="font-family:${bricolage};font-weight:700;font-size:76px;line-height:1;color:#1E9E6A;padding:0 12px;">${a.weekTrees.toLocaleString("sv-SE")}</td>
                <td width="30%" style="border-left:1px solid #DCBE6E;height:96px;">&nbsp;</td>
              </tr>
            </table>
            <div style="text-align:center;font-family:${mono};font-size:11px;letter-spacing:0.24em;color:#0B3D2E;text-transform:uppercase;margin-top:12px;">TRÄD SÅLDA I VECKAN</div>
            <div style="text-align:center;font-family:${body};font-size:13px;color:${deltaColor};margin-top:6px;">${esc(deltaLabel)}</div>

            ${goalBlock}
            ${top3Block}
            ${streakBlock}
            ${rewardBlock}

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:26px 0 4px;">
              <a href="${APP_BASE}/saljare" style="display:inline-block;background:#1E9E6A;color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:999px;font-family:${body};font-weight:600;font-size:14px;">Öppna ledarvyn</a>
            </td></tr></table>
          </td></tr>
        </table>
      </td></tr>

      <!-- CLOSING -->
      <tr><td style="padding:0 0 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B3D2E;border-radius:20px;">
          <tr><td align="center" style="padding:22px 28px;">
            <div style="font-family:${mono};font-size:12px;color:#9FD9B6;letter-spacing:0.08em;">Tänk smart, vi har ett gemensamt klimat.</div>
          </td></tr>
        </table>
      </td></tr>

      <tr><td align="center" style="padding:8px 0 8px;font-family:${mono};font-size:11px;color:#6E9483;letter-spacing:0.06em;">SmartKlimat · Stockholm</td></tr>
      <tr><td align="center" style="padding:0 12px 24px;font-family:${body};font-size:12px;color:#8AA69B;line-height:1.6;">
        Du får den här sammanfattningen som lagledare för ${esc(a.teamName)}.<br/>
        Vill du inte längre ha mail från oss? <a href="${a.unsubscribeUrl}" style="color:#8AA69B;text-decoration:underline;">Avregistrera dig här</a>.
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
  return { subject, html };
}
