import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type CatalogRow = {
  key: string; name: string; emoji: string; description: string;
  rarity: "normal" | "gold"; scope: string; sort_order: number;
};
export type EarnedRow = { achievement_key: string; earned_at: string };
export type FeedRow = {
  id: string; user_id: string | null; team_id: string | null;
  type: string; payload: Record<string, unknown>; created_at: string;
  avatar_key: string | null; photo_path: string | null; first_name: string | null;
  team_name?: string | null;
};

export const getSellerAchievements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [cat, earned] = await Promise.all([
      supabase.from("achievement_catalog").select("*").eq("active", true).order("sort_order"),
      supabase.from("seller_achievements").select("achievement_key, earned_at").eq("user_id", userId),
    ]);
    return {
      catalog: (cat.data ?? []) as CatalogRow[],
      earned: (earned.data ?? []) as EarnedRow[],
    };
  });

export const getTeamFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("get_team_activity_feed", { _limit: 100 });
    if (error) throw error;
    return { rows: (data ?? []) as FeedRow[] };
  });

export const getNationalFeed = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.rpc("get_national_activity_feed", { _limit: 30 });
  if (error) throw error;
  return { rows: (data ?? []) as FeedRow[] };
});
