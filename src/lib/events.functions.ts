import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isAdminUser(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
}

export type ActiveEvent = {
  id: string;
  name: string;
  start_at: string;
  end_at: string;
  multiplier: number;
} | null;

export const getActiveEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data } = await supabaseAdmin
      .from("point_events")
      .select("id, name, start_at, end_at, multiplier")
      .eq("active", true)
      .lte("start_at", nowIso)
      .gt("end_at", nowIso)
      .order("start_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { event: (data as ActiveEvent) ?? null };
  });

const EventInput = z.object({
  name: z.string().trim().min(1).max(120),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  multiplier: z.number().int().min(2).max(10),
  active: z.boolean().optional(),
});

export const adminListEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("point_events").select("*")
      .order("start_at", { ascending: false });
    return { events: data ?? [] };
  });

export const adminCreateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EventInput.parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("point_events").insert({
      name: data.name,
      start_at: new Date(data.startAt).toISOString(),
      end_at: new Date(data.endAt).toISOString(),
      multiplier: data.multiplier,
      active: data.active ?? true,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminToggleEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("point_events").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("point_events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSellerMilestones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = (input ?? {}) as { targetUserId?: string };
    return { targetUserId: typeof v.targetUserId === "string" && v.targetUserId.length > 0 ? v.targetUserId : undefined };
  })
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let userId = context.userId;
    if (data.targetUserId && data.targetUserId !== context.userId) {
      if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
      userId = data.targetUserId;
    }
    const { data: rows } = await supabaseAdmin
      .from("point_transactions")
      .select("id, delta, description, created_at")
      .eq("seller_user_id", userId)
      .eq("type", "bonus_milestone")
      .order("created_at", { ascending: false });
    return { milestones: rows ?? [] };
  });

export type SellerBonus = {
  id: string;
  delta: number;
  description: string | null;
  type: "bonus_milestone" | "bonus_sprint" | "bonus_team" | "bonus_streak" | "bonus_double";
  created_at: string;
};

export const getSellerBonuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = (input ?? {}) as { targetUserId?: string };
    return { targetUserId: typeof v.targetUserId === "string" && v.targetUserId.length > 0 ? v.targetUserId : undefined };
  })
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let userId = context.userId;
    if (data.targetUserId && data.targetUserId !== context.userId) {
      if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
      userId = data.targetUserId;
    }
    const { data: rows } = await supabaseAdmin
      .from("point_transactions")
      .select("id, delta, description, type, created_at")
      .eq("seller_user_id", userId)
      .in("type", ["bonus_milestone", "bonus_sprint", "bonus_team", "bonus_streak"])
      .order("created_at", { ascending: false })
      .limit(50);
    return { bonuses: (rows ?? []) as SellerBonus[] };
  });

