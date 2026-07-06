import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function callRpc(fnName: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Rely on function-internal admin gate; call via admin client so we always
  // get a definitive answer (the gate raises when the caller isn't admin).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin as any).rpc(fnName);
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

export const getInsightsAll = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [kpis, weekly, mix30, engine, recipients, risk, topTeams] = await Promise.all([
      callRpc("admin_insights_kpis"),
      callRpc("admin_insights_weekly_series"),
      callRpc("admin_insights_channel_mix_30d"),
      callRpc("admin_insights_sales_engine"),
      callRpc("admin_insights_recipients"),
      callRpc("admin_insights_risk_queues"),
      callRpc("admin_insights_top_teams_week"),
    ]);
    return { kpis, weekly, mix30, engine, recipients, risk, topTeams };
  });
