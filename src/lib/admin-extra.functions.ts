import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

async function logActivity(userId: string, action: string, detail: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabaseAdmin as any).from("admin_activity").insert({ user_id: userId, action, detail });
}

// ---- 1) Activity log listing ------------------------------------------

export const adminListActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      action: z.string().trim().max(80).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).partial().parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (supabaseAdmin as any).from("admin_activity")
      .select("id, user_id, action, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.action && data.action.trim()) q = q.eq("action", data.action.trim());
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) {
      const d = new Date(data.to); d.setDate(d.getDate() + 1);
      q = q.lt("created_at", d.toISOString());
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((rows ?? []).map((r: { user_id: string | null }) => r.user_id).filter(Boolean))) as string[];
    let profileMap: Record<string, { name: string | null; email: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin.from("profiles")
        .select("user_id, name, email").in("user_id", userIds);
      profileMap = Object.fromEntries((profs ?? []).map((p) => [p.user_id, { name: p.name, email: p.email }]));
    }

    // Distinct action list for filter dropdown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: distinctRows } = await (supabaseAdmin as any).from("admin_activity")
      .select("action").order("created_at", { ascending: false }).limit(500);
    const actions = Array.from(new Set((distinctRows ?? []).map((r: { action: string }) => r.action))).sort() as string[];

    return {
      rows: (rows ?? []).map((r: { id: string; user_id: string | null; action: string; detail: unknown; created_at: string }) => ({
        id: r.id,
        user_id: r.user_id,
        admin_name: r.user_id ? (profileMap[r.user_id]?.name ?? profileMap[r.user_id]?.email ?? r.user_id.slice(0, 8)) : "system",
        admin_email: r.user_id ? profileMap[r.user_id]?.email ?? null : null,
        action: r.action,
        detail: r.detail,
        created_at: r.created_at,
      })),
      actions,
    };
  });

// ---- 2) Economy settings ----------------------------------------------

export const adminGetEconomySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("app_settings")
      .select("team_share_ore_per_tree, reward_budget_ore_per_tree").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return {
      team_share_ore_per_tree: data?.team_share_ore_per_tree ?? 0,
      reward_budget_ore_per_tree: data?.reward_budget_ore_per_tree ?? 0,
    };
  });

export const adminUpdateEconomySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      team_share_ore_per_tree: z.number().int().min(0).max(1000000),
      reward_budget_ore_per_tree: z.number().int().min(0).max(1000000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("app_settings")
      .select("team_share_ore_per_tree, reward_budget_ore_per_tree").eq("id", 1).maybeSingle();
    const { error } = await supabaseAdmin.from("app_settings").update({
      team_share_ore_per_tree: data.team_share_ore_per_tree,
      reward_budget_ore_per_tree: data.reward_budget_ore_per_tree,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) throw new Error(error.message);
    await logActivity(context.userId, "economy_settings_updated", {
      before: before ?? null, after: data,
    });
    return { ok: true };
  });

// ---- 3) CSV export of purchases ---------------------------------------

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const adminExportPurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (supabaseAdmin as any).from("purchases")
      .select("id, created_at, paid_at, recipient_name, recipient_email, customer_id, tree_count, total_amount_ore, status, source, theme_id, team_id")
      .order("created_at", { ascending: false })
      .limit(50000);
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) {
      const d = new Date(data.to); d.setDate(d.getDate() + 1);
      q = q.lt("created_at", d.toISOString());
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const customerIds = Array.from(new Set((rows ?? []).map((r: { customer_id: string | null }) => r.customer_id).filter(Boolean))) as string[];
    const teamIds = Array.from(new Set((rows ?? []).map((r: { team_id: string | null }) => r.team_id).filter(Boolean))) as string[];
    const themeIds = Array.from(new Set((rows ?? []).map((r: { theme_id: string | null }) => r.theme_id).filter(Boolean))) as string[];

    const [cust, teams, themes] = await Promise.all([
      customerIds.length ? supabaseAdmin.from("customers").select("id, name, email").in("id", customerIds) : Promise.resolve({ data: [] }),
      teamIds.length ? supabaseAdmin.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      themeIds.length ? (supabaseAdmin as any).from("greeting_themes").select("id, name").in("id", themeIds) : Promise.resolve({ data: [] }),
    ]);
    const custMap = Object.fromEntries(((cust.data as { id: string; name: string | null; email: string | null }[]) ?? []).map((c) => [c.id, c]));
    const teamMap = Object.fromEntries(((teams.data as { id: string; name: string }[]) ?? []).map((t) => [t.id, t]));
    const themeMap = Object.fromEntries(((themes.data as { id: string; name: string }[]) ?? []).map((t) => [t.id, t]));

    const header = ["datum","order_id","kund","email","antal_trad","belopp_kr","betalstatus","tema","lag","kalla"];
    const lines: string[] = [header.join(";")];
    for (const r of (rows ?? []) as Array<{ id: string; created_at: string; paid_at: string | null; recipient_name: string | null; recipient_email: string | null; customer_id: string | null; tree_count: number; total_amount_ore: number; status: string; source: string | null; theme_id: string | null; team_id: string | null }>) {
      const c = r.customer_id ? custMap[r.customer_id] : null;
      const name = c?.name ?? r.recipient_name ?? "";
      const email = c?.email ?? r.recipient_email ?? "";
      const dt = r.paid_at ?? r.created_at;
      const belopp = (r.total_amount_ore / 100).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      lines.push([
        csvEscape(new Date(dt).toLocaleString("sv-SE")),
        csvEscape(r.id),
        csvEscape(name),
        csvEscape(email),
        csvEscape(r.tree_count),
        csvEscape(belopp),
        csvEscape(r.status),
        csvEscape(r.theme_id ? themeMap[r.theme_id]?.name ?? "" : ""),
        csvEscape(r.team_id ? teamMap[r.team_id]?.name ?? "" : ""),
        csvEscape(r.source ?? ""),
      ].join(";"));
    }
    const csv = "\uFEFF" + lines.join("\r\n");
    await logActivity(context.userId, "purchases_exported", {
      from: data.from ?? null, to: data.to ?? null, rows: (rows ?? []).length,
    });
    return { csv, count: (rows ?? []).length };
  });

