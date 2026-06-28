import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REWARD_SEEDS } from "@/lib/reward-catalog";

async function isAdminUser(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
}

async function sellerBalance(userId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("point_transactions").select("delta").eq("seller_user_id", userId);
  return (data ?? []).reduce((s, r) => s + (r.delta ?? 0), 0);
}

async function ensureRewardCatalog() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing, error: readError } = await supabaseAdmin
    .from("rewards")
    .select("id, name, image_url");
  if (readError) throw new Error(readError.message);

  const byName = new Map((existing ?? []).map((reward) => [reward.name, reward]));
  const missing = REWARD_SEEDS.filter((seed) => !byName.has(seed.name));

  if (missing.length > 0) {
    const { error: insertError } = await supabaseAdmin.from("rewards").insert(
      missing.map((seed) => ({
        name: seed.name,
        description: seed.description,
        cost_points: seed.cost_points,
        category: seed.category,
        image_url: seed.image_url,
        active: true,
        sort_order: seed.sort_order,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }

  const imagePatches = REWARD_SEEDS.filter((seed) => {
    const current = byName.get(seed.name);
    return current && !current.image_url && seed.image_url;
  });

  for (const seed of imagePatches) {
    const { error: updateError } = await supabaseAdmin
      .from("rewards")
      .update({ image_url: seed.image_url })
      .eq("name", seed.name);
    if (updateError) throw new Error(updateError.message);
  }
}

/* ---------------- Seller view ---------------- */

export const getSellerRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = (input ?? {}) as { targetUserId?: string };
    return { targetUserId: typeof v.targetUserId === "string" && v.targetUserId.length > 0 ? v.targetUserId : undefined };
  })
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await ensureRewardCatalog();

    let targetUserId = context.userId;
    let isPreview = false;
    let previewName: string | null = null;
    if (data.targetUserId && data.targetUserId !== context.userId) {
      if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
      targetUserId = data.targetUserId;
      isPreview = true;
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("name, email").eq("user_id", targetUserId).maybeSingle();
      previewName = prof?.name || prof?.email || "Säljare";
    }

    const { data: membership } = await supabaseAdmin
      .from("team_members").select("team_id").eq("user_id", targetUserId).maybeSingle();
    if (!membership) return { isSeller: false as const, isPreview, previewName };

    const balance = await sellerBalance(targetUserId);

    const { data: rewards } = await supabaseAdmin
      .from("rewards").select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    const { data: orders } = await supabaseAdmin
      .from("reward_orders").select("*")
      .eq("seller_user_id", targetUserId)
      .order("requested_at", { ascending: false });

    return {
      isSeller: true as const,
      isPreview,
      previewName,
      balance,
      rewards: (rewards ?? []).map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        cost_points: r.cost_points,
        category: r.category,
        image_url: r.image_url,
        sort_order: r.sort_order,
      })),
      orders: (orders ?? []).map(o => ({
        id: o.id,
        reward_id: o.reward_id,
        cost_points: o.cost_points,
        status: o.status,
        requested_at: o.requested_at,
        fulfilled_at: o.fulfilled_at,
      })),
    };
  });

export const purchaseSellerReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    rewardId: z.string().uuid(),
    targetUserId: z.string().uuid().optional(),
  }).parse(input))
  .handler(async ({ context, data }) => {
    if (data.targetUserId && data.targetUserId !== context.userId) {
      if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: reward, error: rErr } = await supabaseAdmin
        .from("rewards").select("id, cost_points, active")
        .eq("id", data.rewardId).maybeSingle();
      if (rErr) throw new Error(rErr.message);
      if (!reward || !reward.active) throw new Error("Belöning saknas eller är inaktiv");
      const balance = await sellerBalance(data.targetUserId);
      if (balance < reward.cost_points) throw new Error(`Saknar ${reward.cost_points - balance} poäng`);
      const { data: order, error: oErr } = await supabaseAdmin.from("reward_orders").insert({
        seller_user_id: data.targetUserId,
        reward_id: reward.id,
        cost_points: reward.cost_points,
        status: "begard",
      }).select().single();
      if (oErr) throw new Error(oErr.message);
      const { error: tErr } = await supabaseAdmin.from("point_transactions").insert({
        seller_user_id: data.targetUserId,
        delta: -reward.cost_points,
        type: "spend",
        reference_id: order.id,
      });
      if (tErr) throw new Error(tErr.message);
      return { ok: true, order };
    }

    const { data: order, error } = await context.supabase.rpc("purchase_reward", { _reward_id: data.rewardId });
    if (error) throw new Error(error.message);
    return { ok: true, order };
  });

