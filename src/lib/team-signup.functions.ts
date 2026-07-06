import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export const searchOrganizations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ query: z.string().trim().max(200).default("") }).parse(input))
  .handler(async ({ data, context }) => {
    const q = data.query;
    let sel = context.supabase.from("organizations").select("id, name, type").order("name").limit(20);
    if (q.length > 0) sel = sel.ilike("name", `%${q}%`);
    const { data: rows, error } = await sel;
    if (error) throw new Error(error.message);
    return { organizations: rows ?? [] };
  });

// Returnerar aktiva cert-mallar ur mallgalleriet (de tio konstnärstemana +
// framtida egendesignade), sorterade på sort. Wizardens steg 2 använder
// kort_url som thumbnail.
export const listCertificateTemplatesPublic = createServerFn({ method: "GET" })
  .handler(async () => {
    const s = publicClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (s as any)
      .from("cert_templates")
      .select("id, slug, namn, sort, kort_url, bg_url, allows_greeting")
      .eq("aktiv", true)
      .order("sort", { ascending: true });
    if (error) throw new Error(error.message);
    // Normalisera till samma form wizarden vill visa.
    const templates = (data ?? []).map((t: {
      id: string; slug: string; namn: string; sort: number;
      kort_url: string | null; bg_url: string; allows_greeting: boolean;
    }) => ({
      id: t.id, slug: t.slug, name: t.namn, sort: t.sort,
      kort_url: t.kort_url, bg_url: t.bg_url,
      allows_greeting: t.allows_greeting,
      is_default: t.slug === "original",
    }));
    return { templates };
  });

export const createTeamSelfService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      teamName: z.string().trim().min(1).max(120),
      organizationId: z.string().uuid().nullable(),
      newOrganizationName: z.string().trim().max(200).nullable(),
      newOrganizationType: z.enum(["school", "company"]).nullable(),
      city: z.string().trim().max(120).nullable(),
      projectLocation: z.string().trim().max(200).nullable(),
      certificateTemplateId: z.string().uuid().nullable(),
      showTeamName: z.boolean(),
      goalTrees: z.number().int().min(0).max(1_000_000).nullable(),
      goalEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      weeklyGoalTrees: z.number().int().min(0).max(100000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("create_team_self_service", {
      _team_name: data.teamName,
      _organization_id: data.organizationId,
      _new_organization_name: data.newOrganizationName,
      _new_organization_type: data.newOrganizationType,
      _city: data.city,
      _project_location: data.projectLocation,
      _certificate_template_id: data.certificateTemplateId,
      _show_team_name: data.showTeamName,
      _goal_trees: data.goalTrees,
      _goal_end_date: data.goalEndDate,
      _weekly_goal_trees: data.weeklyGoalTrees,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = res as { team_id: string; organization_id: string; join_code: string };
    try {
      const { sendLeaderWelcomeIfNew } = await import("@/lib/email/welcome.server");
      await sendLeaderWelcomeIfNew({ userId: context.userId, teamId: out.team_id });
    } catch (err) {
      console.error("[team-signup] leader welcome dispatch failed", (err as Error).message);
    }
    return out;
  });
