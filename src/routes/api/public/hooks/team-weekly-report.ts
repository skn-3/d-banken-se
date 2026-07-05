// Cron-driven: leader weekly report ("LAGETS VECKA").
// Called by pg_cron every Monday 07:30 Europe/Stockholm.
// Route is under /api/public/* so no auth gate at the edge; we still keep the
// side-effect scoped and the request body is ignored.
import { createFileRoute } from "@tanstack/react-router";
import { renderLeaderWeeklyReport, unsubscribeUrlFor } from "@/lib/email/leader-weekly-report.server";

const REPORT_FROM = "SmartKlimat <uppdateringar@send.smartklimat.org>";

/* ---------------- date helpers (Europe/Stockholm) ---------------- */
const STHLM = "Europe/Stockholm";
const DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function sthlmYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STHLM, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function sthlmDow(d: Date): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: STHLM, weekday: "short" }).format(d);
  return DOW[s] ?? 1;
}
function addDays(ymd: string, delta: number): string {
  // Use noon UTC to avoid DST edge cases when re-formatting.
  const base = new Date(`${ymd}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}
function isoWeekLabel(ymd: string): string {
  // "V. 27 · 30 jun – 6 jul"
  const start = new Date(`${ymd}T12:00:00Z`);
  const jan4 = new Date(Date.UTC(start.getUTCFullYear(), 0, 4));
  const daysDiff = Math.floor((start.getTime() - jan4.getTime()) / 86400000);
  const week = 1 + Math.floor((daysDiff + ((jan4.getUTCDay() + 6) % 7)) / 7);
  const end = new Date(`${addDays(ymd, 6)}T12:00:00Z`);
  const fmt = (d: Date) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", timeZone: "UTC" }).format(d).replace(".", "");
  return `V. ${week} · ${fmt(start)} – ${fmt(end)}`;
}

/* ---------------- pipeline ---------------- */
export const Route = createFileRoute("/api/public/hooks/team-weekly-report")({
  server: {
    handlers: {
      POST: async () => runReport(),
      GET: async () => runReport(), // allow manual verification
    },
  },
});

async function runReport(): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmail } = await import("@/lib/email/resend.server");
  const unsubSecret = process.env.SMARTKLIMAT_UNSUBSCRIBE_SECRET;
  if (!unsubSecret) {
    console.error("[team-weekly-report] SMARTKLIMAT_UNSUBSCRIBE_SECRET missing");
    return json({ ok: false, error: "unsub_secret_missing" }, 500);
  }

  const startedAt = Date.now();
  const now = new Date();

  // Week boundaries (Europe/Stockholm)
  const todayYmd = sthlmYmd(now);
  const todayDow = sthlmDow(now);
  const mondayThisWeek = addDays(todayYmd, -(todayDow - 1)); // Måndag i innevarande vecka
  const mondayLastWeek = addDays(mondayThisWeek, -7);
  const mondayPrevWeek = addDays(mondayThisWeek, -14);
  const sundayLastWeek = addDays(mondayThisWeek, -1);
  const cutoff28d = addDays(todayYmd, -28);

  // Fetch teams with a leader
  const { data: teams, error: teamsErr } = await supabaseAdmin
    .from("teams")
    .select("id, name, goal_trees, goal_end_date, created_by_user_id")
    .not("created_by_user_id", "is", null);
  if (teamsErr) {
    console.error("[team-weekly-report] teams query failed", teamsErr.message);
    return json({ ok: false, error: teamsErr.message }, 500);
  }
  if (!teams || teams.length === 0) return json({ ok: true, teams: 0, sent: 0 });

  const teamIds = teams.map(t => t.id);

  // team_members
  const { data: memberRows } = await supabaseAdmin
    .from("team_members")
    .select("team_id, user_id, role")
    .in("team_id", teamIds);
  const membersByTeam = new Map<string, string[]>();
  const allMemberIds = new Set<string>();
  for (const m of memberRows ?? []) {
    if (!m.user_id) continue;
    const arr = membersByTeam.get(m.team_id) ?? [];
    arr.push(m.user_id);
    membersByTeam.set(m.team_id, arr);
    allMemberIds.add(m.user_id);
  }
  const leaderIds = teams.map(t => t.created_by_user_id!).filter(Boolean);
  leaderIds.forEach(id => allMemberIds.add(id));
  if (allMemberIds.size === 0) return json({ ok: true, teams: teams.length, sent: 0, note: "no_members" });
  const allIds = Array.from(allMemberIds);

  // profiles
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, name, email")
    .in("user_id", allIds);
  const profileByUser = new Map<string, { name: string; email: string }>();
  for (const p of profiles ?? []) profileByUser.set(p.user_id, { name: p.name ?? "", email: p.email ?? "" });

  // seller_streaks
  const { data: streaks } = await supabaseAdmin
    .from("seller_streaks")
    .select("user_id, current_weeks")
    .in("user_id", allIds);
  const streakByUser = new Map<string, number>();
  for (const s of streaks ?? []) streakByUser.set(s.user_id, s.current_weeks ?? 0);

  // unclaimed rewards (per seller)
  const { data: rewardRows } = await supabaseAdmin
    .from("reward_orders")
    .select("seller_user_id")
    .eq("status", "begard")
    .in("seller_user_id", allIds);
  const rewardCountByUser = new Map<string, number>();
  for (const r of rewardRows ?? []) rewardCountByUser.set(r.seller_user_id, (rewardCountByUser.get(r.seller_user_id) ?? 0) + 1);

  // purchases — last 28 days for activity + week/prev-week aggregation
  const sinceIso = new Date(`${cutoff28d}T00:00:00Z`).toISOString();
  const { data: recentPurchases } = await supabaseAdmin
    .from("purchases")
    .select("registered_by_user_id, tree_count, paid_at, created_at")
    .in("registered_by_user_id", allIds)
    .eq("status", "paid")
    .gte("created_at", sinceIso)
    .limit(50000);

  // purchases — all-time totals for goal progress (bulk one shot)
  const { data: allPurchases } = await supabaseAdmin
    .from("purchases")
    .select("registered_by_user_id, tree_count")
    .in("registered_by_user_id", allIds)
    .eq("status", "paid")
    .limit(200000);
  const totalTreesByUser = new Map<string, number>();
  for (const p of allPurchases ?? []) {
    if (!p.registered_by_user_id) continue;
    totalTreesByUser.set(p.registered_by_user_id, (totalTreesByUser.get(p.registered_by_user_id) ?? 0) + (p.tree_count ?? 0));
  }

  // email_suppression
  const { data: sup } = await supabaseAdmin.from("email_suppression").select("email");
  const suppressed = new Set<string>();
  for (const s of sup ?? []) if (s.email) suppressed.add(String(s.email).toLowerCase());

  // Bucketize recent purchases
  type PurchaseBucket = { user_id: string; trees: number; ymd: string; ts: number };
  const buckets: PurchaseBucket[] = [];
  for (const p of recentPurchases ?? []) {
    if (!p.registered_by_user_id) continue;
    const when = new Date(p.paid_at ?? p.created_at ?? Date.now());
    buckets.push({
      user_id: p.registered_by_user_id,
      trees: p.tree_count ?? 0,
      ymd: sthlmYmd(when),
      ts: when.getTime(),
    });
  }

  const rangeLabel = isoWeekLabel(mondayLastWeek);
  let sent = 0;
  let skippedInactive = 0;
  let skippedSuppressed = 0;
  let skippedNoLeader = 0;

  for (const team of teams) {
    const members = membersByTeam.get(team.id) ?? [];
    const sellerMembers = members; // any member is counted; role gate isn't strict in this system
    if (sellerMembers.length === 0) continue;
    const memberSet = new Set(sellerMembers);

    // Team-level activity: any bucket within 28 days from a member?
    const teamRecent = buckets.filter(b => memberSet.has(b.user_id));
    if (teamRecent.length === 0) { skippedInactive++; continue; }

    // Week aggregates (last week Mon–Sun)
    const weekTotals = new Map<string, number>();
    let weekTrees = 0;
    let prevWeekTrees = 0;
    for (const b of teamRecent) {
      if (b.ymd >= mondayLastWeek && b.ymd <= sundayLastWeek) {
        weekTrees += b.trees;
        weekTotals.set(b.user_id, (weekTotals.get(b.user_id) ?? 0) + b.trees);
      } else if (b.ymd >= mondayPrevWeek && b.ymd < mondayLastWeek) {
        prevWeekTrees += b.trees;
      }
    }

    // Top 3 sellers this week
    const top3 = Array.from(weekTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([uid, trees]) => {
        const p = profileByUser.get(uid);
        const first = (p?.name ?? "").trim().split(/\s+/)[0] || "Säljare";
        return { firstName: first, trees };
      });

    // Streaks at risk: current_weeks >= 2 AND no sale in current ISO week (mondayThisWeek onwards)
    const soldThisWeek = new Set<string>();
    for (const b of teamRecent) if (b.ymd >= mondayThisWeek) soldThisWeek.add(b.user_id);
    const streakAtRisk = sellerMembers
      .map(uid => ({ uid, weeks: streakByUser.get(uid) ?? 0 }))
      .filter(x => x.weeks >= 2 && !soldThisWeek.has(x.uid))
      .sort((a, b) => b.weeks - a.weeks)
      .map(x => {
        const p = profileByUser.get(x.uid);
        const first = (p?.name ?? "").trim().split(/\s+/)[0] || "Säljare";
        return { firstName: first, weeks: x.weeks };
      });

    // Goal progress
    let goalTotalTrees = 0;
    for (const uid of sellerMembers) goalTotalTrees += totalTreesByUser.get(uid) ?? 0;

    // Unclaimed rewards for members
    let unclaimedRewards = 0;
    for (const uid of sellerMembers) unclaimedRewards += rewardCountByUser.get(uid) ?? 0;

    // Recipient = leader profile email
    const leaderProfile = team.created_by_user_id ? profileByUser.get(team.created_by_user_id) : undefined;
    const recipient = leaderProfile?.email?.trim().toLowerCase();
    if (!recipient) { skippedNoLeader++; continue; }
    if (suppressed.has(recipient)) { skippedSuppressed++; continue; }

    const leaderFirst = (leaderProfile?.name ?? "").trim().split(/\s+/)[0] || "ledare";
    const unsubscribeUrl = unsubscribeUrlFor(recipient, unsubSecret);

    const { subject, html } = renderLeaderWeeklyReport({
      leaderFirstName: leaderFirst,
      teamName: team.name,
      weekTrees,
      prevWeekTrees,
      goalTrees: team.goal_trees ?? null,
      goalTotalTrees,
      goalEndDate: team.goal_end_date ?? null,
      top3,
      streakAtRisk,
      unclaimedRewards,
      rangeLabel,
      unsubscribeUrl,
      recipientEmail: recipient,
    });

    const result = await sendEmail({ to: recipient, subject, html, from: REPORT_FROM });
    if (result.ok) sent++;
    console[result.ok ? "log" : "error"]("[team-weekly-report] send", {
      team_id: team.id,
      to: recipient,
      week_trees: weekTrees,
      prev_week_trees: prevWeekTrees,
      status: result.status,
      message_id: result.messageId,
      ok: result.ok,
      error: result.error,
    });
  }

  const summary = {
    ok: true,
    teams_scanned: teams.length,
    sent,
    skipped_inactive_28d: skippedInactive,
    skipped_no_leader_email: skippedNoLeader,
    skipped_suppressed: skippedSuppressed,
    week_range: rangeLabel,
    duration_ms: Date.now() - startedAt,
  };
  console.log("[team-weekly-report] done", summary);
  return json(summary);
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
