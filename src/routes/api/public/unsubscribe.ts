import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>
  body { margin:0; background:#F4FAF5; font-family: Helvetica, Arial, sans-serif; color:#0B3D2E; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
  .card { max-width: 480px; width:100%; background:#ffffff; border:1px solid #D9EBE0; border-radius:18px; padding:36px 32px; text-align:center; }
  h1 { font-family: 'Bricolage Grotesque', Helvetica, Arial, sans-serif; font-size:26px; margin:0 0 12px; color:#0B3D2E; }
  p { margin:0 0 8px; color:#334E42; font-size:15px; line-height:1.55; }
  .eyebrow { font-family:'Courier New', monospace; font-size:11px; letter-spacing:0.28em; color:#15784F; text-transform:uppercase; margin-bottom:14px; }
</style></head>
<body><div class="card"><div class="eyebrow">SmartKlimat</div>${body}</div></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export const Route = createFileRoute("/api/public/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const email = (url.searchParams.get("e") ?? "").trim().toLowerCase();
        const token = url.searchParams.get("t") ?? "";
        const secret = process.env.SMARTKLIMAT_UNSUBSCRIBE_SECRET;

        if (!email || !token || !secret) {
          return page("Ogiltig länk", `<h1>Ogiltig länk</h1><p>Länken saknar information. Prova att kopiera hela länken från mailet.</p>`, 400);
        }

        const expected = b64url(createHmac("sha256", secret).update(email).digest());
        const a = Buffer.from(expected);
        const b = Buffer.from(token);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return page("Ogiltig länk", `<h1>Ogiltig länk</h1><p>Vi kunde inte verifiera länken.</p>`, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("email_suppression")
          .upsert({ email, reason: "unsubscribed" }, { onConflict: "email" });

        return page("Du är avregistrerad", `<h1>Du är avregistrerad.</h1><p>Adressen <strong>${email.replace(/[<>&]/g, "")}</strong> tar inte längre emot utskick från SmartKlimat.</p><p style="margin-top:16px;color:#6E9483;font-size:13px;">Bevismail för dina egna köp fortsätter att skickas.</p>`);
      },
    },
  },
});