/* ---------------- Admin: catalog ---------------- */

const RewardInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  costPoints: z.number().int().min(0).max(1000000),
  category: z.string().trim().min(1).max(60),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const adminListRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureRewardCatalog();
    const { data: rewards } = await supabaseAdmin
      .from("rewards").select("*")
      .order("sort_order", { ascending: true });
    return { rewards: rewards ?? [] };
  });

export const adminCreateReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RewardInput.parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("rewards").insert({
      name: data.name,
      description: data.description || null,
      cost_points: data.costPoints,
      category: data.category,
      image_url: data.imageUrl || null,
      active: data.active ?? true,
      sort_order: data.sortOrder ?? 0,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RewardInput.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("rewards").update({
      name: data.name,
      description: data.description || null,
      cost_points: data.costPoints,
      category: data.category,
      image_url: data.imageUrl || null,
      active: data.active ?? true,
      sort_order: data.sortOrder ?? 0,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("rewards").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Admin: orders ---------------- */

export const adminListOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: orders } = await supabaseAdmin
      .from("reward_orders").select("*")
      .order("requested_at", { ascending: false });

    const rewardIds = Array.from(new Set((orders ?? []).map(o => o.reward_id)));
    const sellerIds = Array.from(new Set((orders ?? []).map(o => o.seller_user_id)));

    const { data: rewards } = await supabaseAdmin
      .from("rewards").select("id, name, category")
      .in("id", rewardIds.length ? rewardIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("user_id, name, email")
      .in("user_id", sellerIds.length ? sellerIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: members } = await supabaseAdmin
      .from("team_members").select("user_id, team_id")
      .in("user_id", sellerIds.length ? sellerIds : ["00000000-0000-0000-0000-000000000000"]);
    const teamIds = Array.from(new Set((members ?? []).map(m => m.team_id)));
    const { data: teams } = await supabaseAdmin
      .from("teams").select("id, name, organization_id")
      .in("id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]);
    const orgIds = Array.from(new Set((teams ?? []).map(t => t.organization_id)));
    const { data: orgs } = await supabaseAdmin
      .from("organizations").select("id, name")
      .in("id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"]);

    const rewardMap = new Map((rewards ?? []).map(r => [r.id, r]));
    const profMap = new Map((profiles ?? []).map(p => [p.user_id, p]));
    const memberMap = new Map((members ?? []).map(m => [m.user_id, m]));
    const teamMap = new Map((teams ?? []).map(t => [t.id, t]));
    const orgMap = new Map((orgs ?? []).map(o => [o.id, o]));

    return {
      orders: (orders ?? []).map(o => {
        const r = rewardMap.get(o.reward_id);
        const p = profMap.get(o.seller_user_id);
        const m = memberMap.get(o.seller_user_id);
        const t = m ? teamMap.get(m.team_id) : null;
        const org = t ? orgMap.get(t.organization_id) : null;
        return {
          id: o.id,
          status: o.status,
          cost_points: o.cost_points,
          requested_at: o.requested_at,
          fulfilled_at: o.fulfilled_at,
          reward_name: r?.name ?? "—",
          reward_category: r?.category ?? "",
          team_name: t?.name ?? "—",
          org_name: org?.name ?? "—",
          seller_name: p?.name || p?.email || "—",
          seller_email: p?.email ?? "",
          seller_user_id: o.seller_user_id,
        };
      }),
    };
  });

export const adminFulfillOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("reward_orders").update({
      status: "uppfylld",
      fulfilled_at: new Date().toISOString(),
      fulfilled_by: context.userId,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
