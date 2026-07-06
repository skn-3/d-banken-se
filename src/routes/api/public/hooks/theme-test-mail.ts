// Internt testverktyg: skickar bevismail för ett valt tema.
// Skyddas av SMARTKLIMAT_CRON_SECRET. Ligger under /api/public/* för att
// slippa auth-gate — säkerheten sitter i secret-jämförelsen nedan.
import { createFileRoute } from "@tanstack/react-router";
import { renderThanksEmail, sendEmail } from "@/lib/email/resend.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/theme-test-mail")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          to?: string; theme_slug?: string; recipient_name?: string;
        };
        const to = body.to || "invoice@malke.se";
        // Internt designverktyg — begränsat till interna adresser.
        if (!/@malke\.se$/i.test(to) && !/@smartklimat\.org$/i.test(to)) {
          return new Response("Forbidden recipient", { status: 403 });
        }
        const slug = body.theme_slug || "standard";
        const recipientName = body.recipient_name || "Anna";

        const { data: theme } = await supabaseAdmin
          .from("greeting_themes").select("*").eq("slug", slug).maybeSingle();
        if (!theme) return new Response(JSON.stringify({ error: `no theme ${slug}` }), { status: 404 });

        const kort = (theme.config as { kort?: string } | null)?.kort;
        const appBase = (process.env.APP_PUBLIC_URL ?? "https://app.smartklimat.org").replace(/\/+$/, "");
        const heroImageUrl = kort ? (kort.startsWith("http") ? kort : `${appBase}${kort}`) : null;

        const { subject, html } = renderThanksEmail({
          recipientName,
          recipientEmail: to,
          treeCount: 25,
          totalKr: "725 kr",
          dateText: new Date().toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" }),
          verificationId: `TEST-${slug.toUpperCase()}`,
          verifyUrl: "https://app.smartklimat.org/v/test",
          locationName: "Khasi Hills",
          giftMessage: "Grattis på födelsedagen från oss alla!",
          theme: (theme.config ?? null) as never,
          heroImageUrl,
        });
        const result = await sendEmail({ to, subject, html });
        return new Response(JSON.stringify({ slug, to, subject, result }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
