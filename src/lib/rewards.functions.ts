import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REWARD_SEEDS } from "@/lib/reward-catalog";
import { sendRewardClaimEmail, sendLeaderShipmentEmail, type ShipmentEmailItem } from "@/lib/email/reward-mails.server";
import { sendPushToUser } from "@/lib/push.server";

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

async function firstName(userId: string): Promise<{ firstName: string; recipient: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles").select("name, email, is_minor, guardian_email")
    .eq("user_id", userId).maybeSingle();
  const nm = (data?.name ?? "").trim();
  const fn = nm ? nm.split(/\s+/)[0] : "vän";
  const recipient = data?.is_minor && data.guardian_email ? data.guardian_email : (data?.email ?? null);
  return { firstName: fn, recipient };
}

async function logAdmin(userId: string, action: string, detail: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_activity").insert({ user_id: userId, action, detail });
}

async function ensureRewardCatalog() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing, error: readError } = await supabaseAdmin
    .from("rewards").select("id, name, image_url");
  if (readError) throw new Error(readError.message);
  const byName = new Map((existing ?? []).map((r) => [r.name, r]));
  const missing = REWARD_SEEDS.filter((seed) => !byName.has(seed.name));
  if (missing.length > 0) {
    const { error: insertError } = await supabaseAdmin.from("rewards").insert(
      missing.map((seed) => ({
        name: seed.name, description: seed.description, cost_points: seed.cost_points,
        category: seed.category, image_url: seed.image_url, active: true, sort_order: seed.sort_order,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }
  const imagePatches = REWARD_SEEDS.filter((seed) => {
    const current = byName.get(seed.name);
    return current && !current.image_url && seed.image_url;
  });
  for (const seed of imagePatches) {
    const { error } = await supabaseAdmin.from("rewards").update({ image_url: seed.image_url }).eq("name", seed.name);
    if (error) throw new Error(error.message);
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
      .from("rewards").select("*").eq("active", true).order("sort_order", { ascending: true });

    const { data: orders } = await supabaseAdmin
      .from("reward_orders").select("*")
      .eq("seller_user_id", targetUserId).order("requested_at", { ascending: false });

    return {
      isSeller: true as const, isPreview, previewName, balance,
      rewards: (rewards ?? []).map((r) => ({
        id: r.id, name: r.name, description: r.description,
        cost_points: r.cost_points, category: r.category, image_url: r.image_url,
        sort_order: r.sort_order,
        stock: r.stock as number | null,
        is_digital: !!r.is_digital,
        sold_out: r.stock !== null && (r.stock as number) <= 0,
      })),
      orders: (orders ?? []).map((o) => ({
        id: o.id, reward_id: o.reward_id, cost_points: o.cost_points,
        status: o.status, requested_at: o.requested_at, fulfilled_at: o.fulfilled_at,
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let buyerUserId = context.userId;
    let orderRow: { id: string; reward_id: string; cost_points: number; status: string } | null = null;

    if (data.targetUserId && data.targetUserId !== context.userId) {
      // Admin agerar för en säljare (förhandsvisning). Speglar RPC-logiken manuellt.
      if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
      buyerUserId = data.targetUserId;

      const { data: reward, error: rErr } = await supabaseAdmin
        .from("rewards").select("*").eq("id", data.rewardId).maybeSingle();
      if (rErr) throw new Error(rErr.message);
      if (!reward || !reward.active) throw new Error("Belöning saknas eller är inaktiv");
      if (reward.stock !== null && (reward.stock as number) <= 0) throw new Error("Slutsåld just nu");

      const balance = await sellerBalance(buyerUserId);
      if (balance < reward.cost_points) throw new Error(`Saknar ${reward.cost_points - balance} poäng`);

      const { data: memb } = await supabaseAdmin
        .from("team_members").select("team_id").eq("user_id", buyerUserId).maybeSingle();
      if (!memb) throw new Error("Säljaren har inget lag");

      if (reward.stock !== null) {
        await supabaseAdmin.from("rewards").update({ stock: (reward.stock as number) - 1 }).eq("id", reward.id);
      }

      const isDigital = !!reward.is_digital;
      const { data: order, error: oErr } = await supabaseAdmin.from("reward_orders").insert({
        seller_user_id: buyerUserId, reward_id: reward.id, cost_points: reward.cost_points,
        team_id: memb.team_id, status: isDigital ? "delivered" : "pending",
        delivered_at: isDigital ? new Date().toISOString() : null,
        delivered_by: isDigital ? buyerUserId : null,
      }).select().single();
      if (oErr) throw new Error(oErr.message);
      await supabaseAdmin.from("point_transactions").insert({
        seller_user_id: buyerUserId, delta: -reward.cost_points, type: "spend",
        reference_id: order.id, description: `Köpte ${reward.name}`,
      });
      orderRow = order as typeof orderRow;
    } else {
      // Vanlig säljare — kör atomisk RPC
      const { data: order, error } = await context.supabase.rpc("purchase_reward", { _reward_id: data.rewardId });
      if (error) throw new Error(error.message);
      orderRow = order as typeof orderRow;
    }

    // Skicka bekräftelsemail (best-effort, tystar sig men loggas)
    try {
      const { data: r } = await supabaseAdmin
        .from("rewards").select("name, image_url, is_digital").eq("id", data.rewardId).maybeSingle();
      const { firstName: fn, recipient } = await firstName(buyerUserId);
      if (r && recipient && orderRow) {
        await sendRewardClaimEmail({
          to: recipient, firstName: fn, rewardName: r.name,
          rewardImageUrl: r.image_url, costPoints: orderRow.cost_points,
          isDigital: !!r.is_digital,
        });
      }
    } catch (e) {
      console.error("[rewards] confirmation email failed", (e as Error).message);
    }

    return { ok: true, order: orderRow };
  });

/* ---------------- Admin: catalog ---------------- */

const RewardInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  costPoints: z.number().int().min(0).max(1000000),
  costOre: z.number().int().min(0).max(100000000).optional(),
  category: z.string().trim().min(1).max(60),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  stock: z.number().int().min(0).max(1000000).nullable().optional(),
  isDigital: z.boolean().optional(),
});

export const adminListRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureRewardCatalog();
    const { data: rewards } = await supabaseAdmin
      .from("rewards").select("*").order("sort_order", { ascending: true });
    return { rewards: rewards ?? [] };
  });

export const adminCreateReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RewardInput.parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("rewards").insert({
      name: data.name, description: data.description || null,
      cost_points: data.costPoints, cost_ore: data.costOre ?? 0,
      category: data.category, image_url: data.imageUrl || null,
      active: data.active ?? true, sort_order: data.sortOrder ?? 0,
      stock: data.stock ?? null, is_digital: data.isDigital ?? false,
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
      name: data.name, description: data.description || null,
      cost_points: data.costPoints, cost_ore: data.costOre ?? 0,
      category: data.category, image_url: data.imageUrl || null,
      active: data.active ?? true, sort_order: data.sortOrder ?? 0,
      stock: data.stock ?? null, is_digital: data.isDigital ?? false,
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

/* ---------------- Admin: all orders (translog/backup) ---------------- */

export const adminListOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: orders } = await supabaseAdmin
      .from("reward_orders").select("*").order("requested_at", { ascending: false });

    const rewardIds = Array.from(new Set((orders ?? []).map((o) => o.reward_id)));
    const sellerIds = Array.from(new Set((orders ?? []).map((o) => o.seller_user_id)));
    const teamIdsFromOrders = Array.from(new Set((orders ?? []).map((o) => o.team_id).filter(Boolean) as string[]));

    const { data: rewards } = await supabaseAdmin
      .from("rewards").select("id, name, category, image_url, is_digital")
      .in("id", rewardIds.length ? rewardIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("user_id, name, email")
      .in("user_id", sellerIds.length ? sellerIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: teams } = await supabaseAdmin
      .from("teams").select("id, name, organization_id")
      .in("id", teamIdsFromOrders.length ? teamIdsFromOrders : ["00000000-0000-0000-0000-000000000000"]);
    const orgIds = Array.from(new Set((teams ?? []).map((t) => t.organization_id).filter(Boolean) as string[]));
    const { data: orgs } = await supabaseAdmin
      .from("organizations").select("id, name")
      .in("id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"]);

    const rewardMap = new Map((rewards ?? []).map((r) => [r.id, r]));
    const profMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const teamMap = new Map((teams ?? []).map((t) => [t.id, t]));
    const orgMap = new Map((orgs ?? []).map((o) => [o.id, o]));

    return {
      orders: (orders ?? []).map((o) => {
        const r = rewardMap.get(o.reward_id);
        const p = profMap.get(o.seller_user_id);
        const t = o.team_id ? teamMap.get(o.team_id) : null;
        const org = t?.organization_id ? orgMap.get(t.organization_id) : null;
        return {
          id: o.id, status: o.status, cost_points: o.cost_points,
          requested_at: o.requested_at, fulfilled_at: o.fulfilled_at,
          reward_name: r?.name ?? "—", reward_category: r?.category ?? "",
          team_id: o.team_id as string | null,
          team_name: t?.name ?? "—", org_name: org?.name ?? "—",
          seller_name: p?.name || p?.email || "—", seller_email: p?.email ?? "",
          seller_user_id: o.seller_user_id,
        };
      }),
    };
  });

/** @deprecated bevaras för äldre knappar — sätter direkt till delivered. */
export const adminFulfillOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("reward_orders").update({
      status: "delivered", fulfilled_at: now, fulfilled_by: context.userId,
      delivered_at: now, delivered_by: context.userId,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAdmin(context.userId, "reward_admin_deliver", { order_id: data.id });
    return { ok: true };
  });

/* ---------------- Admin: pack queue ---------------- */

/** Pending-ordrar grupperade per lag för packning + skickning. */
export const adminListPackQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: orders } = await supabaseAdmin
      .from("reward_orders").select("id, status, reward_id, seller_user_id, team_id, cost_points, requested_at, packed_at")
      .in("status", ["pending", "packed"])
      .not("team_id", "is", null)
      .order("requested_at", { ascending: true });

    const rewardIds = Array.from(new Set((orders ?? []).map((o) => o.reward_id)));
    const sellerIds = Array.from(new Set((orders ?? []).map((o) => o.seller_user_id)));
    const teamIds = Array.from(new Set((orders ?? []).map((o) => o.team_id).filter(Boolean) as string[]));

    const [{ data: rewards }, { data: profiles }, { data: teams }] = await Promise.all([
      supabaseAdmin.from("rewards").select("id, name, image_url, is_digital")
        .in("id", rewardIds.length ? rewardIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("profiles").select("user_id, name, email")
        .in("user_id", sellerIds.length ? sellerIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("teams").select("id, name, organization_id")
        .in("id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const orgIds = Array.from(new Set((teams ?? []).map((t) => t.organization_id).filter(Boolean) as string[]));
    const { data: orgs } = await supabaseAdmin
      .from("organizations").select("id, name")
      .in("id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"]);

    const rewardMap = new Map((rewards ?? []).map((r) => [r.id, r]));
    const profMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const teamMap = new Map((teams ?? []).map((t) => [t.id, t]));
    const orgMap = new Map((orgs ?? []).map((o) => [o.id, o]));

    const groups: Record<string, {
      team_id: string; team_name: string; org_name: string;
      status_summary: { pending: number; packed: number };
      items: { reward_id: string; reward_name: string; image_url: string | null; count: number; sellers: string[]; order_ids: string[] }[];
    }> = {};

    for (const o of orders ?? []) {
      const teamId = o.team_id as string;
      const t = teamMap.get(teamId);
      const org = t?.organization_id ? orgMap.get(t.organization_id) : null;
      const key = teamId;
      const g = (groups[key] ||= {
        team_id: teamId, team_name: t?.name ?? "—", org_name: org?.name ?? "—",
        status_summary: { pending: 0, packed: 0 }, items: [],
      });
      if (o.status === "pending") g.status_summary.pending++;
      if (o.status === "packed") g.status_summary.packed++;
      const r = rewardMap.get(o.reward_id);
      const p = profMap.get(o.seller_user_id);
      const sellerFirst = (p?.name || p?.email || "Säljare").trim().split(/\s+/)[0];
      let item = g.items.find((i) => i.reward_id === o.reward_id);
      if (!item) {
        item = { reward_id: o.reward_id, reward_name: r?.name ?? "—", image_url: r?.image_url ?? null, count: 0, sellers: [], order_ids: [] };
        g.items.push(item);
      }
      item.count++;
      item.sellers.push(sellerFirst);
      item.order_ids.push(o.id);
    }

    return { groups: Object.values(groups) };
  });

export const adminMarkTeamPacked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ teamId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin.from("reward_orders")
      .update({ status: "packed", packed_at: now, packed_by: context.userId })
      .eq("team_id", data.teamId).eq("status", "pending").select("id");
    if (error) throw new Error(error.message);
    await logAdmin(context.userId, "reward_pack_team", { team_id: data.teamId, count: (updated ?? []).length });
    return { ok: true, count: (updated ?? []).length };
  });

export const adminMarkTeamShipped = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ teamId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    // Skicka både pending och packed → shipped (skydd om admin hoppar över packad)
    const { data: updated, error } = await supabaseAdmin.from("reward_orders")
      .update({ status: "shipped", shipped_at: now, shipped_by: context.userId,
                packed_at: now, packed_by: context.userId })
      .eq("team_id", data.teamId).in("status", ["pending", "packed"]).select("id, reward_id, seller_user_id");
    if (error) throw new Error(error.message);
    const orders = updated ?? [];

    // Bygg packlista + hitta ledaren
    const rewardIds = Array.from(new Set(orders.map((o) => o.reward_id)));
    const sellerIds = Array.from(new Set(orders.map((o) => o.seller_user_id)));
    const [{ data: rewards }, { data: profiles }, { data: team }, { data: leaderMembers }] = await Promise.all([
      supabaseAdmin.from("rewards").select("id, name, image_url").in("id", rewardIds.length ? rewardIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("profiles").select("user_id, name, email").in("user_id", sellerIds.length ? sellerIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("teams").select("id, name, organization_id, created_by_user_id").eq("id", data.teamId).maybeSingle(),
      supabaseAdmin.from("team_members").select("user_id, role").eq("team_id", data.teamId).eq("role", "team_leader"),
    ]);
    const rewardMap = new Map((rewards ?? []).map((r) => [r.id, r]));
    const profMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    const leaderId = (leaderMembers?.[0]?.user_id as string | undefined) ?? team?.created_by_user_id ?? null;
    let orgName: string | null = null;
    if (team?.organization_id) {
      const { data: org } = await supabaseAdmin.from("organizations").select("name").eq("id", team.organization_id).maybeSingle();
      orgName = org?.name ?? null;
    }

    const itemsMap = new Map<string, ShipmentEmailItem>();
    for (const o of orders) {
      const r = rewardMap.get(o.reward_id);
      const p = profMap.get(o.seller_user_id);
      const sellerFirst = (p?.name || p?.email || "Säljare").trim().split(/\s+/)[0];
      const key = o.reward_id;
      let item = itemsMap.get(key);
      if (!item) {
        item = { rewardName: r?.name ?? "—", imageUrl: r?.image_url ?? null, count: 0, sellers: [] };
        itemsMap.set(key, item);
      }
      item.count++;
      item.sellers.push(sellerFirst);
    }

    let mailStatus: { ok: boolean; messageId?: string | null; error?: string } = { ok: false };
    if (leaderId) {
      const { data: leaderProf } = await supabaseAdmin
        .from("profiles").select("name, email").eq("user_id", leaderId).maybeSingle();
      const leaderEmail = leaderProf?.email;
      if (leaderEmail) {
        try {
          const res = await sendLeaderShipmentEmail({
            to: leaderEmail,
            leaderFirstName: ((leaderProf?.name ?? "").trim().split(/\s+/)[0]) || "ledare",
            teamName: team?.name ?? "laget",
            orgName,
            items: Array.from(itemsMap.values()),
          });
          mailStatus = { ok: res.ok, messageId: res.messageId ?? null, error: res.error };
        } catch (e) {
          mailStatus = { ok: false, error: (e as Error).message };
        }
      }
    }

    await logAdmin(context.userId, "reward_ship_team", {
      team_id: data.teamId, count: orders.length,
      leader_user_id: leaderId, mail_ok: mailStatus.ok, mail_id: mailStatus.messageId ?? null,
    });
    return { ok: true, count: orders.length, mailOk: mailStatus.ok, messageId: mailStatus.messageId ?? null };
  });

/* ---------------- Leader: delivery view ---------------- */

async function leaderTeamId(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: mem } = await supabaseAdmin
    .from("team_members").select("team_id").eq("user_id", userId).eq("role", "team_leader").maybeSingle();
  if (mem?.team_id) return mem.team_id;
  const { data: team } = await supabaseAdmin
    .from("teams").select("id").eq("created_by_user_id", userId).maybeSingle();
  return team?.id ?? null;
}

