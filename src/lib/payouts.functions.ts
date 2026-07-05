import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId, _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

// ---------- Leader ----------

export const getLeaderFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find team(s) where caller is leader (created_by_user_id)
    const { data: teams } = await supabaseAdmin
      .from("teams")
      .select("id, name")
      .eq("created_by_user_id", context.userId);
    if (!teams || teams.length === 0) {
      return { isLeader: false as const };
    }
    const team = teams[0] as { id: string; name: string };

    // Earned = sum of team_share_ore on paid purchases for this team
    const { data: earnedRows } = await supabaseAdmin
      .from("purchases")
      .select("team_share_ore")
      .eq("team_id", team.id)
      .eq("status", "paid");
    const earned = (earnedRows ?? []).reduce((s: number, r: any) => s + (r.team_share_ore || 0), 0);

    // Payouts
    const { data: payouts } = await supabaseAdmin
      .from("payout_requests")
      .select("id, amount_ore, status, recipient, note, created_at, handled_at, handled_by")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false });

    const paid = (payouts ?? []).filter((p: any) => p.status === "paid")
      .reduce((s: number, r: any) => s + (r.amount_ore || 0), 0);
    const reserved = (payouts ?? []).filter((p: any) => p.status === "pending" || p.status === "approved")
      .reduce((s: number, r: any) => s + (r.amount_ore || 0), 0);
    const available = Math.max(0, earned - paid - reserved);

    const { data: settings } = await supabaseAdmin
      .from("app_settings").select("team_share_ore_per_tree").eq("id", 1).maybeSingle();
    const orePerTree = (settings as any)?.team_share_ore_per_tree ?? 0;

    return {
      isLeader: true as const,
      team,
      earnedOre: earned,
      paidOre: paid,
      reservedOre: reserved,
      availableOre: available,
      orePerTree,
      payouts: payouts ?? [],
    };
  });

const PayoutSchema = z.object({
  amountOre: z.number().int().min(50000),
  recipient: z.object({
    accountType: z.enum(["bankgiro", "plusgiro", "swish"]),
    number: z.string().trim().min(3).max(40),
    contactName: z.string().trim().min(1).max(120),
  }),
});

export const createPayoutRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PayoutSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: teams } = await supabaseAdmin
      .from("teams").select("id").eq("created_by_user_id", context.userId);
    if (!teams || teams.length === 0) throw new Error("Du är inte ledare för något lag.");
    const teamId = (teams[0] as any).id as string;

    // Recompute available server-side
    const { data: earnedRows } = await supabaseAdmin
      .from("purchases").select("team_share_ore")
      .eq("team_id", teamId).eq("status", "paid");
    const earned = (earnedRows ?? []).reduce((s: number, r: any) => s + (r.team_share_ore || 0), 0);
    const { data: payouts } = await supabaseAdmin
      .from("payout_requests").select("amount_ore, status").eq("team_id", teamId);
    const paid = (payouts ?? []).filter((p: any) => p.status === "paid").reduce((s: number, r: any) => s + (r.amount_ore || 0), 0);
    const reserved = (payouts ?? []).filter((p: any) => p.status === "pending" || p.status === "approved").reduce((s: number, r: any) => s + (r.amount_ore || 0), 0);
    const available = earned - paid - reserved;
    if (data.amountOre > available) throw new Error(`Tillgängligt är ${(available / 100).toFixed(2)} kr.`);

    const { data: inserted, error } = await supabaseAdmin
      .from("payout_requests")
      .insert({
        team_id: teamId,
        amount_ore: data.amountOre,
        recipient: data.recipient,
        status: "pending",
        requested_by: context.userId,
      })
      .select("id").single();
    if (error) throw new Error(error.message);
    return { id: (inserted as any).id };
  });

// ---------- Admin ----------

