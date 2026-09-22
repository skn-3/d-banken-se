import { createFileRoute } from "@tanstack/react-router";

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>
  body { margin:0; background:#F4FAF5; font-family: Helvetica, Arial, sans-serif; color:#0B3D2E; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
  .card { max-width: 480px; width:100%; background:#ffffff; border:1px solid #D9EBE0; border-radius:18px; padding:36px 32px; text-align:center; }
  h1 { font-size:24px; margin:0 0 12px; }
  p { margin:0 0 8px; color:#334E42; font-size:15px; line-height:1.55; }
  .eyebrow { font-family:'Courier New', monospace; font-size:11px; letter-spacing:0.28em; color:#15784F; text-transform:uppercase; margin-bottom:14px; }
</style></head>
<body><div class="card"><div class="eyebrow">SmartKlimat</div>${body}</div></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export const Route = createFileRoute("/api/public/aterkalla")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = (new URL(request.url).searchParams.get("t") ?? "").trim();
        if (!token || token.length < 16) {
          return page("Ogiltig länk", `<h1>Ogiltig länk</h1><p>Länken saknar information. Kopiera hela länken från mailet.</p>`, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: kase } = await supabaseAdmin
          .from("mockfjards_cases")
          .select("case_id, claim_code, claim_email, purchase_id, certificate_id, revoked_at")
          .eq("revoke_token", token)
          .maybeSingle();

        if (!kase) {
          return page("Ogiltig länk", `<h1>Ogiltig länk</h1><p>Vi kunde inte hitta något samtycke att återkalla.</p>`, 404);
        }
        if (kase.revoked_at) {
          return page("Redan återkallat", `<h1>Samtycket är redan återkallat.</h1><p>Ditt namn och din e-postadress är borttagna.</p>`);
        }

        const email = kase.claim_email;
        const now = new Date().toISOString();

        await supabaseAdmin.from("purchases")
          .update({ recipient_name: "", recipient_email: null })
          .eq("id", kase.purchase_id);
        await supabaseAdmin.from("certificates")
          .update({ recipient_name: "" })
          .eq("id", kase.certificate_id);
        await supabaseAdmin.from("mockfjards_cases").update({
          claim_name: null,
          claim_email: null,
          updates_opt_in: false,
          revoked_at: now,
          updated_at: now,
        }).eq("case_id", kase.case_id);

        if (email) {
          await supabaseAdmin.from("consent_log").insert({
            claim_code: kase.claim_code,
            case_id: kase.case_id,
            email,
            name: "(återkallat)",
            text_version: "v1-2026-09-22",
            consent_certificate: false,
            consent_updates: false,
            action: "revoked",
          });
          await supabaseAdmin.from("email_suppression")
            .upsert({ email, reason: "consent_revoked" }, { onConflict: "email" });
        }

        return page(
          "Samtycket är återkallat",
          `<h1>Samtycket är återkallat.</h1><p>Ditt namn och din e-postadress är borttagna från värdebeviset och vi skickar inga fler mail.</p><p style="margin-top:14px;color:#6E9483;font-size:13px;">Beviset finns kvar anonymt så att träden fortfarande kan verifieras.</p>`,
        );
      },
    },
  },
});
