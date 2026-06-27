import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, renderThanksEmail } from "@/lib/email/resend.server";
import { getRequestHeader } from "@tanstack/react-start/server";

const PRICE_PER_TREE_ORE = 3500;
const STHLM = "Europe/Stockholm";

function ymdStockholm(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STHLM, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
function weekdayMonStockholm(d: Date): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: STHLM, weekday: "short" }).format(d);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[s] ?? 1;
}
function isoWeekStockholm(d: Date): string {
  // ISO week label like "2026-W26" based on Europe/Stockholm calendar date
  const dateStr = ymdStockholm(d); // YYYY-MM-DD in Stockholm
  const [y, m, day] = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, day));
  const dayOfWeek = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}


export const getSellerContext = createServerFn({ method: "POST" })
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
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Forbidden: super-admin krävs för att förhandsvisa säljarvy.");
      targetUserId = data.targetUserId;
      isPreview = true;
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("name, email")
        .eq("user_id", targetUserId)
        .maybeSingle();
      previewName = prof?.name || prof?.email || "Säljare";
    }

    const { data: member } = await supabaseAdmin
      .from("team_members")
      .select("id, team_id, role")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (!member) return { isSeller: false as const, isPreview, previewName, previewUserId: isPreview ? targetUserId : undefined };

    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("id, name, organization_id, weekly_goal_trees, team_bonus_points")
      .eq("id", member.team_id)
      .single();
    const teamGoal = (team as { weekly_goal_trees?: number | null } | null)?.weekly_goal_trees ?? 0;
    const teamBonus = (team as { team_bonus_points?: number | null } | null)?.team_bonus_points ?? 0;

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name, type")
      .eq("id", team!.organization_id)
      .single();

    const { data: teamMembers } = await supabaseAdmin
      .from("team_members")
      .select("user_id")
      .eq("team_id", member.team_id);
    const teamUserIds = (teamMembers ?? []).map((m) => m.user_id);

    const { data: orgTeams } = await supabaseAdmin
      .from("teams")
      .select("id, name")
      .eq("organization_id", team!.organization_id);
    const orgTeamIds = (orgTeams ?? []).map((t) => t.id);
    const { data: orgMembers } = await supabaseAdmin
      .from("team_members")
      .select("user_id, team_id")
      .in("team_id", orgTeamIds.length ? orgTeamIds : ["00000000-0000-0000-0000-000000000000"]);
    const userTeam: Record<string, string> = {};
    (orgMembers ?? []).forEach((m) => { userTeam[m.user_id] = m.team_id; });

    const orgUserIds = Object.keys(userTeam);
    const { data: allPurchases } = await supabaseAdmin
      .from("purchases")
      .select("tree_count, created_at, registered_by_user_id")
      .in("registered_by_user_id", orgUserIds.length ? orgUserIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("status", "paid");

    const { data: myPurchases } = await supabaseAdmin
      .from("purchases")
      .select("id, tree_count, total_amount_ore, status, created_at, recipient_name, recipient_email")
      .eq("registered_by_user_id", targetUserId)
      .eq("status", "paid")
      .order("created_at", { ascending: false });

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, name")
      .in("user_id", teamUserIds.length ? teamUserIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameByUser: Record<string, string> = {};
    (profiles ?? []).forEach((p) => { nameByUser[p.user_id] = p.name || "Säljare"; });

    const now = new Date();
    const todayStr = ymdStockholm(now);
    const dow = weekdayMonStockholm(now);
    const mondayDate = new Date(now.getTime() - (dow - 1) * 86400000);
    const weekStartStr = ymdStockholm(mondayDate);

    type Agg = { total: number; week: number; today: number };
    const perUser: Record<string, Agg> = {};
    const perTeam: Record<string, { total: number; week: number }> = {};
    const myDays = new Set<string>();
    (allPurchases ?? []).forEach((p) => {
      const uid = p.registered_by_user_id as string;
      if (!uid) return;
      const dayStr = ymdStockholm(new Date(p.created_at));
      const a = perUser[uid] ?? { total: 0, week: 0, today: 0 };
      a.total += p.tree_count;
      if (dayStr >= weekStartStr) a.week += p.tree_count;
      if (dayStr === todayStr) a.today += p.tree_count;
      perUser[uid] = a;
      const tid = userTeam[uid];
      if (tid) {
        const t = perTeam[tid] ?? { total: 0, week: 0 };
        t.total += p.tree_count;
        if (dayStr >= weekStartStr) t.week += p.tree_count;
        perTeam[tid] = t;
      }
      if (uid === targetUserId) myDays.add(dayStr);
    });

    const my = perUser[targetUserId] ?? { total: 0, week: 0, today: 0 };

    const yesterday = ymdStockholm(new Date(now.getTime() - 86400000));
    let streak = 0;
    const cursor = myDays.has(todayStr) ? todayStr : (myDays.has(yesterday) ? yesterday : null);
    if (cursor) {
      const start = new Date(`${cursor}T12:00:00Z`);
      for (let i = 0; i < 365; i++) {
        const d = ymdStockholm(new Date(start.getTime() - i * 86400000));
        if (myDays.has(d)) streak++; else break;
      }
    }

    const teamSellersWeek = teamUserIds
      .map((uid) => ({ userId: uid, name: nameByUser[uid] ?? "Säljare", trees: perUser[uid]?.week ?? 0 }))
      .sort((a, b) => b.trees - a.trees);
    const teamSellersTotal = teamUserIds
      .map((uid) => ({ userId: uid, name: nameByUser[uid] ?? "Säljare", trees: perUser[uid]?.total ?? 0 }))
      .sort((a, b) => b.trees - a.trees);

    const orgTeamsWeek = (orgTeams ?? [])
      .map((t) => ({ teamId: t.id, name: t.name, trees: perTeam[t.id]?.week ?? 0 }))
      .sort((a, b) => b.trees - a.trees);
    const orgTeamsTotal = (orgTeams ?? [])
      .map((t) => ({ teamId: t.id, name: t.name, trees: perTeam[t.id]?.total ?? 0 }))
      .sort((a, b) => b.trees - a.trees);

    const teamTotalAll = (orgTeams ?? []).find((t) => t.id === team!.id)
      ? (perTeam[team!.id]?.total ?? 0)
      : 0;

    const weekLeader = teamSellersWeek[0];
    const isWeekLeader = !!weekLeader && weekLeader.userId === targetUserId && weekLeader.trees > 0;
    const isEldsjal = streak >= 3;
    const lagmarke = teamTotalAll >= 100;

    const badges = {
      forstaTradet: my.total >= 1,
      gronTumme: my.total >= 10,
      skogshjalte: my.total >= 50,
      skogsmastare: my.total >= 100,
      veckansSaljare: isWeekLeader,
      eldsjal: isEldsjal,
      lagmarke,
    };

    return {
      isSeller: true as const,
      isPreview,
      previewName,
      previewUserId: isPreview ? targetUserId : undefined,
      userId: targetUserId,
      role: member.role,
      team: { id: team!.id, name: team!.name },
      organization: { id: org!.id, name: org!.name, type: org!.type },
      treeCount: my.total,
      weekTrees: my.week,
      todayTrees: my.today,
      streak,
      badges,
      teamTotal: teamTotalAll,
      leaderboards: {
        sellersWeek: teamSellersWeek,
        sellersTotal: teamSellersTotal,
        teamsWeek: orgTeamsWeek,
        teamsTotal: orgTeamsTotal,
      },
      purchases: myPurchases ?? [],
    };
  });