export const leaderListDeliverables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const teamId = await leaderTeamId(context.userId);
    if (!teamId) return { isLeader: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team } = await supabaseAdmin
      .from("teams").select("id, name").eq("id", teamId).maybeSingle();
    const { data: orders } = await supabaseAdmin
      .from("reward_orders").select("id, status, reward_id, seller_user_id, cost_points, requested_at, shipped_at, delivered_at")
      .eq("team_id", teamId).in("status", ["shipped", "delivered"])
      .order("shipped_at", { ascending: false, nullsFirst: false });

    const rewardIds = Array.from(new Set((orders ?? []).map((o) => o.reward_id)));
    const sellerIds = Array.from(new Set((orders ?? []).map((o) => o.seller_user_id)));
    const [{ data: rewards }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("rewards").select("id, name, image_url")
        .in("id", rewardIds.length ? rewardIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("profiles").select("user_id, name, email, avatar_key")
        .in("user_id", sellerIds.length ? sellerIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const rMap = new Map((rewards ?? []).map((r) => [r.id, r]));
    const pMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    return {
      isLeader: true as const,
      teamId, teamName: team?.name ?? "Ditt lag",
      orders: (orders ?? []).map((o) => {
        const r = rMap.get(o.reward_id);
        const p = pMap.get(o.seller_user_id);
        const nm = (p?.name || p?.email || "Säljare").trim();
        return {
          id: o.id, status: o.status, cost_points: o.cost_points,
          shipped_at: o.shipped_at, delivered_at: o.delivered_at, requested_at: o.requested_at,
          reward_name: r?.name ?? "—", reward_image: r?.image_url ?? null,
          seller_user_id: o.seller_user_id,
          seller_first: nm.split(/\s+/)[0], seller_full: nm,
          seller_avatar: p?.avatar_key ?? null,
        };
      }),
    };
  });

export const leaderMarkDelivered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const teamId = await leaderTeamId(context.userId);
    if (!teamId) throw new Error("Endast lagledare kan kvittera utdelning.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    // RLS på user-klienten godkänner endast egna lagets ordrar
    const { data: updated, error } = await context.supabase
      .from("reward_orders")
      .update({ status: "delivered", delivered_at: now, delivered_by: context.userId })
      .eq("id", data.orderId).eq("team_id", teamId).eq("status", "shipped")
      .select("id, seller_user_id, reward_id").single();
    if (error) throw new Error(error.message);

    // Push till barnet
    try {
      await sendPushToUser({
        userId: updated.seller_user_id,
        title: "🎁 Ditt pris är utdelat",
        body: "Ditt pris är utdelat — snyggt jobbat!",
        url: "/beloningar",
        kind: "reward_delivered",
        tag: `reward-${updated.id}`,
      });
    } catch (e) {
      console.error("[rewards] delivery push failed", (e as Error).message);
    }

    // Log till admin_activity (best-effort som ledaren skriver via service role)
    try {
      await supabaseAdmin.from("admin_activity").insert({
        user_id: context.userId, action: "reward_deliver_leader",
        detail: { order_id: updated.id, team_id: teamId, seller_user_id: updated.seller_user_id, reward_id: updated.reward_id },
      });
    } catch (e) {
      console.error("[rewards] admin_activity insert failed", (e as Error).message);
    }

    return { ok: true };
  });
