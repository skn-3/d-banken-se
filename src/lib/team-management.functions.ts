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
    const patch: {
      name?: string;
      weekly_goal_trees?: number;
      goal_trees?: number | null;
      goal_end_date?: string | null;
      show_team_name_on_certificate?: boolean;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };
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

// ==== INSIKTER (leader-only) ====
function mondayStockholm(d: Date): Date {
  const dow = weekdayMonStockholm(d);
  const startStr = ymdStockholm(new Date(d.getTime() - (dow - 1) * 86400000));
  // Anchor at Stockholm midnight of that Monday
  return new Date(`${startStr}T00:00:00+01:00`);
}

export const getTeamInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("id, name, goal_trees, goal_end_date, weekly_goal_trees")
      .eq("created_by_user_id", context.userId)
      .maybeSingle();
    if (!team) return { isLeader: false as const };

    const { data: members } = await supabaseAdmin
      .from("team_members")
      .select("user_id, role")
      .eq("team_id", team.id);
    const memberIds = (members ?? []).map((m) => m.user_id);
    const nonLeaderIds = (members ?? []).filter((m) => m.role !== "team_leader").map((m) => m.user_id);
    const safe = memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"];

    const now = new Date();
    const currentMonday = mondayStockholm(now);
    const from = new Date(currentMonday.getTime() - 8 * 7 * 86400000); // 8 completed weeks + current

    const { data: purchases } = await supabaseAdmin
      .from("purchases")
      .select("tree_count, paid_at, created_at, registered_by_user_id")
      .in("registered_by_user_id", safe)
      .eq("status", "paid")
      .gte("created_at", from.toISOString());

    // Aggregate per-week (last 8 weeks including current)
    const weeks: { weekStart: string; label: string; trees: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const wsDate = new Date(currentMonday.getTime() - i * 7 * 86400000);
      weeks.push({ weekStart: ymdStockholm(wsDate), label: ymdStockholm(wsDate).slice(5), trees: 0 });
    }
    const currentWeekStr = ymdStockholm(currentMonday);

    // Also track per-user week/28d/7d
    const dayMs = 86400000;
    const cutoff7 = now.getTime() - 7 * dayMs;
    const cutoff28 = now.getTime() - 28 * dayMs;
    const soldThisWeekBy = new Set<string>();
    const active7 = new Set<string>();
    const active28 = new Set<string>();
    const lastActiveBy: Record<string, number> = {};

    (purchases ?? []).forEach((p: { tree_count: number; paid_at: string | null; created_at: string; registered_by_user_id: string | null }) => {
      if (!p.registered_by_user_id) return;
      const ts = p.paid_at ?? p.created_at;
      const day = ymdStockholm(new Date(ts));
      const t = new Date(ts).getTime();
      // Find matching bucket
      for (let i = weeks.length - 1; i >= 0; i--) {
        if (day >= weeks[i].weekStart) { weeks[i].trees += p.tree_count; break; }
      }
      const uid = p.registered_by_user_id;
      if (day >= currentWeekStr) soldThisWeekBy.add(uid);
      if (t >= cutoff7) active7.add(uid);
      if (t >= cutoff28) active28.add(uid);
      if (!lastActiveBy[uid] || t > lastActiveBy[uid]) lastActiveBy[uid] = t;
    });

    // Forecast: average of the last 3 fully-elapsed weeks (indices 4,5,6 in 0..7)
    const lastThreeAvg = weeks.slice(-4, -1).reduce((s, w) => s + w.trees, 0) / 3;
    const totalTrees = (purchases ?? []).reduce((s, p) => s + p.tree_count, 0);
    // Total trees across all time (may extend before window)
    const { data: allTrees } = await supabaseAdmin
      .from("purchases")
      .select("tree_count")
      .in("registered_by_user_id", safe)
      .eq("status", "paid");
    const allTotal = (allTrees ?? []).reduce((s, p) => s + (p.tree_count ?? 0), 0);

    let forecast: {
      pace: number; onTrack: boolean; requiredWeekly: number | null;
      forecastDate: string | null; goalTrees: number | null; goalEndDate: string | null;
      remaining: number;
    } | null = null;

    if (team.goal_trees && team.goal_trees > 0) {
      const remaining = Math.max(0, team.goal_trees - allTotal);
      let forecastDate: string | null = null;
      if (remaining === 0) {
        forecastDate = ymdStockholm(now);
      } else if (lastThreeAvg > 0) {
        const weeksNeeded = remaining / lastThreeAvg;
        const ms = weeksNeeded * 7 * dayMs;
        forecastDate = ymdStockholm(new Date(now.getTime() + ms));
      }
      let onTrack = true;
      let requiredWeekly: number | null = null;
      if (team.goal_end_date && remaining > 0) {
        const endMs = new Date(team.goal_end_date + "T23:59:59+01:00").getTime();
        const weeksLeft = Math.max(0.1, (endMs - now.getTime()) / (7 * dayMs));
        requiredWeekly = Math.ceil(remaining / weeksLeft);
        onTrack = lastThreeAvg >= requiredWeekly;
      }
      forecast = {
        pace: Math.round(lastThreeAvg * 10) / 10,
        onTrack,
        requiredWeekly,
        forecastDate,
        goalTrees: team.goal_trees,
        goalEndDate: team.goal_end_date,
        remaining,
      };
    }

    // Streak risk: members with streak >= 2 who haven't sold this week
    const { data: streaks } = await supabaseAdmin
      .from("seller_streaks")
      .select("user_id, current_weeks")
      .in("user_id", nonLeaderIds.length ? nonLeaderIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("user_id, name, avatar_key, photo_path")
      .in("user_id", nonLeaderIds.length ? nonLeaderIds : ["00000000-0000-0000-0000-000000000000"]);
    const profByUser: Record<string, { name: string; avatarKey: string | null; photoPath: string | null }> = {};
    (profs ?? []).forEach((p: { user_id: string; name: string; avatar_key: string | null; photo_path: string | null }) => {
      profByUser[p.user_id] = { name: p.name, avatarKey: p.avatar_key, photoPath: p.photo_path };
    });
    const streakRisk = (streaks ?? [])
      .filter((s: { user_id: string; current_weeks: number }) => (s.current_weeks ?? 0) >= 2 && !soldThisWeekBy.has(s.user_id))
      .map((s: { user_id: string; current_weeks: number }) => {
        const p = profByUser[s.user_id];
        const full = (p?.name ?? "").trim();
        return {
          userId: s.user_id,
          firstName: full ? full.split(/\s+/)[0] : "Säljare",
          streak: s.current_weeks,
          avatarKey: p?.avatarKey ?? null,
          photoPath: p?.photoPath ?? null,
        };
      })
      .sort((a, b) => b.streak - a.streak);

    // Activity split
    const totalSellers = nonLeaderIds.length;
    const a7 = nonLeaderIds.filter((id) => active7.has(id)).length;
    const a28 = nonLeaderIds.filter((id) => active28.has(id)).length;
    const idle = Math.max(0, totalSellers - a28);

    const weekTrees = weeks[weeks.length - 1].trees;

    return {
      isLeader: true as const,
      team: { id: team.id, name: team.name },
      weeks,
      weekTrees,
      totalTrees,
      forecast,
      streakRisk,
      activity: { active7: a7, active28: a28, idle, total: totalSellers },
    };
  });