export const adminListPayoutRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("payout_requests")
      .select("id, team_id, amount_ore, recipient, status, note, requested_by, created_at, handled_at, handled_by")
      .order("created_at", { ascending: false })
      .limit(200);

    const teamIds = Array.from(new Set((rows ?? []).map((r: any) => r.team_id)));
    const { data: teams } = await supabaseAdmin
      .from("teams").select("id, name, created_by_user_id").in("id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]);
    const teamById: Record<string, any> = {};
    (teams ?? []).forEach((t: any) => { teamById[t.id] = t; });

    // Compute earned/available per team
    const finance: Record<string, { earned: number; paid: number; reserved: number }> = {};
    for (const tid of teamIds) {
      const { data: eRows } = await supabaseAdmin.from("purchases")
        .select("team_share_ore").eq("team_id", tid).eq("status", "paid");
      const earned = (eRows ?? []).reduce((s: number, r: any) => s + (r.team_share_ore || 0), 0);
      const teamPayouts = (rows ?? []).filter((r: any) => r.team_id === tid);
      const paid = teamPayouts.filter((r: any) => r.status === "paid").reduce((s: number, r: any) => s + r.amount_ore, 0);
      const reserved = teamPayouts.filter((r: any) => r.status === "pending" || r.status === "approved").reduce((s: number, r: any) => s + r.amount_ore, 0);
      finance[tid] = { earned, paid, reserved };
    }

    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        team_name: teamById[r.team_id]?.name ?? "—",
        team_created_by: teamById[r.team_id]?.created_by_user_id ?? null,
        earned_ore: finance[r.team_id]?.earned ?? 0,
        paid_ore: finance[r.team_id]?.paid ?? 0,
        available_ore: Math.max(0, (finance[r.team_id]?.earned ?? 0) - (finance[r.team_id]?.paid ?? 0) - (finance[r.team_id]?.reserved ?? 0)),
      })),
    };
  });

const StatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "paid", "rejected"]),
  note: z.string().trim().max(1000).optional(),
});

export const adminUpdatePayoutStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.status === "rejected" && !data.note) {
      throw new Error("Notering krävs vid avslag.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("payout_requests").select("id, team_id, amount_ore, status, recipient").eq("id", data.id).single();
    if (!existing) throw new Error("Förfrågan hittades inte.");

    const { error } = await supabaseAdmin
      .from("payout_requests")
      .update({
        status: data.status,
        note: data.note ?? null,
        handled_by: context.userId,
        handled_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Look up team leader email
    const { data: team } = await supabaseAdmin
      .from("teams").select("id, name, created_by_user_id").eq("id", (existing as any).team_id).single();
    let leaderEmail: string | null = null;
    let leaderName: string | null = null;
    if (team && (team as any).created_by_user_id) {
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("email, name").eq("user_id", (team as any).created_by_user_id).maybeSingle();
      leaderEmail = (prof as any)?.email ?? null;
      leaderName = (prof as any)?.name ?? null;
    }

    // Log
    await supabaseAdmin.from("admin_activity").insert({
      user_id: context.userId,
      action: `payout_${data.status}`,
      detail: { payout_id: data.id, team_id: (existing as any).team_id, amount_ore: (existing as any).amount_ore, note: data.note ?? null },
    });

    // Email leader
    if (leaderEmail) {
      const { sendEmail } = await import("@/lib/email/resend.server");
      const amountKr = ((existing as any).amount_ore / 100).toLocaleString("sv-SE");
      const label = data.status === "approved" ? "godkänd"
        : data.status === "paid" ? "utbetald"
        : "avslagen";
      const subject = `Utbetalning ${label} – ${(team as any)?.name ?? "ditt lag"}`;
      const html = `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="background:#0d3b28;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;font-size:20px;">Utbetalning ${label}</h1>
        </div>
        <div style="background:#f7f5ef;padding:24px;border-radius:0 0 12px 12px;">
          <p>Hej ${leaderName ?? ""},</p>
          <p>Er utbetalningsförfrågan för <strong>${(team as any)?.name ?? "laget"}</strong> på
          <strong>${amountKr} kr</strong> är nu <strong>${label}</strong>.</p>
          ${data.note ? `<p><em>Notering från admin:</em> ${data.note}</p>` : ""}
          <p style="color:#456;">Hälsningar,<br/>SmartKlimat</p>
        </div>
      </div>`;
      await sendEmail({ to: leaderEmail, subject, html });
    }

    return { ok: true };
  });

// ---------- Settings ----------

export const getTeamSharePrice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("app_settings").select("team_share_ore_per_tree").eq("id", 1).maybeSingle();
    return { orePerTree: (data as any)?.team_share_ore_per_tree ?? 0 };
  });

export const setTeamSharePrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orePerTree: z.number().int().min(0).max(100000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .update({ team_share_ore_per_tree: data.orePerTree, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("admin_activity").insert({
      user_id: context.userId, action: "team_share_price_updated", detail: { ore_per_tree: data.orePerTree },
    });
    return { ok: true };
  });
