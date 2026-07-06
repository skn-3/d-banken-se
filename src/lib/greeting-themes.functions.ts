import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ThemePalette {
  bg: string; accent: string; soft: string; ink: string; muted: string;
}
export interface ThemeConfig {
  palette: ThemePalette;
  motif: string;
  heading_template: string;
  eyebrow: string;
  reveal?: { confetti?: boolean; colors?: string[] };
}

export const listGreetingThemes = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("greeting_themes")
      .select("id, slug, name, category, config, is_default, sort, active")
      .eq("active", true)
      .order("sort", { ascending: true });
    if (error) throw new Error(error.message);
    return { themes: (data ?? []) as any[] };
  });

export const getGreetingThemeById = async (id: string | null | undefined) => {
  if (!id) {
    const { data } = await supabaseAdmin
      .from("greeting_themes").select("*").eq("is_default", true).maybeSingle();
    return data as any;
  }
  const { data } = await supabaseAdmin
    .from("greeting_themes").select("*").eq("id", id).maybeSingle();
  if (data) return data as any;
  const { data: def } = await supabaseAdmin
    .from("greeting_themes").select("*").eq("is_default", true).maybeSingle();
  return def as any;
};

const UpsertSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(60),
  category: z.enum(["standard","kalas","hogtid","tack","forlat","djurfadder"]),
  active: z.boolean(),
  sort: z.number().int(),
  config: z.any(),
});

async function assertAdmin(context: { userId: string; supabase: any }) {
  const { data: ok } = await context.supabase.rpc("has_role", {
    _user_id: context.userId, _role: "admin",
  });
  if (!ok) throw new Error("Forbidden: admin krävs.");
}

export const adminListGreetingThemes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await supabaseAdmin
      .from("greeting_themes").select("*").order("sort", { ascending: true });
    if (error) throw new Error(error.message);
    return { themes: (data ?? []) as any[] };
  });

export const adminUpsertGreetingTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const row: any = {
      name: data.name, slug: data.slug, category: data.category,
      active: data.active, sort: data.sort, config: data.config ?? {},
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("greeting_themes").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin.from("greeting_themes").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const adminDeleteGreetingTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await supabaseAdmin.from("greeting_themes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
