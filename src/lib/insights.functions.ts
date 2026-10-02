import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InsightBlock<T = unknown> = { data: T } | { error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callRpc(client: any, fnName: string) {
  // Called with the user's JWT client so auth.uid() is the signed-in admin
  // and the function-internal _assert_admin() gate works as intended.
  const { data, error } = await client.rpc(fnName);
  if (error) throw new Error(error.message);
  return data;
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const BLOCKS = [
  ["kpis", "admin_insights_kpis"],
  ["weekly", "admin_insights_weekly_series"],
  ["mix30", "admin_insights_channel_mix_30d"],
  ["engine", "admin_insights_sales_engine"],
  ["recipients", "admin_insights_recipients"],
  ["risk", "admin_insights_risk_queues"],
  ["topTeams", "admin_insights_top_teams_week"],
] as const;

type BlockKey = (typeof BLOCKS)[number][0];

export const getInsightsAll = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const results = await Promise.allSettled(BLOCKS.map(([, fn]) => callRpc(context.supabase, fn)));
    const out = {} as Record<BlockKey, { data?: unknown; error?: string }>;
    BLOCKS.forEach(([key], i) => {
      const r = results[i];
      out[key] = r.status === "fulfilled"
        ? { data: r.value }
        : { error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    });
    return out as Record<BlockKey, { data?: any; error?: string }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  });
