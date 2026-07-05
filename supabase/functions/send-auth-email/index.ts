// Supabase Auth "Send Email" webhook. Renders branded Smaarty auth emails
// and sends via Resend from Smaarty <konto@send.smartklimat.org>.
//
// This function REPLACES all default Supabase auth emails. No action type
// falls back to Supabase's built-in templates.

import { Webhook } from "https://esm.sh/standard-webhooks@1.0.0/dist/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature",
};

const FROM = "Smaarty <konto@send.smartklimat.org>";
const STAMP = "https://smartklimat.org/brand/logo-stamp-vit.png";

type ActionType =
  | "signup"
  | "recovery"
  | "magiclink"
  | "invite"
  | "email_change"
  | "email_change_current"
  | "email_change_new"
  | "reauthentication";

interface HookPayload {
  user: { email: string; new_email?: string };
  email_data: {
    token: string;
    token_hash: string;
    token_hash_new?: string;
    redirect_to: string;
    email_action_type: ActionType;
    site_url: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const raw = await req.text();
    const secretRaw = Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "";
    // Supabase stores the secret as `v1,whsec_<base64>`; strip the prefix for standard-webhooks.
    const secret = secretRaw.replace(/^v1,whsec_/, "").replace(/^whsec_/, "");

    if (!secret) return new Response("hook secret missing", { status: 500, headers: corsHeaders });

    const headers = Object.fromEntries(req.headers.entries());
    const wh = new Webhook(secret);
    const payload = wh.verify(raw, headers) as HookPayload;

    const { user, email_data } = payload;
    const type = email_data.email_action_type;

    // Build the verify URL Supabase Auth expects.
    const hash = type === "email_change" ? (email_data.token_hash_new || email_data.token_hash) : email_data.token_hash;
    const actionUrl = `${email_data.site_url}/auth/v1/verify?token=${hash}&type=${type}&redirect_to=${encodeURIComponent(email_data.redirect_to || email_data.site_url)}`;

    const to = type === "email_change" ? (user.new_email || user.email) : user.email;
    const { subject, html } = renderEmail(type, actionUrl);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return new Response("resend key missing", { status: 500, headers: corsHeaders });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("Resend failed", res.status, t);
      return new Response(`resend ${res.status}: ${t}`, { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-auth-email error", e);
    return new Response(`error: ${e instanceof Error ? e.message : String(e)}`, { status: 400, headers: corsHeaders });
  }
});

// ————— Templates —————

interface Copy { subject: string; title: string; body: string; cta: string; hint: string; }

function copyFor(type: ActionType): Copy {
  switch (type) {
    case "recovery":
      return {
        subject: "Återställ ditt lösenord — Smaarty",
        title: "Glömt lösenordet?",
        body: "Ingen fara — tryck på knappen så väljer du ett nytt. Länken gäller i en timme.",
        cta: "Välj nytt lösenord",
        hint: "Bad du inte om detta? Ignorera mailet, inget händer.",
      };
    case "signup":
      return {
        subject: "Bekräfta ditt konto — Smaarty",
        title: "Bekräfta ditt konto",
        body: "Ett tryck så är du igång — välkommen till laget!",
        cta: "Bekräfta kontot",
        hint: "Bad du inte om detta? Ignorera mailet, inget händer.",
      };
    case "magiclink":
      return {
        subject: "Din inloggningslänk — Smaarty",
        title: "Logga in med ett tryck",
        body: "Tryck på knappen för att logga in direkt. Länken gäller i en timme.",
        cta: "Logga in",
        hint: "Bad du inte om detta? Ignorera mailet, inget händer.",
      };
    case "invite":
      return {
        subject: "Du är inbjuden till Smaarty",
        title: "Välkommen till laget!",
        body: "Du har blivit inbjuden till Smaarty. Tryck på knappen för att sätta ditt lösenord och komma igång.",
        cta: "Aktivera kontot",
        hint: "Frågor? Svara på det här mailet så hjälper vi dig.",
      };
    case "email_change":
    case "email_change_current":
    case "email_change_new":
      return {
        subject: "Bekräfta din nya e-postadress — Smaarty",
        title: "Bekräfta din nya e-post",
        body: "Tryck på knappen för att bekräfta att den här adressen är din.",
        cta: "Bekräfta e-postadressen",
        hint: "Bad du inte om detta? Kontakta oss direkt så säkrar vi kontot.",
      };
    case "reauthentication":
      return {
        subject: "Bekräfta att det är du — Smaarty",
        title: "Bekräfta att det är du",
        body: "Vi behöver bara veta att det är du innan vi fortsätter. Tryck på knappen så är det klart.",
        cta: "Det är jag",
        hint: "Kändes det här oväntat? Ignorera mailet, inget händer.",
      };
    default:
      return {
        subject: "Meddelande från Smaarty",
        title: "Ett tryck så är du igång",
        body: "Tryck på knappen för att fortsätta.",
        cta: "Fortsätt",
        hint: "Bad du inte om detta? Ignorera mailet, inget händer.",
      };
  }
}

function renderEmail(type: ActionType, actionUrl: string): { subject: string; html: string } {
  const c = copyFor(type);
  const html = `<div style="background:#F4FAF5;padding:32px 16px;font-family:Arial,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#0B3D2E;border-radius:16px 16px 0 0;padding:28px;text-align:center">
    <img src="${STAMP}" width="48" alt="SmartKlimat">
    <p style="color:#9FD9B6;font-family:monospace;font-size:11px;letter-spacing:3px;margin:12px 0 0">S M A A R T Y</p>
  </div>
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:0 0 16px 16px;padding:28px;text-align:center">
    <h1 style="color:#0B3D2E;font-size:20px;margin:0 0 8px">${escape(c.title)}</h1>
    <p style="color:#3D5648;font-size:14px;line-height:1.6;margin:0 0 20px">${escape(c.body)}</p>
    <a href="${actionUrl}" style="display:inline-block;background:#1E9E6A;color:#fff;text-decoration:none;padding:12px 28px;border-radius:24px;font-weight:bold;font-size:14px">${escape(c.cta)}</a>
    <p style="color:#6E9483;font-size:12px;margin:20px 0 0">${escape(c.hint)}</p>
  </div>
</div>`;
  return { subject: c.subject, html };
}

function escape(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