const PurchaseSchema = z.object({
  treeCount: z.number().int().min(1).max(10000),
  recipientName: z.string().trim().min(1).max(120),
  recipientEmail: z.string().trim().email().max(255),
});

export const sellerCreatePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PurchaseSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: member } = await supabaseAdmin
      .from("team_members")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) throw new Error("Du är inte registrerad som säljare.");

    const email = data.recipientEmail.toLowerCase();
    const name = data.recipientName;

    const { data: existing } = await supabaseAdmin
      .from("customers")
      .select("id, name")
      .eq("email", email)
      .maybeSingle();
    let customerId: string;
    if (existing) {
      customerId = existing.id;
      if (existing.name !== name) {
        await supabaseAdmin.from("customers").update({ name, updated_at: new Date().toISOString() }).eq("id", customerId);
      }
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("customers")
        .insert({ email, name })
        .select("id")
        .single();
      if (error) throw new Error(`Kundskapande misslyckades: ${error.message}`);
      customerId = inserted.id;
    }

    const total = data.treeCount * PRICE_PER_TREE_ORE;
    const { data: purchase, error: pErr } = await supabaseAdmin
      .from("purchases")
      .insert({
        customer_id: customerId,
        recipient_name: name,
        recipient_email: email,
        tree_count: data.treeCount,
        unit_price_ore: PRICE_PER_TREE_ORE,
        total_amount_ore: total,
        status: "paid",
        paid_at: new Date().toISOString(),
        registered_by_user_id: context.userId,
      })
      .select("id, created_at")
      .single();
    if (pErr) throw new Error(`Köpet misslyckades: ${pErr.message}`);

    const { data: cert, error: cErr } = await supabaseAdmin.rpc("generate_certificate", {
      _purchase_id: purchase.id,
    });
    if (cErr) throw new Error(`Värdebevis misslyckades: ${cErr.message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const certificate = cert as any;

    const host = getRequestHeader("host") || "smartklimat.app";
    const proto = (getRequestHeader("x-forwarded-proto") || "https").split(",")[0];
    const verifyUrl = `${proto}://${host}/v/${certificate.verification_id}`;
    const totalKr = `${(total / 100).toLocaleString("sv-SE")} kr`;
    const dateText = new Date(purchase.created_at).toLocaleDateString("sv-SE", {
      year: "numeric", month: "long", day: "numeric",
    });

    const { subject, html } = renderThanksEmail({
      recipientName: name,
      recipientEmail: email,
      treeCount: data.treeCount,
      totalKr,
      dateText,
      verificationId: certificate.verification_id,
      verifyUrl,
    });
    const emailResult = await sendEmail({ to: email, subject, html });

    return {
      certificateJson: JSON.stringify(certificate),
      emailSent: emailResult.ok === true,
      recipientEmail: email,
    };
  });
