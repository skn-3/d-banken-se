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

export const listCertificateTemplatesPublic = createServerFn({ method: "GET" })
  .handler(async () => {
    const s = publicClient();
    const { data, error } = await s
      .from("certificate_templates")
      .select("id, name, logo_url, accent_color, heading_text, body_text, background_key, is_default")
      .order("is_default", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
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
    return res as { team_id: string; organization_id: string; join_code: string };
  });
