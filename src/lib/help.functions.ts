import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getHelpContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: member } = await supabaseAdmin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!member) {
      return { role: "buyer" as const, teamName: null, leaderFirstName: null };
    }

    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("name")
      .eq("id", member.team_id)
      .maybeSingle();

    let leaderFirstName: string | null = null;
    if (member.role === "seller") {
      const { data: leader } = await supabaseAdmin
        .from("team_members")
        .select("user_id")
        .eq("team_id", member.team_id)
        .eq("role", "leader")
        .maybeSingle();
      if (leader?.user_id) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("name")
          .eq("user_id", leader.user_id)
          .maybeSingle();
        const full = (prof?.name ?? "").trim();
        leaderFirstName = full ? full.split(/\s+/)[0] : null;
      }
    }

    return {
      role: member.role as "seller" | "leader",
      teamName: team?.name ?? null,
      leaderFirstName,
    };
  });