// ---- 4) Change team leader --------------------------------------------

export const adminChangeTeamLeader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      teamId: z.string().uuid(),
      newUserId: z.string().uuid().optional(),
      newEmail: z.string().email().optional(),
    }).refine((v) => !!v.newUserId || !!v.newEmail, { message: "Ange användare eller e-post" }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams").select("id, name, created_by_user_id, organization_id").eq("id", data.teamId).maybeSingle();
    if (teamErr) throw new Error(teamErr.message);
    if (!team) throw new Error("Lag saknas");

    // Resolve new leader user_id
    let newUserId = data.newUserId ?? null;
    if (!newUserId && data.newEmail) {
      const { data: prof } = await supabaseAdmin.from("profiles")
        .select("user_id").eq("email", data.newEmail.toLowerCase()).maybeSingle();
      if (!prof) throw new Error("Ingen användare med den e-postadressen hittades. Bjud in personen först.");
      newUserId = prof.user_id;
    }
    if (!newUserId) throw new Error("Kunde inte lösa ny lagledare");
    if (newUserId === team.created_by_user_id) throw new Error("Personen är redan lagledare");

    const oldUserId = team.created_by_user_id;

    // Ensure new user is a team member; upsert role=team_leader
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabaseAdmin as any;
    const { data: existing } = await sb.from("team_members")
      .select("id, role").eq("team_id", data.teamId).eq("user_id", newUserId).maybeSingle();
    if (existing) {
      await sb.from("team_members").update({ role: "team_leader" }).eq("id", existing.id);
    } else {
      await sb.from("team_members").insert({ team_id: data.teamId, user_id: newUserId, role: "team_leader" });
    }

    // Demote old leader to seller (if a membership row exists)
    if (oldUserId) {
      await sb.from("team_members").update({ role: "seller" })
        .eq("team_id", data.teamId).eq("user_id", oldUserId);
    }

    // Update teams.created_by_user_id (source of truth for payout panel / captain views)
    const { error: updErr } = await sb.from("teams")
      .update({ created_by_user_id: newUserId }).eq("id", data.teamId);
    if (updErr) throw new Error(updErr.message);

    // Fetch emails/names
    const ids = [newUserId, oldUserId].filter(Boolean) as string[];
    const { data: profs } = await supabaseAdmin.from("profiles")
      .select("user_id, name, email").in("user_id", ids);
    const map = Object.fromEntries((profs ?? []).map((p) => [p.user_id, p]));
    const newProf = map[newUserId];
    const oldProf = oldUserId ? map[oldUserId] : null;

    // Send emails (best-effort)
    let mailNew: { ok: boolean; error?: string } = { ok: false };
    let mailOld: { ok: boolean; error?: string } = { ok: false };
    try {
      const { sendEmail } = await import("@/lib/email/resend.server");
      if (newProf?.email) {
        const r = await sendEmail({
          to: newProf.email,
          subject: `Du är nu lagledare för ${team.name}`,
          html: `<p>Hej ${newProf.name ?? ""},</p><p>Du har utsetts till lagledare för <strong>${team.name}</strong> i SmartKlimat. Du hittar kaptensvyn och utbetalningspanelen i appen.</p><p>— SmartKlimat</p>`,
          from: "SmartKlimat <konto@smartklimat.org>",
        });
        mailNew = { ok: r.ok, error: r.error };
      }
      if (oldProf?.email) {
        const r = await sendEmail({
          to: oldProf.email,
          subject: `Ny lagledare för ${team.name}`,
          html: `<p>Hej ${oldProf.name ?? ""},</p><p>Rollen som lagledare för <strong>${team.name}</strong> har flyttats till ${newProf?.name ?? newProf?.email ?? "en annan medlem"}. Du är fortsatt medlem i laget.</p><p>— SmartKlimat</p>`,
          from: "SmartKlimat <konto@smartklimat.org>",
        });
        mailOld = { ok: r.ok, error: r.error };
      }
    } catch (e) {
      mailNew = { ok: false, error: (e as Error).message };
    }

    await logActivity(context.userId, "team_leader_changed", {
      team_id: data.teamId, team_name: team.name,
      old_user_id: oldUserId, old_email: oldProf?.email ?? null,
      new_user_id: newUserId, new_email: newProf?.email ?? null,
      mail_new: mailNew, mail_old: mailOld,
    });

    return {
      ok: true,
      new_leader: { user_id: newUserId, name: newProf?.name ?? null, email: newProf?.email ?? null },
      old_leader: oldUserId ? { user_id: oldUserId, name: oldProf?.name ?? null, email: oldProf?.email ?? null } : null,
      mail_new: mailNew, mail_old: mailOld,
    };
  });
