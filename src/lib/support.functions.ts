import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHeader } from "@tanstack/react-start/server";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId, _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

async function logActivity(userId: string, action: string, detail: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_activity").insert({
    user_id: userId, action, detail: detail as any,
  });
}

// ---------- GLOBAL SEARCH ----------

const SearchSchema = z.object({ q: z.string().trim().min(1).max(120) });

export const supportSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const term = `%${data.q}%`;

    const [customers, sellers, teams, certs] = await Promise.all([
      supabaseAdmin.from("customers")
        .select("id, name, email")
        .or(`name.ilike.${term},email.ilike.${term}`)
        .limit(15),
      supabaseAdmin.from("profiles")
        .select("user_id, name, email, disabled_at")
        .or(`name.ilike.${term},email.ilike.${term}`)
        .limit(15),
      supabaseAdmin.from("teams")
        .select("id, name, join_code")
        .or(`name.ilike.${term},join_code.ilike.${term}`)
        .limit(15),
      supabaseAdmin.from("certificates")
        .select("id, verification_id, recipient_name, tree_count, purchase_id")
        .ilike("verification_id", term)
        .limit(15),
    ]);

    return {
      customers: (customers.data ?? []).map((c: any) => ({ id: c.id, name: c.name, email: c.email })),
      sellers: (sellers.data ?? []).map((p: any) => ({ userId: p.user_id, name: p.name, email: p.email, disabled: !!p.disabled_at })),
      teams: (teams.data ?? []).map((t: any) => ({ id: t.id, name: t.name, joinCode: t.join_code })),
      certificates: (certs.data ?? []).map((c: any) => ({ id: c.id, verificationId: c.verification_id, recipientName: c.recipient_name, treeCount: c.tree_count, purchaseId: c.purchase_id })),
    };
  });

// ---------- NOTES ----------

const NoteSchema = z.object({
  subjectType: z.enum(["customer", "seller", "team", "certificate", "purchase"]),
  subjectId: z.string().min(1).max(200),
  note: z.string().trim().min(1).max(2000),
});

export const listAdminNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    subjectType: z.enum(["customer", "seller", "team", "certificate", "purchase"]),
    subjectId: z.string().min(1),
  }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: notes } = await supabaseAdmin
      .from("admin_notes")
      .select("id, note, created_at, created_by")
      .eq("subject_type", data.subjectType)
      .eq("subject_id", data.subjectId)
      .order("created_at", { ascending: false });
    const authorIds = Array.from(new Set((notes ?? []).map((n: any) => n.created_by)));
    const { data: authors } = await supabaseAdmin
      .from("profiles")
      .select("user_id, name")
      .in("user_id", authorIds.length ? authorIds : ["00000000-0000-0000-0000-000000000000"]);
    const byUser: Record<string, string> = {};
    (authors ?? []).forEach((a: any) => { byUser[a.user_id] = a.name || "Admin"; });
    return (notes ?? []).map((n: any) => ({
      id: n.id, note: n.note, createdAt: n.created_at,
      authorName: byUser[n.created_by] ?? "Admin",
    }));
  });

export const addAdminNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => NoteSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_notes").insert({
      subject_type: data.subjectType,
      subject_id: data.subjectId,
      note: data.note,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await logActivity(context.userId, "note_added", { subjectType: data.subjectType, subjectId: data.subjectId });
    return { ok: true };
  });

// ---------- RESEND CERTIFICATE EMAIL ----------

const ResendSchema = z.object({
  verificationId: z.string().min(1).max(60),
  toEmail: z.string().trim().email().max(255),
});

export const supportResendCertificateEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResendSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cert } = await supabaseAdmin
      .from("certificates")
      .select("id, verification_id, recipient_name, tree_count, location_name, issued_date, purchase_id")
      .eq("verification_id", data.verificationId)
      .maybeSingle();
    if (!cert) throw new Error("Bevis hittades inte.");

    const { data: purchase } = await supabaseAdmin
      .from("purchases")
      .select("total_amount_ore, created_at")
      .eq("id", cert.purchase_id)
      .maybeSingle();

    const { renderThanksEmail, sendEmail } = await import("@/lib/email/resend.server");
    const host = getRequestHeader("host") || "smartklimat.app";
    const proto = (getRequestHeader("x-forwarded-proto") || "https").split(",")[0];
    const verifyUrl = `${proto}://${host}/v/${cert.verification_id}`;
    const totalKr = purchase?.total_amount_ore
      ? `${(purchase.total_amount_ore / 100).toLocaleString("sv-SE")} kr`
      : "";
    const dateText = new Date(purchase?.created_at ?? cert.issued_date).toLocaleDateString("sv-SE", {
      year: "numeric", month: "long", day: "numeric",
    });

    const { subject, html } = renderThanksEmail({
      recipientName: cert.recipient_name,
      recipientEmail: data.toEmail,
      treeCount: cert.tree_count,
      totalKr,
      dateText,
      verificationId: cert.verification_id,
      verifyUrl,
      locationName: cert.location_name,
    });
    const res = await sendEmail({ to: data.toEmail, subject, html });
    await logActivity(context.userId, "cert_email_resent", {
      verificationId: cert.verification_id, toEmail: data.toEmail, ok: res.ok === true,
    });
    if (!res.ok) throw new Error("Mailutskick misslyckades.");
    return { ok: true };
  });

// ---------- PASSWORD RESET ----------

