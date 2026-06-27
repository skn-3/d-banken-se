import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

// ---------- Organizations ----------

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: orgs, error } = await supabaseAdmin
      .from("organizations")
      .select("id, name, type, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: teams } = await supabaseAdmin
      .from("teams")
      .select("id, organization_id, name");

    const { data: members } = await supabaseAdmin
      .from("team_members")
      .select("user_id, team_id");

    const { data: purchases } = await supabaseAdmin
      .from("purchases")
      .select("tree_count, status, registered_by_user_id")
      .eq("status", "paid");

    const memberToTeam = new Map<string, string>();
    (members ?? []).forEach((m) => memberToTeam.set(m.user_id, m.team_id));

    const teamToOrg = new Map<string, string>();
    (teams ?? []).forEach((t) => teamToOrg.set(t.id, t.organization_id));

    const treesPerTeam = new Map<string, number>();
    const treesPerOrg = new Map<string, number>();
    (purchases ?? []).forEach((p) => {
      const uid = p.registered_by_user_id;
      if (!uid) return;
      const tid = memberToTeam.get(uid);
      if (!tid) return;
      treesPerTeam.set(tid, (treesPerTeam.get(tid) ?? 0) + p.tree_count);
      const oid = teamToOrg.get(tid);
      if (oid) treesPerOrg.set(oid, (treesPerOrg.get(oid) ?? 0) + p.tree_count);
    });

    return {
      organizations: (orgs ?? []).map((o) => ({
        ...o,
        team_count: (teams ?? []).filter((t) => t.organization_id === o.id).length,
        tree_count: treesPerOrg.get(o.id) ?? 0,
      })),
    };
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      name: z.string().trim().min(1).max(200),
      type: z.enum(["school", "company"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("organizations")
      .insert({ name: data.name, type: data.type })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      type: z.enum(["school", "company"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("organizations")
      .update({ name: data.name, type: data.type })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Teams ----------

export const listTeams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: teams, error } = await supabaseAdmin
      .from("teams")
      .select("id, name, created_at, weekly_goal_trees, team_bonus_points")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);


    const teamIds = (teams ?? []).map((t) => t.id);
    const memberCounts = new Map<string, number>();
    const treeCounts = new Map<string, number>();

    if (teamIds.length) {
      const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("team_id, user_id")
        .in("team_id", teamIds);
      const memberByUser = new Map<string, string>();
      (members ?? []).forEach((m) => {
        memberByUser.set(m.user_id, m.team_id);
        memberCounts.set(m.team_id, (memberCounts.get(m.team_id) ?? 0) + 1);
      });
      const userIds = Array.from(memberByUser.keys());
      if (userIds.length) {
        const { data: purchases } = await supabaseAdmin
          .from("purchases")
          .select("tree_count, status, registered_by_user_id")
          .eq("status", "paid")
          .in("registered_by_user_id", userIds);
        (purchases ?? []).forEach((p) => {
          if (!p.registered_by_user_id) return;
          const tid = memberByUser.get(p.registered_by_user_id);
          if (!tid) return;
          treeCounts.set(tid, (treeCounts.get(tid) ?? 0) + p.tree_count);
        });
      }
    }

    return {
      teams: (teams ?? []).map((t) => ({
        ...t,
        member_count: memberCounts.get(t.id) ?? 0,
        tree_count: treeCounts.get(t.id) ?? 0,
      })),
    };
  });

export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("teams")
      .insert({ organization_id: data.organizationId, name: data.name })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("teams")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Sellers (team members) ----------

export const listSellers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ teamId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: members, error } = await supabaseAdmin
      .from("team_members")
      .select("id, user_id, role, created_at")
      .eq("team_id", data.teamId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const userIds = (members ?? []).map((m) => m.user_id);
    if (!userIds.length) return { sellers: [] };

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, name, email")
      .in("user_id", userIds);

    const { data: purchases } = await supabaseAdmin
      .from("purchases")
      .select("tree_count, status, registered_by_user_id")
      .eq("status", "paid")
      .in("registered_by_user_id", userIds);

    const treesByUser = new Map<string, number>();
    (purchases ?? []).forEach((p) => {
      if (!p.registered_by_user_id) return;
      treesByUser.set(p.registered_by_user_id, (treesByUser.get(p.registered_by_user_id) ?? 0) + p.tree_count);
    });

    const profMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    return {
      sellers: (members ?? []).map((m) => ({
        member_id: m.id,
        user_id: m.user_id,
        role: m.role,
        name: profMap.get(m.user_id)?.name ?? "",
        email: profMap.get(m.user_id)?.email ?? "",
        tree_count: treesByUser.get(m.user_id) ?? 0,
        created_at: m.created_at,
      })),
    };
  });

export const createSeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      teamId: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().email().max(255),
      role: z.enum(["seller", "team_leader"]).default("seller"),
      redirectTo: z.string().url(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const email = data.email.toLowerCase();

    // Find or create auth user
    let userId: string | null = null;
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name: data.name, account_type: "saljare" },
      });
      if (cErr) throw new Error(`Kunde inte skapa konto: ${cErr.message}`);
      userId = created.user?.id ?? null;
    }
    if (!userId) throw new Error("Kunde inte hämta användar-ID");

    // Ensure profile (trigger handle_new_user normally does it; safe upsert)
    await supabaseAdmin
      .from("profiles")
      .upsert({ user_id: userId, name: data.name, email, account_type: "saljare" }, { onConflict: "user_id" });

    // Check existing team membership
    const { data: existingMember } = await supabaseAdmin
      .from("team_members")
      .select("id, team_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existingMember && existingMember.team_id !== data.teamId) {
      throw new Error("Den här e-posten är redan kopplad till ett annat team.");
    }
    if (!existingMember) {
      const { error: mErr } = await supabaseAdmin
        .from("team_members")
        .insert({ team_id: data.teamId, user_id: userId, role: data.role });
      if (mErr) throw new Error(`Kunde inte lägga till i team: ${mErr.message}`);
    }

    // Add user_roles seller (idempotent)
    await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: userId, role: (data.role === "team_leader" ? "team_leader" : "seller") as "seller" },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );

    // Generate password recovery link so seller can set their own password
    let actionLink: string | null = null;
    try {
      const { data: link } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: data.redirectTo },
      });
      actionLink = link?.properties?.action_link ?? null;
    } catch {
      // non-fatal
    }

    return { userId, actionLink };
  });

export const removeSeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ memberId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("team_members").delete().eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
