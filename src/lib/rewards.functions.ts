import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
}

async function getTeamTotalForUser(userId: string): Promise<{ teamId: string | null; total: number }> {
  const { data: m } = await supabaseAdmin
    .from("team_members").select("team_id").eq("user_id", userId).maybeSingle();
  if (!m) return { teamId: null, total: 0 };
  const { data: rows } = await supabaseAdmin
    .from("purchases").select("tree_count")
    .eq("registered_by_user_id", userId).eq("status", "paid");
  const total = (rows ?? []).reduce((s, r) => s + (r.tree_count ?? 0), 0);
  return { teamId: m.team_id, total };
}

/* ---------------- Seller view ---------------- */

export const getSellerRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = (input ?? {}) as { targetUserId?: string };
    return { targetUserId: typeof v.targetUserId === "string" && v.targetUserId.length > 0 ? v.targetUserId : undefined };
  })
  .handler(async ({ context, data }) => {
    let targetUserId = context.userId;
    let isPreview = false;
    let previewName: string | null = null;
    if (data.targetUserId && data.targetUserId !== context.userId) {
      if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
      targetUserId = data.targetUserId;
      isPreview = true;
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("name, email").eq("user_id", targetUserId).maybeSingle();
      previewName = prof?.name || prof?.email || "Säljare";
    }

    const { teamId, total } = await getTeamTotalForUser(targetUserId);
    if (!teamId) return { isSeller: false as const, isPreview, previewName };

    const { data: rewards } = await supabaseAdmin
      .from("rewards").select("*")
      .eq("team_id", teamId).eq("active", true)
      .order("threshold_trees", { ascending: true });

    const { data: claims } = await supabaseAdmin
      .from("reward_claims").select("*")
      .eq("seller_user_id", targetUserId);
    const claimByReward: Record<string, { id: string; status: string; requested_at: string; fulfilled_at: string | null }> = {};
    (claims ?? []).forEach(c => { claimByReward[c.reward_id] = { id: c.id, status: c.status, requested_at: c.requested_at, fulfilled_at: c.fulfilled_at }; });

    return {
      isSeller: true as const,
      isPreview,
      previewName,
      treeCount: total,
      rewards: (rewards ?? []).map(r => ({
        id: r.id, name: r.name, description: r.description,
        threshold_trees: r.threshold_trees, category: r.category, image_url: r.image_url,
        unlocked: total >= r.threshold_trees,
        claim: claimByReward[r.id] ?? null,
      })),
    };
  });

export const claimSellerReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ rewardId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { teamId, total } = await getTeamTotalForUser(context.userId);
    if (!teamId) throw new Error("Du är inte säljare.");
    const { data: reward } = await supabaseAdmin
      .from("rewards").select("*").eq("id", data.rewardId).maybeSingle();
    if (!reward) throw new Error("Belöningen hittades inte.");
    if (reward.team_id !== teamId) throw new Error("Belöningen tillhör inte ditt team.");
    if (!reward.active) throw new Error("Belöningen är inte aktiv.");
    if (total < reward.threshold_trees) throw new Error("Tröskeln är inte nådd än.");

    const { data: existing } = await supabaseAdmin
      .from("reward_claims").select("id")
      .eq("reward_id", reward.id).eq("seller_user_id", context.userId).maybeSingle();
    if (existing) return { ok: true, alreadyClaimed: true };

    const { error } = await supabaseAdmin.from("reward_claims").insert({
      reward_id: reward.id,
      seller_user_id: context.userId,
      status: "begard",
    });
    if (error) throw new Error(error.message);
    return { ok: true, alreadyClaimed: false };
  });

/* ---------------- Admin CRUD ---------------- */

const RewardInput = z.object({
  teamId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  thresholdTrees: z.number().int().min(0).max(100000),
  category: z.string().trim().max(60).optional().nullable(),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().optional(),
});

export const adminListRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ teamId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
    const { data: rewards } = await supabaseAdmin
      .from("rewards").select("*")
      .eq("team_id", data.teamId)
      .order("threshold_trees", { ascending: true });
    return { rewards: rewards ?? [] };
  });

export const adminCreateReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RewardInput.parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("rewards").insert({
      team_id: data.teamId,
      name: data.name,
      description: data.description || null,
      threshold_trees: data.thresholdTrees,
      category: data.category || null,
      image_url: data.imageUrl || null,
      active: data.active ?? true,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RewardInput.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("rewards").update({
      name: data.name,
      description: data.description || null,
      threshold_trees: data.thresholdTrees,
      category: data.category || null,
      image_url: data.imageUrl || null,
      active: data.active ?? true,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("rewards").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Admin claims ---------------- */

export const adminListClaims = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
    const { data: claims } = await supabaseAdmin
      .from("reward_claims").select("*")
      .order("requested_at", { ascending: false });
    const rewardIds = Array.from(new Set((claims ?? []).map(c => c.reward_id)));
    const sellerIds = Array.from(new Set((claims ?? []).map(c => c.seller_user_id)));
    const { data: rewards } = await supabaseAdmin
      .from("rewards").select("id, name, threshold_trees, team_id")
      .in("id", rewardIds.length ? rewardIds : ["00000000-0000-0000-0000-000000000000"]);
    const teamIds = Array.from(new Set((rewards ?? []).map(r => r.team_id)));
    const { data: teams } = await supabaseAdmin
      .from("teams").select("id, name, organization_id")
      .in("id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]);
    const orgIds = Array.from(new Set((teams ?? []).map(t => t.organization_id)));
    const { data: orgs } = await supabaseAdmin
      .from("organizations").select("id, name")
      .in("id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("user_id, name, email")
      .in("user_id", sellerIds.length ? sellerIds : ["00000000-0000-0000-0000-000000000000"]);

    const rewardMap = new Map((rewards ?? []).map(r => [r.id, r]));
    const teamMap = new Map((teams ?? []).map(t => [t.id, t]));
    const orgMap = new Map((orgs ?? []).map(o => [o.id, o]));
    const profMap = new Map((profiles ?? []).map(p => [p.user_id, p]));

    return {
      claims: (claims ?? []).map(c => {
        const r = rewardMap.get(c.reward_id);
        const t = r ? teamMap.get(r.team_id) : null;
        const o = t ? orgMap.get(t.organization_id) : null;
        const p = profMap.get(c.seller_user_id);
        return {
          id: c.id,
          status: c.status,
          requested_at: c.requested_at,
          fulfilled_at: c.fulfilled_at,
          reward_name: r?.name ?? "—",
          threshold_trees: r?.threshold_trees ?? 0,
          team_name: t?.name ?? "—",
          org_name: o?.name ?? "—",
          seller_name: p?.name || p?.email || "—",
          seller_email: p?.email ?? "",
        };
      }),
    };
  });

export const adminFulfillClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("reward_claims").update({
      status: "uppfylld",
      fulfilled_at: new Date().toISOString(),
      fulfilled_by: context.userId,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
