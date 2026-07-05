import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getSellerBoostState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [catalogQ, boostsQ, streakQ] = await Promise.all([
      supabaseAdmin.from("boost_catalog").select("*").eq("active", true),
      supabaseAdmin.from("seller_boosts").select("*").eq("user_id", context.userId).order("earned_at", { ascending: false }).limit(100),
      supabaseAdmin.from("seller_streaks").select("*").eq("user_id", context.userId).maybeSingle(),
    ]);
    return {
      catalog: catalogQ.data ?? [],
      boosts: boostsQ.data ?? [],
      streak: streakQ.data ?? null,
    };
  });

export const activateBoost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ boostId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Verify ownership then update directly (RLS is bypassed via service role).
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
