import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getSellerBoostState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    const [catalogQ, boostsQ, streakQ, purchasesQ] = await Promise.all([
      supabaseAdmin.from("boost_catalog").select("*").eq("active", true),
      supabaseAdmin.from("seller_boosts").select("*").eq("user_id", uid).order("earned_at", { ascending: false }).limit(200),
      supabaseAdmin.from("seller_streaks").select("*").eq("user_id", uid).maybeSingle(),
      supabaseAdmin.from("purchases").select("tree_count, created_at").eq("seller_user_id", uid),
    ]);

    // Derive progress numbers for locked boosts.
    const purchases = (purchasesQ.data ?? []) as { tree_count: number; created_at: string }[];
    const totalTrees = purchases.reduce((s, p) => s + (p.tree_count ?? 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const todayTrees = purchases
      .filter((p) => p.created_at?.slice(0, 10) === today)
      .reduce((s, p) => s + (p.tree_count ?? 0), 0);

    return {
      catalog: catalogQ.data ?? [],
      boosts: boostsQ.data ?? [],
      streak: streakQ.data ?? null,
      progress: { totalTrees, todayTrees },
    };
  });

export const activateBoost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ boostId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("seller_boosts").select("id, user_id, status").eq("id", data.boostId).maybeSingle();
    if (!row || (row as any).user_id !== context.userId) throw new Error("Not authorized");
    if ((row as any).status !== "earned") throw new Error("Boost är inte aktiverbar");
    const { data: updated, error } = await supabaseAdmin
      .from("seller_boosts")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", data.boostId).select("*").single();
    if (error) throw new Error(error.message);
    return updated;
  });

/**
 * Returns buff summary per userId for leaderboard rows.
 * Buffs: active turbo, streak weeks (>=2), today's hattrick, this week's guldplantering.
 */
export const getLeaderboardBuffs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userIds: z.array(z.string().uuid()).max(200) }).parse(d)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = data.userIds;
    if (ids.length === 0) return { buffs: {} as Record<string, SellerBuffs> };

    const now = new Date();
    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
    // ISO week Monday 00:00 UTC (approximate).
    const d0 = new Date(now);
    const day = (d0.getUTCDay() + 6) % 7; // Mon=0
    const weekStart = new Date(d0); weekStart.setUTCDate(d0.getUTCDate() - day); weekStart.setUTCHours(0, 0, 0, 0);

    const [boostsQ, streaksQ, txQ] = await Promise.all([
      supabaseAdmin.from("seller_boosts").select("user_id, boost_key, status")
        .in("user_id", ids).eq("status", "active"),
      supabaseAdmin.from("seller_streaks").select("user_id, current_weeks, freezes")
        .in("user_id", ids),
      supabaseAdmin.from("point_transactions")
        .select("user_id, kind, created_at")
        .in("user_id", ids)
        .gte("created_at", weekStart.toISOString())
        .in("kind", ["boost_hattrick", "boost_gold"]),
    ]);

    const map: Record<string, SellerBuffs> = {};
    for (const uid of ids) map[uid] = { turbo: false, streakWeeks: 0, hattrickToday: false, goldWeek: false, freezes: 0 };

    for (const b of (boostsQ.data ?? []) as any[]) {
      if (b.boost_key === "turbo") map[b.user_id].turbo = true;
    }
    for (const s of (streaksQ.data ?? []) as any[]) {
      map[s.user_id].streakWeeks = s.current_weeks ?? 0;
      map[s.user_id].freezes = s.freezes ?? 0;
    }
    for (const t of (txQ.data ?? []) as any[]) {
      const created = new Date(t.created_at);
      if (t.kind === "boost_hattrick" && created >= dayStart) map[t.user_id].hattrickToday = true;
      if (t.kind === "boost_gold") map[t.user_id].goldWeek = true;
    }
    return { buffs: map };
  });

export type SellerBuffs = {
  turbo: boolean;
  streakWeeks: number;
  hattrickToday: boolean;
  goldWeek: boolean;
  freezes: number;
};
