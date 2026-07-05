import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const getRewardBudget = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings").select("reward_budget_ore_per_tree").eq("id", 1).maybeSingle();
    return { orePerTree: (data?.reward_budget_ore_per_tree ?? 0) as number };
  });

export const setRewardBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orePerTree: z.number().int().min(0).max(1000000) }).parse(input))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings").update({ reward_budget_ore_per_tree: data.orePerTree }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getRewardEconomy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();

    const [{ data: settingsRow }, { data: tx30 }, { data: txTotal }, { data: trees30 }, { data: ordersRaw }] = await Promise.all([
      supabaseAdmin.from("app_settings").select("reward_budget_ore_per_tree").eq("id", 1).maybeSingle(),
      supabaseAdmin.from("point_transactions").select("delta, type, created_at").gte("created_at", since),
      supabaseAdmin.from("point_transactions").select("delta"),
      supabaseAdmin.from("purchases").select("tree_count").eq("status", "paid").gte("created_at", since),
      supabaseAdmin.from("reward_orders")
        .select("id, cost_points, requested_at, reward:rewards(cost_ore)")
        .gte("requested_at", since),
    ]);

    const budgetOre = (settingsRow?.reward_budget_ore_per_tree ?? 0) as number;
    const pointsAwardedTotal = (txTotal ?? []).filter(t => (t.delta ?? 0) > 0).reduce((s, t) => s + (t.delta ?? 0), 0);
    const boostTypes = new Set(["boost_turbo","boost_gold","boost_comeback","boost_hattrick","bonus_double","bonus_milestone","bonus_streak","bonus_team","bonus_sprint"]);
    const points30 = (tx30 ?? []).filter(t => (t.delta ?? 0) > 0);
    const pointsAwarded30 = points30.reduce((s, t) => s + (t.delta ?? 0), 0);
    const boostPoints30 = points30.filter(t => boostTypes.has(t.type as string)).reduce((s, t) => s + (t.delta ?? 0), 0);
    const trees30Sum = (trees30 ?? []).reduce((s, r) => s + (r.tree_count ?? 0), 0);

    const orders = (ordersRaw ?? []) as Array<{ id: string; cost_points: number; requested_at: string; reward: { cost_ore: number } | null }>;
    const redeemedCount = orders.length;
    const redeemedPoints = orders.reduce((s, o) => s + (o.cost_points ?? 0), 0);
    const redeemedCostOre = orders.reduce((s, o) => s + (o.reward?.cost_ore ?? 0), 0);
    const costPerTreeOre = trees30Sum > 0 ? redeemedCostOre / trees30Sum : 0;
    const overBudget = budgetOre > 0 && costPerTreeOre > budgetOre;

    return {
      budgetOre,
      pointsAwardedTotal,
      pointsAwarded30,
      boostPoints30,
      pointsPerTree30: trees30Sum > 0 ? pointsAwarded30 / trees30Sum : 0,
      redeemedCount,
      redeemedPoints,
      redeemedCostOre,
      trees30: trees30Sum,
      costPerTreeOre,
      overBudget,
    };
  });
