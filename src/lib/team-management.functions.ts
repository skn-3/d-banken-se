import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STHLM = "Europe/Stockholm";
function ymdStockholm(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STHLM, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function weekdayMonStockholm(d: Date): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: STHLM, weekday: "short" }).format(d);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[s] ?? 1;
}

async function requireLeaderTeam(ctx: { supabase: any; userId: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("id, name, weekly_goal_trees, goal_trees, goal_end_date, project_location, show_team_name_on_certificate, join_code, organization_id, created_by_user_id")
    .eq("created_by_user_id", ctx.userId)
    .maybeSingle();
  if (!team) throw new Error("Endast lagledare kan göra detta.");
  return { team, supabaseAdmin };
}

export const getTeamManagement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("id, name, weekly_goal_trees, goal_trees, goal_end_date, project_location, show_team_name_on_certificate, join_code")
      .eq("created_by_user_id", context.userId)
      .maybeSingle();
    if (!team) return { isLeader: false as const };

    const { data: members } = await supabaseAdmin
      .from("team_members")
      .select("user_id, role, created_at")
      .eq("team_id", team.id);
    const memberIds = (members ?? []).map((m) => m.user_id);

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, name, avatar_key, photo_path")
      .in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
    const profileByUser: Record<string, any> = {};
    (profiles ?? []).forEach((p) => { profileByUser[p.user_id] = p; });

    // Streaks
    const { data: streaks } = await supabaseAdmin
      .from("seller_streaks")
      .select("user_id, current_streak")
      .in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
    const streakByUser: Record<string, number> = {};
    (streaks ?? []).forEach((s: any) => { streakByUser[s.user_id] = s.current_streak ?? 0; });

    // Purchases → totals, week, last active
    const { data: purchases } = await supabaseAdmin
      .from("purchases")
      .select("tree_count, created_at, registered_by_user_id")
      .in("registered_by_user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("status", "paid");

    const now = new Date();
    const todayStr = ymdStockholm(now);
    const dow = weekdayMonStockholm(now);
    const mondayDate = new Date(now.getTime() - (dow - 1) * 86400000);
    const weekStartStr = ymdStockholm(mondayDate);

    const totalsByUser: Record<string, { total: number; week: number; lastActive: string | null }> = {};
    (purchases ?? []).forEach((p: any) => {
      const uid = p.registered_by_user_id as string;
      const day = ymdStockholm(new Date(p.created_at));
      const a = totalsByUser[uid] ?? { total: 0, week: 0, lastActive: null };
      a.total += p.tree_count;
      if (day >= weekStartStr) a.week += p.tree_count;
      if (!a.lastActive || p.created_at > a.lastActive) a.lastActive = p.created_at;
      totalsByUser[uid] = a;
    });

    const hasSales = (purchases ?? []).length > 0;

    const memberRows = (members ?? []).map((m) => {
      const prof = profileByUser[m.user_id] ?? {};
      const t = totalsByUser[m.user_id] ?? { total: 0, week: 0, lastActive: null };
      const full = (prof.name ?? "").trim();
      const firstName = full ? full.split(/\s+/)[0] : "Säljare";
      const daysSince = t.lastActive
        ? Math.floor((now.getTime() - new Date(t.lastActive).getTime()) / 86400000)
        : null;
      return {
        userId: m.user_id,
        role: m.role as "seller" | "team_leader",
        joinedAt: m.created_at,
        firstName,
        avatarKey: prof.avatar_key ?? null,
        photoPath: prof.photo_path ?? null,
        trees: t.total,
        weekTrees: t.week,
        streak: streakByUser[m.user_id] ?? 0,
        lastActiveAt: t.lastActive,
        daysSinceActive: daysSince,
        idle: (t.total > 0 && daysSince !== null && daysSince >= 14) || (t.total === 0 && (now.getTime() - new Date(m.created_at).getTime()) / 86400000 >= 14),
      };
    });

    return {
      isLeader: true as const,
      team: {
        id: team.id,
        name: team.name,
        weeklyGoal: team.weekly_goal_trees,
        goalTrees: team.goal_trees,
        goalEndDate: team.goal_end_date,
        projectLocation: team.project_location,
        showTeamNameOnCertificate: team.show_team_name_on_certificate,
        joinCode: team.join_code,
      },
      hasSales,
      members: memberRows,
    };
  });

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  weeklyGoal: z.number().int().min(0).max(100000).optional(),
  goalTrees: z.number().int().min(0).max(1000000).nullable().optional(),
  goalEndDate: z.string().nullable().optional(),
  showTeamNameOnCertificate: z.boolean().optional(),
});

export const updateTeamSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { team, supabaseAdmin } = await requireLeaderTeam(context);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.weeklyGoal !== undefined) patch.weekly_goal_trees = data.weeklyGoal;
    if (data.goalTrees !== undefined) patch.goal_trees = data.goalTrees;
    if (data.goalEndDate !== undefined) patch.goal_end_date = data.goalEndDate;
    if (data.showTeamNameOnCertificate !== undefined) patch.show_team_name_on_certificate = data.showTeamNameOnCertificate;
    const { error } = await supabaseAdmin.from("teams").update(patch).eq("id", team.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { team, supabaseAdmin } = await requireLeaderTeam(context);
    if (data.userId === context.userId) throw new Error("Du kan inte ta bort dig själv.");
    const { data: target } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("team_id", team.id)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!target) throw new Error("Medlemmen finns inte i laget.");
    if (target.role === "team_leader") throw new Error("Kan inte ta bort en lagledare.");
    const { error } = await supabaseAdmin
      .from("team_members")
      .delete()
      .eq("team_id", team.id)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export const rotateJoinCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { team, supabaseAdmin } = await requireLeaderTeam(context);
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateCode();
      const { data: existing } = await supabaseAdmin
        .from("teams").select("id").eq("join_code", code).maybeSingle();
      if (existing) continue;
      const { error } = await supabaseAdmin
        .from("teams")
        .update({ join_code: code, updated_at: new Date().toISOString() })
        .eq("id", team.id);
      if (error) throw new Error(error.message);
      return { joinCode: code };
    }
    throw new Error("Kunde inte generera unik kod. Försök igen.");
  });
