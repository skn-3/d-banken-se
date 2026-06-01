import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, renderThanksEmail } from "@/lib/email/resend.server";
import { getRequestHeader } from "@tanstack/react-start/server";

const PRICE_PER_TREE_ORE = 3500;

export const getSellerContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: member } = await supabaseAdmin
      .from("team_members")
      .select("id, team_id, role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) return { isSeller: false as const };

    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("id, name, organization_id")
      .eq("id", member.team_id)
      .single();
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name, type")
      .eq("id", team!.organization_id)
      .single();

    const { data: purchases } = await supabaseAdmin
      .from("purchases")
      .select("id, tree_count, total_amount_ore, status, created_at, recipient_name, recipient_email")
      .eq("registered_by_user_id", context.userId)
      .eq("status", "paid")
      .order("created_at", { ascending: false });

    const treeCount = (purchases ?? []).reduce((s, p) => s + p.tree_count, 0);

    return {
      isSeller: true as const,
      role: member.role,
      team: { id: team!.id, name: team!.name },
      organization: { id: org!.id, name: org!.name, type: org!.type },
      treeCount,
      purchases: purchases ?? [],
    };
  });

const PurchaseSchema = z.object({
  treeCount: z.number().int().min(1).max(10000),
  recipientName: z.string().trim().min(1).max(120),
  recipientEmail: z.string().trim().email().max(255),
});

export const sellerCreatePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PurchaseSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Verify user is a team member
    const { data: member } = await supabaseAdmin
      .from("team_members")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) throw new Error("Du är inte registrerad som säljare.");

    const email = data.recipientEmail.toLowerCase();
    const name = data.recipientName;

    // Upsert customer
    const { data: existing } = await supabaseAdmin
      .from("customers")
      .select("id, name")
      .eq("email", email)
      .maybeSingle();
    let customerId: string;
    if (existing) {
      customerId = existing.id;
      if (existing.name !== name) {
        await supabaseAdmin.from("customers").update({ name, updated_at: new Date().toISOString() }).eq("id", customerId);
      }
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("customers")
        .insert({ email, name })
        .select("id")
        .single();
      if (error) throw new Error(`Kundskapande misslyckades: ${error.message}`);
      customerId = inserted.id;
    }

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
        registered_by_user_id: context.userId,
      })
      .select("id, created_at")
      .single();
    if (pErr) throw new Error(`Köpet misslyckades: ${pErr.message}`);

    const { data: cert, error: cErr } = await supabaseAdmin.rpc("generate_certificate", {
      _purchase_id: purchase.id,
    });
    if (cErr) throw new Error(`Värdebevis misslyckades: ${cErr.message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const certificate = cert as any;

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
    });
    const emailResult = await sendEmail({ to: email, subject, html });

    return {
      certificateJson: JSON.stringify(certificate),
      emailSent: emailResult.ok === true,
      recipientEmail: email,
    };
  });