export const supportSendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    userId: z.string().uuid(),
  }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("email").eq("user_id", data.userId).maybeSingle();
    if (!prof?.email) throw new Error("Ingen e-post kopplad till kontot.");

    const host = getRequestHeader("host") || "smartklimat.app";
    const proto = (getRequestHeader("x-forwarded-proto") || "https").split(",")[0];
    const redirectTo = `${proto}://${host}/reset-password`;

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(prof.email, { redirectTo });
    if (error) throw new Error(error.message);
    await logActivity(context.userId, "password_reset_sent", { userId: data.userId, email: prof.email });
    return { ok: true, email: prof.email };
  });

// ---------- ACCOUNT DISABLE / ENABLE ----------

export const supportSetAccountDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    userId: z.string().uuid(),
    disabled: z.boolean(),
  }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Du kan inte inaktivera ditt eget konto.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.disabled ? "876000h" : "none",
    } as any);
    if (authErr) throw new Error(authErr.message);
    await supabaseAdmin.from("profiles")
      .update({ disabled_at: data.disabled ? new Date().toISOString() : null })
      .eq("user_id", data.userId);
    await logActivity(context.userId, data.disabled ? "account_disabled" : "account_reactivated", { userId: data.userId });
    return { ok: true };
  });

// ---------- DETAIL LOADERS ----------

export const getCustomerDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await supabaseAdmin.from("customers")
      .select("id, name, email, created_at").eq("id", data.id).maybeSingle();
    if (!c) throw new Error("Kund hittades inte.");
    const { data: purchases } = await supabaseAdmin.from("purchases")
      .select("id, tree_count, total_amount_ore, status, created_at, recipient_email")
      .eq("customer_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const purchaseIds = (purchases ?? []).map((p: any) => p.id);
    const { data: certs } = await supabaseAdmin.from("certificates")
      .select("verification_id, purchase_id, tree_count, location_name")
      .in("purchase_id", purchaseIds.length ? purchaseIds : ["00000000-0000-0000-0000-000000000000"]);
    const certByPurchase: Record<string, any> = {};
    (certs ?? []).forEach((cc: any) => { certByPurchase[cc.purchase_id] = cc; });
    return {
      customer: c,
      purchases: (purchases ?? []).map((p: any) => ({
        ...p, certificate: certByPurchase[p.id] ?? null,
      })),
    };
  });

export const getSellerDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles")
      .select("user_id, name, email, account_type, disabled_at, created_at, is_minor, guardian_email")
      .eq("user_id", data.userId).maybeSingle();
    if (!prof) throw new Error("Konto hittades inte.");
    const { data: member } = await supabaseAdmin.from("team_members")
      .select("team_id, role").eq("user_id", data.userId).maybeSingle();
    let team: any = null;
    if (member) {
      const { data: t } = await supabaseAdmin.from("teams")
        .select("id, name, join_code").eq("id", member.team_id).maybeSingle();
      team = t ? { ...t, role: member.role } : null;
    }
    const { data: purchases } = await supabaseAdmin.from("purchases")
      .select("id, tree_count, total_amount_ore, status, created_at, recipient_name, recipient_email")
      .eq("registered_by_user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    return { profile: prof, team, purchases: purchases ?? [] };
  });

export const getTeamDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team } = await supabaseAdmin.from("teams")
      .select("id, name, join_code, weekly_goal_trees, goal_trees, goal_end_date, project_location, created_by_user_id, organization_id, city, created_at")
      .eq("id", data.id).maybeSingle();
    if (!team) throw new Error("Lag hittades inte.");

    const { data: members } = await supabaseAdmin.from("team_members")
      .select("user_id, role, created_at").eq("team_id", team.id);
    const memberIds = (members ?? []).map((m: any) => m.user_id);
    const { data: profiles } = await supabaseAdmin.from("profiles")
      .select("user_id, name, email, disabled_at")
      .in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
    const profByUser: Record<string, any> = {};
    (profiles ?? []).forEach((p: any) => { profByUser[p.user_id] = p; });

    const { data: purchases } = await supabaseAdmin.from("purchases")
      .select("tree_count, total_amount_ore, team_share_ore, created_at, status")
      .eq("team_id", team.id).eq("status", "paid");
    const trees = (purchases ?? []).reduce((s: number, p: any) => s + (p.tree_count || 0), 0);
    const gross = (purchases ?? []).reduce((s: number, p: any) => s + (p.total_amount_ore || 0), 0);
    const teamShare = (purchases ?? []).reduce((s: number, p: any) => s + (p.team_share_ore || 0), 0);

    const { data: payouts } = await supabaseAdmin.from("payout_requests")
      .select("id, amount_ore, status, created_at")
      .eq("team_id", team.id).order("created_at", { ascending: false }).limit(20);

    const { data: feed } = await supabaseAdmin.from("activity_feed")
      .select("id, message, created_at, scope")
      .eq("team_id", team.id).order("created_at", { ascending: false }).limit(30);

    const leader = (members ?? []).find((m: any) => m.role === "team_leader");
    const leaderProf = leader ? profByUser[leader.user_id] : null;

    return {
      team,
      leader: leaderProf ? { userId: leaderProf.user_id, name: leaderProf.name, email: leaderProf.email } : null,
      members: (members ?? []).map((m: any) => ({
        userId: m.user_id, role: m.role, joinedAt: m.created_at,
        name: profByUser[m.user_id]?.name ?? "—",
        email: profByUser[m.user_id]?.email ?? null,
        disabled: !!profByUser[m.user_id]?.disabled_at,
      })),
      finance: { treesTotal: trees, grossOre: gross, teamShareOre: teamShare },
      payouts: payouts ?? [],
      feed: feed ?? [],
    };
  });
