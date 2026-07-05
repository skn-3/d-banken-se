// Server-only: welcome emails for sellers and team leaders.
// Uses the verified `send.smartklimat.org` sender (same subdomain as bevismailen).
import { sendEmail } from "@/lib/email/resend.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const WELCOME_FROM = "SmartKlimat <hej@send.smartklimat.org>";
const APP_BASE = "https://app.smartklimat.org";
const STAMP_WHITE = "https://smartklimat.org/brand/logo-stamp-vit.png";

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function firstNameOf(fullName: string | null | undefined, fallback = "vän"): string {
  const t = (fullName ?? "").trim();
  if (!t) return fallback;
  return t.split(/\s+/)[0];
}

/* ---------------- Shared shell (bevismailets visuella språk) ---------------- */

interface ShellArgs {
  heroLine: string;              // spärrad monospace, uppercase
  title: string;                 // rubrik
  intro?: string;                // ledande stycke (kan innehålla HTML — kallare eskaperar)
  cardExtraHtml?: string;        // stort centrerat innehåll (t.ex. lagkod)
  bullets: { label: string; text: string }[];
  ctaLabel: string;
  ctaUrl: string;
  footerNote?: string;
}

function renderShell(a: ShellArgs, subject: string): { subject: string; html: string } {
  const bricolage = "'Bricolage Grotesque',Helvetica,Arial,sans-serif";
  const body = "Helvetica,Arial,sans-serif";
  const mono = "'Courier New',monospace";

  const bulletsHtml = a.bullets.map((b, i) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${i === a.bullets.length - 1 ? "0" : "14px"};"><tr>
      <td width="16" valign="top" style="padding-top:6px;"><div style="width:6px;height:6px;border-radius:50%;background:#DCBE6E;"></div></td>
      <td style="padding-left:8px;">
        <div style="font-family:${mono};font-weight:700;font-size:11px;letter-spacing:0.24em;color:#0B3D2E;text-transform:uppercase;">${escapeHtml(b.label)}</div>
        <div style="font-family:${body};font-size:14px;line-height:1.55;color:#52705F;margin-top:4px;">${escapeHtml(b.text)}</div>
      </td>
    </tr></table>
  `).join("");

  const html = `<!doctype html>
<html lang="sv"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(subject)}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:#F4FAF5;font-family:${body};color:#0B3D2E;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF5;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- HERO -->
      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B3D2E;border-radius:20px;">
          <tr><td align="center" style="padding:36px 28px 32px;">
            <img src="${STAMP_WHITE}" width="68" height="68" alt="" style="display:block;margin:0 auto 18px;width:68px;height:68px;" />
            <div style="font-family:${mono};font-size:11px;letter-spacing:0.32em;color:#9FD9B6;text-transform:uppercase;">${escapeHtml(a.heroLine)}</div>
            <div style="margin-top:14px;font-family:${bricolage};font-weight:700;font-size:28px;line-height:1.2;color:#ffffff;">${escapeHtml(a.title)}</div>
          </td></tr>
        </table>
      </td></tr>

      <!-- CONTENT CARD -->
      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #D9EBE0;border-radius:18px;">
          <tr><td style="padding:32px 32px 28px;">
            ${a.intro ? `<div style="font-family:${body};font-size:15px;line-height:1.6;color:#3D5648;text-align:center;margin:0 0 20px;">${a.intro}</div>` : ""}
            ${a.cardExtraHtml ?? ""}
            <div style="margin-top:6px;">${bulletsHtml}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 0 4px;">
              <a href="${a.ctaUrl}" style="display:inline-block;background:#1E9E6A;color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:999px;font-family:${body};font-weight:600;font-size:14px;">${escapeHtml(a.ctaLabel)}</a>
            </td></tr></table>
            ${a.footerNote ? `<div style="text-align:center;font-family:${mono};font-size:10px;letter-spacing:0.22em;color:#6E9483;text-transform:uppercase;margin-top:16px;">${escapeHtml(a.footerNote)}</div>` : ""}
          </td></tr>
        </table>
      </td></tr>

      <!-- CLOSING -->
      <tr><td style="padding:0 0 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B3D2E;border-radius:20px;">
          <tr><td align="center" style="padding:24px 28px;">
            <div style="font-family:${mono};font-size:12px;color:#9FD9B6;letter-spacing:0.08em;">Tänk smart, vi har ett gemensamt klimat.</div>
          </td></tr>
        </table>
      </td></tr>

      <tr><td align="center" style="padding:6px 0 24px;font-family:${mono};font-size:11px;color:#6E9483;letter-spacing:0.08em;">SmartKlimat · Stockholm</td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
  return { subject, html };
}

/* ---------------- Seller welcome ---------------- */

interface SellerArgs {
  firstName: string;
  teamName: string;
}

export function renderSellerWelcomeEmail(a: SellerArgs): { subject: string; html: string } {
  const first = escapeHtml(a.firstName);
  return renderShell({
    heroLine: "VÄLKOMMEN TILL LAGET",
    title: `Nu kör vi, ${a.firstName}!`,
    intro: `Du är nu med i <b>${escapeHtml(a.teamName)}</b>. Varje sålt träd blir ett riktigt träd i lagets skog — och poäng till dig.`,
    bullets: [
      { label: "PLANTERA FÖRSTA TRÄDET", text: "Öppna appen och registrera din första försäljning — det är där resan börjar." },
      { label: "HÅLL ELDEN VID LIV", text: "En försäljning i veckan bygger din streak och ger bonuspoäng." },
      { label: "SPARA TURBON", text: "Använd Turbo-boosten på ditt bästa säljtillfälle för dubbla poäng." },
    ],
    ctaLabel: "Öppna Smaarty",
    ctaUrl: `${APP_BASE}/saljare`,
  }, `Välkommen till ${a.teamName} — nu kör vi, ${first.replace(/&#39;/g, "'")}!`);
}

