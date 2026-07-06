import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function verifyCron(request: Request): boolean {
  const expected = process.env.SMARTKLIMAT_CRON_SECRET ?? "";
  if (!expected) return false;
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  const header = request.headers.get("x-cron-secret") ?? bearer;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const APP_URL = "https://app.smartklimat.org";

export const Route = createFileRoute("/api/public/hooks/deliver-scheduled-certs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!verifyCron(request)) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { renderThanksEmail, sendEmail } = await import("@/lib/email/resend.server");

        // Reserve up to 50 rows with an atomic lease (status='scheduled' -> 'delivering').
        // A second parallel run wouldn't find them again, so no double-send.
        const nowIso = new Date().toISOString();
        // Postgres has no LIMIT on UPDATE; use a subquery of ids.
        const { data: candidates, error: selErr } = await supabaseAdmin
          .from("certificates")
          .select("id")
          .eq("status", "scheduled")
          .lte("deliver_at", nowIso)
          .order("deliver_at", { ascending: true })
          .limit(50);
        if (selErr) return Response.json({ ok: false, error: selErr.message }, { status: 500 });
        const ids = (candidates ?? []).map((r) => r.id as string);
        if (!ids.length) return Response.json({ ok: true, delivered: 0, failed: 0 });

        const { data: leased, error: leaseErr } = await supabaseAdmin
          .from("certificates")
          .update({ status: "delivering" })
          .in("id", ids)
          .eq("status", "scheduled")
          .select("id, verification_id, recipient_name, tree_count, location_name, greeting, deliver_at, recipient_delivery_email, buyer_name_snapshot, template_snapshot, purchase_id");
        if (leaseErr) return Response.json({ ok: false, error: leaseErr.message }, { status: 500 });

        let delivered = 0, failed = 0;
        for (const cert of leased ?? []) {
          try {
            const to = String(cert.recipient_delivery_email ?? "").trim();
            if (!to) throw new Error("missing_recipient_delivery_email");

            // Härled hero-bild från purchase.theme_id -> greeting_themes.config.kort
            let heroImageUrl: string | null = null;
            if (cert.purchase_id) {
              const { data: pur } = await supabaseAdmin
                .from("purchases")
                .select("theme_id, total_amount_ore, created_at")
                .eq("id", cert.purchase_id).maybeSingle();
              if (pur?.theme_id) {
                const { data: th } = await supabaseAdmin
                  .from("greeting_themes").select("config").eq("id", pur.theme_id).maybeSingle();
                const kort = (th?.config as { kort?: string } | null)?.kort;
                if (kort) heroImageUrl = kort.startsWith("http") ? kort : `${APP_URL}${kort}`;
              }
            }

            const dateText = new Date().toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
            const { subject, html } = renderThanksEmail({
              recipientName: cert.recipient_name as string,
              recipientEmail: to,
              treeCount: Number(cert.tree_count ?? 0),
              totalKr: "",
              dateText,
              verificationId: cert.verification_id as string,
              verifyUrl: `${APP_URL}/v/${cert.verification_id}`,
              locationName: (cert.location_name as string | null) ?? null,
              giftMessage: (cert.greeting as string | null) ?? null,
              giftFromName: (cert.buyer_name_snapshot as string | null) ?? null,
              heroImageUrl,
            });
            const ok = await sendEmail({ to, subject, html });
            if (!ok) throw new Error("send_failed");

            const { error: doneErr } = await supabaseAdmin
              .from("certificates")
              .update({ status: "delivered", delivered_at: new Date().toISOString() })
              .eq("id", cert.id as string)
              .eq("status", "delivering");
            if (doneErr) throw new Error("mark_delivered: " + doneErr.message);
            delivered++;
          } catch (e) {
            failed++;
            console.error("[deliver-scheduled-certs] failed", cert.verification_id, (e as Error).message);
            // Release the lease so nästa körning provar igen.
            await supabaseAdmin
              .from("certificates")
              .update({ status: "scheduled" })
              .eq("id", cert.id as string)
              .eq("status", "delivering");
          }
        }
        return Response.json({ ok: true, delivered, failed });
      },
    },
  },
});
