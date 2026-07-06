import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const adminSetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      targetUserId: z.string().uuid(),
      newPassword: z.string().min(8).max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.targetUserId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      email: z.string().email(),
      redirectTo: z.string().url(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { sendRecoveryEmail } = await import("@/lib/auth-email.server");
    await sendRecoveryEmail({ email: data.email, redirectTo: data.redirectTo });
    return { ok: true, actionLink: null };
  });

// ---- Admin corrections (audit-logged) ---------------------------------

async function logAdminActivity(userId: string, action: string, detail: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabaseAdmin as any).from("admin_activity").insert({ user_id: userId, action, detail });
}

export const adminUpdatePurchaseCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      purchaseId: z.string().uuid(),
      status: z.enum(["pending", "paid", "failed", "refunded", "cancelled"]).optional(),
      adminNote: z.string().trim().max(2000).optional(),
      reason: z.string().trim().min(3).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before, error: readErr } = await supabaseAdmin
      .from("purchases").select("id, status, admin_note").eq("id", data.purchaseId).maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!before) throw new Error("Köp saknas");
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.adminNote !== undefined) patch.admin_note = data.adminNote;
    if (Object.keys(patch).length === 0) throw new Error("Inget att uppdatera");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (supabaseAdmin as any).from("purchases").update(patch).eq("id", data.purchaseId);
    if (updErr) throw new Error(updErr.message);
    await logAdminActivity(context.userId, "purchase.correction", {
      purchase_id: data.purchaseId,
      reason: data.reason,
      before: { status: before.status, admin_note: before.admin_note },
      after: { status: data.status ?? before.status, admin_note: data.adminNote ?? before.admin_note },
    });
    return { ok: true };
  });

export const adminReissueCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      certificateId: z.string().uuid(),
      recipientName: z.string().trim().min(1).max(200).optional(),
      greeting: z.string().trim().max(2000).nullable().optional(),
      reason: z.string().trim().min(3).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: old, error: readErr } = await supabaseAdmin
      .from("certificates").select("*").eq("id", data.certificateId).maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!old) throw new Error("Certifikat saknas");
    if (old.superseded_by) throw new Error("Denna rad är redan ersatt");

    const newRow = {
      purchase_id: old.purchase_id,
      user_id: old.user_id,
      verification_id: old.verification_id,
      recipient_name: data.recipientName ?? old.recipient_name,
      tree_count: old.tree_count,
      location_name: old.location_name,
      latitude: old.latitude,
      longitude: old.longitude,
      template_snapshot: old.template_snapshot,
      customer_id: old.customer_id,
      template_id: old.template_id,
      greeting: data.greeting === undefined ? old.greeting : data.greeting,
      superseded_by: null as string | null,
    };

    // Mark old superseded first (frees the active-unique index) so insert can reuse verification_id
    // We do it in a two-step; if insert fails we roll back.
    const { error: markErr } = await supabaseAdmin
      .from("certificates").update({ superseded_by: old.id }).eq("id", old.id);
    if (markErr) throw new Error(markErr.message);

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("certificates").insert(newRow).select("id").maybeSingle();
    if (insErr || !inserted) {
      // rollback
      await supabaseAdmin.from("certificates").update({ superseded_by: null }).eq("id", old.id);
      throw new Error(insErr?.message ?? "Kunde inte skapa ny certifikatrad");
    }
    // point old.superseded_by to the new row so history is chained
    await supabaseAdmin.from("certificates").update({ superseded_by: inserted.id }).eq("id", old.id);

    await logAdminActivity(context.userId, "certificate.reissue", {
      verification_id: old.verification_id,
      old_certificate_id: old.id,
      new_certificate_id: inserted.id,
      reason: data.reason,
      before: {
        recipient_name: old.recipient_name,
        greeting: old.greeting,
      },
      after: {
        recipient_name: newRow.recipient_name,
        greeting: newRow.greeting,
      },
    });
    return { ok: true, newCertificateId: inserted.id };
  });

export const adminAdjustPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      sellerUserId: z.string().uuid(),
      delta: z.number().int().refine((v) => v !== 0, "delta får inte vara 0"),
      reason: z.string().trim().min(3, "motivering krävs").max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await supabaseAdmin
      .from("point_transactions")
      .insert({
        seller_user_id: data.sellerUserId,
        delta: data.delta,
        type: "adjustment",
        description: data.reason,
        metadata: { by_admin: context.userId },
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    await logAdminActivity(context.userId, "points.adjustment", {
      seller_user_id: data.sellerUserId,
      delta: data.delta,
      reason: data.reason,
      point_transaction_id: inserted?.id ?? null,
    });
    return { ok: true, id: inserted?.id ?? null };
  });