/* ---------------- Leader welcome ---------------- */

interface LeaderArgs {
  firstName: string;
  teamName: string;
  joinCode: string;
}

export function renderLeaderWelcomeEmail(a: LeaderArgs): { subject: string; html: string } {
  const shareUrl = `${APP_BASE}/aktivera?lag=${encodeURIComponent(a.joinCode)}`;
  const codeBlock = `
    <div style="text-align:center;margin:8px 0 22px;">
      <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.28em;color:#15784F;text-transform:uppercase;margin-bottom:10px;">Lagkod till ${escapeHtml(a.teamName)}</div>
      <div style="font-family:'Courier New',monospace;font-weight:700;font-size:52px;letter-spacing:0.18em;color:#0B3D2E;padding:16px 12px;background:#EAF7EE;border-radius:14px;">${escapeHtml(a.joinCode)}</div>
      <div style="margin-top:14px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#52705F;">Delbar länk:</div>
      <div style="margin-top:4px;"><a href="${shareUrl}" style="font-family:'Courier New',monospace;font-size:13px;color:#15784F;text-decoration:none;word-break:break-all;">${shareUrl}</a></div>
    </div>
  `;
  return renderShell({
    heroLine: "ERT LAG ÄR IGÅNG",
    title: `${a.teamName} är i luften!`,
    intro: `Bra jobbat, ${escapeHtml(a.firstName)} — nu är laget skarpt. Dela lagkoden med dina säljare så kopplas de in på sekunden.`,
    cardExtraHtml: codeBlock,
    bullets: [
      { label: "MINI-MÅL FÖRSTA VECKAN", text: "Sätt ett litet, nåbart mål tillsammans — vinsten ligger i den första försäljningen per säljare." },
      { label: "VISA LOGGEN PÅ TRÄNINGEN", text: "Öppna ledarvyn på skärm eller mobil — laget växer när alla ser det gemensamma trädet." },
      { label: "PRISERNA DELAS UT AV DIG", text: "Belöningar syns i appen, men det är du som stämplar av dem — det gör dem värda mer." },
    ],
    ctaLabel: "Öppna ledarvyn",
    ctaUrl: `${APP_BASE}/saljare`,
  }, `${a.teamName} är igång — lagkod ${a.joinCode}`);
}

/* ---------------- Idempotent send helpers ---------------- */

async function markAndSend(args: {
  userId: string;
  teamId: string;
  kind: "seller" | "leader";
  to: string;
  subject: string;
  html: string;
}) {
  // Reserve idempotency row first — insert returns 0 rows on conflict so we skip.
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("welcome_emails_sent" as unknown as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ user_id: args.userId, kind: args.kind, team_id: args.teamId, sent_to: args.to } as any)
    .select("user_id");
  if (insErr) {
    // Likely PK conflict → already sent. Log and stop.
    console.log("[welcome-email] skip (already sent)", { userId: args.userId, kind: args.kind, teamId: args.teamId, error: insErr.message });
    return;
  }
  if (!inserted || inserted.length === 0) return;

  const res = await sendEmail({ to: args.to, subject: args.subject, html: args.html, from: WELCOME_FROM });
  console.log("[welcome-email] sent", { kind: args.kind, userId: args.userId, teamId: args.teamId, ok: res.ok, status: res.status, messageId: res.messageId });
  if (!res.ok) {
    // Roll back the marker so a retry (e.g. next join) can resend.
    await supabaseAdmin
      .from("welcome_emails_sent" as unknown as never)
      .delete()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .match({ user_id: args.userId, kind: args.kind, team_id: args.teamId } as any);
  }
}

export async function sendSellerWelcomeIfNew(params: { userId: string; teamId: string }) {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, is_minor, guardian_email")
      .eq("user_id", params.userId)
      .maybeSingle();
    if (!profile) return;
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("name")
      .eq("id", params.teamId)
      .maybeSingle();
    if (!team) return;

    const firstName = firstNameOf(profile.name, "vän");
    const recipient = profile.is_minor && profile.guardian_email ? profile.guardian_email : profile.email;
    if (!recipient) return;

    const { subject, html } = renderSellerWelcomeEmail({ firstName, teamName: team.name });
    await markAndSend({
      userId: params.userId,
      teamId: params.teamId,
      kind: "seller",
      to: recipient,
      subject,
      html,
    });
  } catch (err) {
    console.error("[welcome-email] seller failed", { userId: params.userId, teamId: params.teamId, error: (err as Error).message });
  }
}

export async function sendLeaderWelcomeIfNew(params: { userId: string; teamId: string }) {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, is_minor, guardian_email")
      .eq("user_id", params.userId)
      .maybeSingle();
    if (!profile) return;
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("name, join_code")
      .eq("id", params.teamId)
      .maybeSingle();
    if (!team || !team.join_code) return;

    const firstName = firstNameOf(profile.name, "kapten");
    const recipient = profile.is_minor && profile.guardian_email ? profile.guardian_email : profile.email;
    if (!recipient) return;

    const { subject, html } = renderLeaderWelcomeEmail({
      firstName,
      teamName: team.name,
      joinCode: team.join_code,
    });
    await markAndSend({
      userId: params.userId,
      teamId: params.teamId,
      kind: "leader",
      to: recipient,
      subject,
      html,
    });
  } catch (err) {
    console.error("[welcome-email] leader failed", { userId: params.userId, teamId: params.teamId, error: (err as Error).message });
  }
}
