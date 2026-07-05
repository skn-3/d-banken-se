import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const listInput = z.object({
  period: z.enum(["week", "total"]).default("week"),
  page: z.number().int().min(0).max(200).default(0),
});
const PAGE = 50;

export const getSverigeSellers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const orderCol = data.period === "week" ? "points_week" : "points_total";
    const from = data.page * PAGE;
    const to = from + PAGE - 1;

    const [pageRes, countRes, mineRes] = await Promise.all([
      sb.from("v_public_seller_profile")
        .select("user_id, first_name, photo_path, avatar_key, team_name, team_city, organization_name, points_week, points_total")
        .order(orderCol, { ascending: false })
        .order("user_id", { ascending: true })
        .range(from, to),
      sb.from("v_public_seller_profile").select("user_id", { count: "exact", head: true }),
      sb.from("v_public_seller_profile")
        .select("user_id, first_name, photo_path, avatar_key, team_name, team_city, organization_name, points_week, points_total")
        .eq("user_id", context.userId).maybeSingle(),
    ]);
    let myRank: number | null = null;
    if (mineRes.data) {
      const my = mineRes.data[orderCol] ?? 0;
      const { count } = await sb.from("v_public_seller_profile")
        .select("user_id", { count: "exact", head: true })
        .gt(orderCol, my);
      myRank = (count ?? 0) + 1;
    }
    return {
      rows: (pageRes.data ?? []) as unknown[],
      total: countRes.count ?? 0,
      me: mineRes.data as unknown,
      myRank,
      startRank: from + 1,
    };
  });

export const getSverigeTeams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const orderCol = data.period === "week" ? "points_week" : "points_total";
    const from = data.page * PAGE;
    const to = from + PAGE - 1;
    const [pageRes, countRes] = await Promise.all([
      sb.from("v_public_team_ranking")
        .select("team_id, team_name, organization_name, city, members, trees_total, points_week, points_total")
        .order(orderCol, { ascending: false })
        .order("team_id", { ascending: true })
        .range(from, to),
      sb.from("v_public_team_ranking").select("team_id", { count: "exact", head: true }),
    ]);
    return {
      rows: (pageRes.data ?? []) as unknown[],
      total: countRes.count ?? 0,
      startRank: from + 1,
    };
  });
