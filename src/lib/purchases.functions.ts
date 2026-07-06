import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, renderThanksEmail } from "@/lib/email/resend.server";
import { getRequestHeader } from "@tanstack/react-start/server";

const PRICE_PER_TREE_ORE = 3500;

const PurchaseSchema = z.object({
  treeCount: z.number().int().min(1).max(10000),
  recipientName: z.string().trim().min(1).max(120),
  recipientEmail: z.string().trim().email().max(255),
  templateId: z.string().uuid().nullable().optional(),
  greeting: z.string().trim().max(120).nullable().optional(),
});

export const createPurchase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PurchaseSchema.parse(input))
  .handler(async ({ data }) => {
    const email = data.recipientEmail.toLowerCase();
    const name = data.recipientName;

    // 1) Upsert customer
    const { data: existing } = await supabaseAdmin
      .from("customers").select("*").eq("email", email).maybeSingle();

    let customerId: string;
    if (existing) {
      customerId = existing.id;
      if (existing.name !== name) {
        await supabaseAdmin.from("customers").update({ name, updated_at: new Date().toISOString() }).eq("id", customerId);
      }
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("customers").insert({ email, name }).select("id").single();
      if (error) throw new Error(`Customer create failed: ${error.message}`);
      customerId = inserted.id;
    }

    // 2) Server-side greeting moderation
    let cleanGreeting: string | null = data.greeting?.trim() || null;
    if (cleanGreeting) {
      const { data: blocks } = await supabaseAdmin.from("greeting_blocklist").select("word");
      const lower = cleanGreeting.toLowerCase();
      const hit = (blocks ?? []).find((r) => r.word && lower.includes(r.word.toLowerCase()));
      if (hit) throw new Error("Hälsningen innehåller olämpligt ord.");
    }

    // 3) Insert purchase
    const total = data.treeCount * PRICE_PER_TREE_ORE;
    const { data: purchase, error: pErr } = await supabaseAdmin
      .from("purchases")
      .insert({
        customer_id: customerId,
        recipient_name: name,
        recipient_email: email,
        tree_count: data.treeCount,
        unit_price_ore: PRICE_PER_TREE_ORE,
        total_amount_ore: total,
        status: "paid",
        paid_at: new Date().toISOString(),
        source: "web",
        certificate_template_id: data.templateId ?? null,
        greeting: cleanGreeting,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("id, created_at")
      .single();
    if (pErr) throw new Error(`Purchase failed: ${pErr.message}`);

    // 3) Generate certificate
    const { data: cert, error: cErr } = await supabaseAdmin.rpc("generate_certificate", {
      _purchase_id: purchase.id,
    });
    if (cErr) throw new Error(`Certificate failed: ${cErr.message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const certificate = cert as any;

    // 4) Send thank-you email
    const host = getRequestHeader("host") || "smartklimat.app";
    const proto = (getRequestHeader("x-forwarded-proto") || "https").split(",")[0];
    const verifyUrl = `${proto}://${host}/v/${certificate.verification_id}`;
    const totalKr = `${(total / 100).toLocaleString("sv-SE")} kr`;
    const dateText = new Date(purchase.created_at).toLocaleDateString("sv-SE", {
      year: "numeric", month: "long", day: "numeric",
    });

    const { subject, html } = renderThanksEmail({
      recipientName: name,
      recipientEmail: email,
      treeCount: data.treeCount,
      totalKr,
      dateText,
      verificationId: certificate.verification_id,
      verifyUrl,
      locationName: certificate.location_name,
    });

    const emailResult = await sendEmail({ to: email, subject, html });

    return {
      certificateJson: JSON.stringify(certificate),
      emailSent: emailResult.ok === true,
      recipientEmail: email,
    };
  });
