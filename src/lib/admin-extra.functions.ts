import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

async function logActivity(userId: string, action: string, detail: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabaseAdmin as any).from("admin_activity").insert({ user_id: userId, action, detail });
}

// ---- 1) Activity log listing ------------------------------------------

export const adminListActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      action: z.string().trim().max(80).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).partial().parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (supabaseAdmin as any).from("admin_activity")
      .select("id, user_id, action, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.action && data.action.trim()) q = q.eq("action", data.action.trim());
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) {
      const d = new Date(data.to); d.setDate(d.getDate() + 1);
      q = q.lt("created_at", d.toISOString());
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((rows ?? []).map((r: { user_id: string | null }) => r.user_id).filter(Boolean))) as string[];
    let profileMap: Record<string, { name: string | null; email: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin.from("profiles")
        .select("user_id, name, email").in("user_id", userIds);
      profileMap = Object.fromEntries((profs ?? []).map((p) => [p.user_id, { name: p.name, email: p.email }]));
    }

    // Distinct action list for filter dropdown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: distinctRows } = await (supabaseAdmin as any).from("admin_activity")
      .select("action").order("created_at", { ascending: false }).limit(500);
    const actions = Array.from(new Set((distinctRows ?? []).map((r: { action: string }) => r.action))).sort() as string[];

    return {
      rows: (rows ?? []).map((r: { id: string; user_id: string | null; action: string; detail: unknown; created_at: string }) => ({
        id: r.id,
        user_id: r.user_id,
        admin_name: r.user_id ? (profileMap[r.user_id]?.name ?? profileMap[r.user_id]?.email ?? r.user_id.slice(0, 8)) : "system",
        admin_email: r.user_id ? profileMap[r.user_id]?.email ?? null : null,
        action: r.action,
        detail: r.detail,
        created_at: r.created_at,
      })),
      actions,
    };
  });

// ---- 2) Economy settings ----------------------------------------------

export const adminGetEconomySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("app_settings")
      .select("team_share_ore_per_tree, reward_budget_ore_per_tree").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return {
      team_share_ore_per_tree: data?.team_share_ore_per_tree ?? 0,
      reward_budget_ore_per_tree: data?.reward_budget_ore_per_tree ?? 0,
    };
  });

export const adminUpdateEconomySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      team_share_ore_per_tree: z.number().int().min(0).max(1000000),
      reward_budget_ore_per_tree: z.number().int().min(0).max(1000000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("app_settings")
      .select("team_share_ore_per_tree, reward_budget_ore_per_tree").eq("id", 1).maybeSingle();
    const { error } = await supabaseAdmin.from("app_settings").update({
      team_share_ore_per_tree: data.team_share_ore_per_tree,
      reward_budget_ore_per_tree: data.reward_budget_ore_per_tree,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) throw new Error(error.message);
    await logActivity(context.userId, "economy_settings_updated", {
      before: before ?? null, after: data,
    });
    return { ok: true };
  });

// ---- 3) CSV export of purchases ---------------------------------------

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const adminExportPurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (supabaseAdmin as any).from("purchases")
      .select("id, created_at, paid_at, recipient_name, recipient_email, customer_id, tree_count, total_amount_ore, status, source, theme_id, team_id")
      .order("created_at", { ascending: false })
      .limit(50000);
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) {
      const d = new Date(data.to); d.setDate(d.getDate() + 1);
      q = q.lt("created_at", d.toISOString());
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const customerIds = Array.from(new Set((rows ?? []).map((r: { customer_id: string | null }) => r.customer_id).filter(Boolean))) as string[];
    const teamIds = Array.from(new Set((rows ?? []).map((r: { team_id: string | null }) => r.team_id).filter(Boolean))) as string[];
    const themeIds = Array.from(new Set((rows ?? []).map((r: { theme_id: string | null }) => r.theme_id).filter(Boolean))) as string[];

    const [cust, teams, themes] = await Promise.all([
      customerIds.length ? supabaseAdmin.from("customers").select("id, name, email").in("id", customerIds) : Promise.resolve({ data: [] }),
      teamIds.length ? supabaseAdmin.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      themeIds.length ? (supabaseAdmin as any).from("greeting_themes").select("id, name").in("id", themeIds) : Promise.resolve({ data: [] }),
    ]);
    const custMap = Object.fromEntries(((cust.data as { id: string; name: string | null; email: string | null }[]) ?? []).map((c) => [c.id, c]));
    const teamMap = Object.fromEntries(((teams.data as { id: string; name: string }[]) ?? []).map((t) => [t.id, t]));
    const themeMap = Object.fromEntries(((themes.data as { id: string; name: string }[]) ?? []).map((t) => [t.id, t]));

    const header = ["datum","order_id","kund","email","antal_trad","belopp_kr","betalstatus","tema","lag","kalla"];
    const lines: string[] = [header.join(";")];
    for (const r of (rows ?? []) as Array<{ id: string; created_at: string; paid_at: string | null; recipient_name: string | null; recipient_email: string | null; customer_id: string | null; tree_count: number; total_amount_ore: number; status: string; source: string | null; theme_id: string | null; team_id: string | null }>) {
      const c = r.customer_id ? custMap[r.customer_id] : null;
      const name = c?.name ?? r.recipient_name ?? "";
      const email = c?.email ?? r.recipient_email ?? "";
      const dt = r.paid_at ?? r.created_at;
      const belopp = (r.total_amount_ore / 100).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      lines.push([
        csvEscape(new Date(dt).toLocaleString("sv-SE")),
        csvEscape(r.id),
        csvEscape(name),
        csvEscape(email),
        csvEscape(r.tree_count),
        csvEscape(belopp),
        csvEscape(r.status),
        csvEscape(r.theme_id ? themeMap[r.theme_id]?.name ?? "" : ""),
        csvEscape(r.team_id ? teamMap[r.team_id]?.name ?? "" : ""),
        csvEscape(r.source ?? ""),
      ].join(";"));
    }
    const csv = "\uFEFF" + lines.join("\r\n");
    await logActivity(context.userId, "purchases_exported", {
      from: data.from ?? null, to: data.to ?? null, rows: (rows ?? []).length,
    });
    return { csv, count: (rows ?? []).length };
  });

// ---- 4) Change team leader --------------------------------------------

export const adminChangeTeamLeader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      teamId: z.string().uuid(),
      newUserId: z.string().uuid().optional(),
      newEmail: z.string().email().optional(),
    }).refine((v) => !!v.newUserId || !!v.newEmail, { message: "Ange användare eller e-post" }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams").select("id, name, created_by_user_id, organization_id").eq("id", data.teamId).maybeSingle();
    if (teamErr) throw new Error(teamErr.message);
    if (!team) throw new Error("Lag saknas");

    // Resolve new leader user_id
    let newUserId = data.newUserId ?? null;
    if (!newUserId && data.newEmail) {
      const { data: prof } = await supabaseAdmin.from("profiles")
        .select("user_id").eq("email", data.newEmail.toLowerCase()).maybeSingle();
      if (!prof) throw new Error("Ingen användare med den e-postadressen hittades. Bjud in personen först.");
      newUserId = prof.user_id;
    }
    if (!newUserId) throw new Error("Kunde inte lösa ny lagledare");
    if (newUserId === team.created_by_user_id) throw new Error("Personen är redan lagledare");

    const oldUserId = team.created_by_user_id;

    // Ensure new user is a team member; upsert role=team_leader
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabaseAdmin as any;
    const { data: existing } = await sb.from("team_members")
      .select("id, role").eq("team_id", data.teamId).eq("user_id", newUserId).maybeSingle();
    if (existing) {
      await sb.from("team_members").update({ role: "team_leader" }).eq("id", existing.id);
    } else {
      await sb.from("team_members").insert({ team_id: data.teamId, user_id: newUserId, role: "team_leader" });
    }

    // Demote old leader to seller (if a membership row exists)
    if (oldUserId) {
      await sb.from("team_members").update({ role: "seller" })
        .eq("team_id", data.teamId).eq("user_id", oldUserId);
    }

    // Update teams.created_by_user_id (source of truth for payout panel / captain views)
    const { error: updErr } = await sb.from("teams")
      .update({ created_by_user_id: newUserId }).eq("id", data.teamId);
    if (updErr) throw new Error(updErr.message);

    // Fetch emails/names
    const ids = [newUserId, oldUserId].filter(Boolean) as string[];
    const { data: profs } = await supabaseAdmin.from("profiles")
      .select("user_id, name, email").in("user_id", ids);
    const map = Object.fromEntries((profs ?? []).map((p) => [p.user_id, p]));
    const newProf = map[newUserId];
    const oldProf = oldUserId ? map[oldUserId] : null;

    // Send emails (best-effort)
    let mailNew: { ok: boolean; error?: string } = { ok: false };
    let mailOld: { ok: boolean; error?: string } = { ok: false };
    try {
      const { sendEmail } = await import("@/lib/email/resend.server");
      if (newProf?.email) {
        const r = await sendEmail({
          to: newProf.email,
          subject: `Du är nu lagledare för ${team.name}`,
          html: `<p>Hej ${newProf.name ?? ""},</p><p>Du har utsetts till lagledare för <strong>${team.name}</strong> i SmartKlimat. Du hittar kaptensvyn och utbetalningspanelen i appen.</p><p>— SmartKlimat</p>`,
          from: "SmartKlimat <konto@smartklimat.org>",
        });
        mailNew = { ok: r.ok, error: r.error };
      }
      if (oldProf?.email) {
        const r = await sendEmail({
          to: oldProf.email,
          subject: `Ny lagledare för ${team.name}`,
          html: `<p>Hej ${oldProf.name ?? ""},</p><p>Rollen som lagledare för <strong>${team.name}</strong> har flyttats till ${newProf?.name ?? newProf?.email ?? "en annan medlem"}. Du är fortsatt medlem i laget.</p><p>— SmartKlimat</p>`,
          from: "SmartKlimat <konto@smartklimat.org>",
        });
        mailOld = { ok: r.ok, error: r.error };
      }
    } catch (e) {
      mailNew = { ok: false, error: (e as Error).message };
    }

    await logActivity(context.userId, "team_leader_changed", {
      team_id: data.teamId, team_name: team.name,
      old_user_id: oldUserId, old_email: oldProf?.email ?? null,
      new_user_id: newUserId, new_email: newProf?.email ?? null,
      mail_new: mailNew, mail_old: mailOld,
    });

    return {
      ok: true,
      new_leader: { user_id: newUserId, name: newProf?.name ?? null, email: newProf?.email ?? null },
      old_leader: oldUserId ? { user_id: oldUserId, name: oldProf?.name ?? null, email: oldProf?.email ?? null } : null,
      mail_new: mailNew, mail_old: mailOld,
    };
  });

// ---- 5) Deliver scheduled gift now (admin manual push) ----------------

export const adminDeliverGiftNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ certificateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { renderThanksEmail, sendEmail } = await import("@/lib/email/resend.server");

    // Lease: sätt status='delivering' bara om raden fortfarande är 'scheduled'.
    const { data: leased, error: leaseErr } = await supabaseAdmin
      .from("certificates")
      .update({ status: "delivering" })
      .eq("id", data.certificateId)
      .eq("status", "scheduled")
      .select("id, verification_id, recipient_name, tree_count, location_name, greeting, deliver_at, recipient_delivery_email, buyer_name_snapshot, purchase_id")
      .maybeSingle();
    if (leaseErr) throw new Error(leaseErr.message);
    if (!leased) throw new Error("not_scheduled");

    const to = String(leased.recipient_delivery_email ?? "").trim();
    if (!to) {
      await supabaseAdmin.from("certificates").update({ status: "scheduled" }).eq("id", leased.id).eq("status", "delivering");
      throw new Error("missing_recipient_delivery_email");
    }

    let heroImageUrl: string | null = null;
    if (leased.purchase_id) {
      const { data: pur } = await supabaseAdmin
        .from("purchases").select("theme_id").eq("id", leased.purchase_id).maybeSingle();
      if (pur?.theme_id) {
        const { data: th } = await supabaseAdmin
          .from("greeting_themes").select("config").eq("id", pur.theme_id).maybeSingle();
        const kort = (th?.config as { kort?: string } | null)?.kort;
        if (kort) heroImageUrl = kort.startsWith("http") ? kort : `https://app.smartklimat.org${kort}`;
      }
    }

    const dateText = new Date().toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
    const { subject, html } = renderThanksEmail({
      recipientName: leased.recipient_name as string,
      recipientEmail: to,
      treeCount: Number(leased.tree_count ?? 0),
      totalKr: "",
      dateText,
      verificationId: leased.verification_id as string,
      verifyUrl: `https://app.smartklimat.org/v/${leased.verification_id}`,
      locationName: (leased.location_name as string | null) ?? null,
      giftMessage: (leased.greeting as string | null) ?? null,
      giftFromName: (leased.buyer_name_snapshot as string | null) ?? null,
      heroImageUrl,
    });
    try {
      const ok = await sendEmail({ to, subject, html });
      if (!ok) throw new Error("send_failed");
    } catch (e) {
      await supabaseAdmin.from("certificates").update({ status: "scheduled" }).eq("id", leased.id).eq("status", "delivering");
      throw e;
    }

    await supabaseAdmin.from("certificates")
      .update({ status: "delivered", delivered_at: new Date().toISOString() })
      .eq("id", leased.id).eq("status", "delivering");

    await logActivity(context.userId, "gift_delivered_manual", {
      certificate_id: leased.id, verification_id: leased.verification_id,
      recipient_delivery_email: to,
    });
    return { ok: true };
  });

// ---- 6) Failed purchases (DRIFT-1) ------------------------------------

const PRICE_PER_TREE_ORE = 3500;

export const adminListFailedPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin as any).from("failed_purchases")
      .select("id, session_id, error, event_type, resolved, resolved_at, alert_sent_at, attempts, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ id: string; session_id: string; error: string; event_type: string | null; resolved: boolean; resolved_at: string | null; alert_sent_at: string | null; attempts: number; created_at: string; updated_at: string }>;
    return {
      rows,
      unresolved_count: rows.filter((r) => !r.resolved).length,
    };
  });

export const adminCountFailedPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count, error } = await (supabaseAdmin as any).from("failed_purchases")
      .select("id", { count: "exact", head: true }).eq("resolved", false);
    if (error) throw new Error(error.message);
    return { count: (count as number) ?? 0 };
  });

async function stripeFetch(path: string): Promise<any> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY saknas i server-env");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`stripe_${res.status}: ${(body as { error?: { message?: string } })?.error?.message ?? "unknown"}`);
  return body;
}

async function retryCheckoutSession(sessionId: string): Promise<{ verification_id: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const session = await stripeFetch(`checkout/sessions/${sessionId}?expand[]=customer_details&expand[]=custom_fields`);
  const md = (session.metadata ?? {}) as Record<string, string>;
  const type = String(md.type ?? "");
  const quantity = Math.max(1, Math.floor(Number(md.quantity ?? 0)));
  if (!quantity) throw new Error("missing_quantity");
  const custEmail = String(session.customer_details?.email ?? session.customer_email ?? "").trim().toLowerCase();
  const buyerName = String(session.customer_details?.name ?? "").trim();
  let recipientName = buyerName || "Privatperson";
  let greeting = String(md.halsning ?? "").trim();
  const themeId = String(md.theme_id ?? "").trim() || null;
  if (type === "gava") {
    for (const f of (session.custom_fields ?? [])) {
      if (f.key === "recipient_name") recipientName = String(f.text?.value ?? "").trim() || recipientName;
      if (f.key === "greeting" && !greeting) greeting = String(f.text?.value ?? "").trim();
    }
  }
  if (greeting.length > 120) greeting = greeting.slice(0, 120);
  if (!custEmail) throw new Error("missing_email");

  const orderRef = `stripe:${session.id}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseAdmin as any;
  const existing = await sb.from("purchases").select("id, certificates(verification_id)").eq("source_order_ref", orderRef).maybeSingle();
  if (existing.data) {
    const vid = existing.data.certificates?.[0]?.verification_id ?? null;
    if (vid) return { verification_id: vid };
    // Certifikatet saknas — kör generate_certificate
    const gen = await sb.rpc("generate_certificate", { _purchase_id: existing.data.id });
    if (gen.error) throw new Error("certificate: " + gen.error.message);
    return { verification_id: (gen.data as { verification_id?: string })?.verification_id ?? null };
  }

  let customerId: string;
  const ec = await sb.from("customers").select("id").eq("email", custEmail).maybeSingle();
  if (ec.data) customerId = ec.data.id;
  else {
    const ins = await sb.from("customers").insert({ email: custEmail, name: recipientName }).select("id").single();
    if (ins.error) throw new Error("customer_insert: " + ins.error.message);
    customerId = ins.data.id;
  }
  const total = quantity * PRICE_PER_TREE_ORE;
  const pur = await sb.from("purchases").insert({
    user_id: null, customer_id: customerId,
    recipient_name: recipientName, recipient_email: custEmail,
    tree_count: quantity, unit_price_ore: PRICE_PER_TREE_ORE, total_amount_ore: total,
    status: "paid", paid_at: new Date().toISOString(),
    source: (type === "gava" ? "gift" : type === "manad" ? "monthly" : "web"), source_order_ref: orderRef,
    theme_id: themeId, greeting: greeting || null,
  }).select("id").single();
  if (pur.error) throw new Error("purchase_insert: " + pur.error.message);
  const gen = await sb.rpc("generate_certificate", { _purchase_id: pur.data.id });
  if (gen.error) throw new Error("certificate: " + gen.error.message);
  return { verification_id: (gen.data as { verification_id?: string })?.verification_id ?? null };
}

async function retryInvoice(invoiceId: string): Promise<{ verification_id: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const invoice = await stripeFetch(`invoices/${invoiceId}`);
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subId) throw new Error("missing_subscription");
  const sub = await stripeFetch(`subscriptions/${subId}`);
  const quantity = Math.max(1, Math.floor(Number(sub.items?.data?.[0]?.quantity ?? 0)));
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const cust = customerId ? await stripeFetch(`customers/${customerId}`) : null;
  const custEmail = String(cust?.email ?? invoice.customer_email ?? "").trim().toLowerCase();
  const recipientName = String(cust?.name ?? "").trim() || "Privatperson";
  if (!custEmail) throw new Error("missing_email");
  const orderRef = `stripe:invoice:${invoice.id}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseAdmin as any;
  const existing = await sb.from("purchases").select("id").eq("source_order_ref", orderRef).maybeSingle();
  if (existing.data) {
    const gen = await sb.rpc("generate_certificate", { _purchase_id: existing.data.id });
    if (gen.error) throw new Error("certificate: " + gen.error.message);
    return { verification_id: (gen.data as { verification_id?: string })?.verification_id ?? null };
  }
  let dbCustomerId: string;
  const ec = await sb.from("customers").select("id").eq("email", custEmail).maybeSingle();
  if (ec.data) dbCustomerId = ec.data.id;
  else {
    const ins = await sb.from("customers").insert({ email: custEmail, name: recipientName }).select("id").single();
    if (ins.error) throw new Error("customer_insert: " + ins.error.message);
    dbCustomerId = ins.data.id;
  }
  const total = quantity * PRICE_PER_TREE_ORE;
  const pur = await sb.from("purchases").insert({
    user_id: null, customer_id: dbCustomerId,
    recipient_name: recipientName, recipient_email: custEmail,
    tree_count: quantity, unit_price_ore: PRICE_PER_TREE_ORE, total_amount_ore: total,
    status: "paid", paid_at: new Date().toISOString(),
    source: "monthly", source_order_ref: orderRef,
  }).select("id").single();
  if (pur.error) throw new Error("purchase_insert: " + pur.error.message);
  const gen = await sb.rpc("generate_certificate", { _purchase_id: pur.data.id });
  if (gen.error) throw new Error("certificate: " + gen.error.message);
  return { verification_id: (gen.data as { verification_id?: string })?.verification_id ?? null };
}

export const adminRetryFailedPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabaseAdmin as any;
    const { data: row, error: rowErr } = await sb.from("failed_purchases")
      .select("id, session_id, resolved").eq("id", data.id).maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) throw new Error("not_found");
    if (row.resolved) return { ok: true, already_resolved: true, verification_id: null };

    const sessionId: string = row.session_id;
    let result: { verification_id: string | null };
    try {
      if (sessionId.startsWith("invoice:")) {
        result = await retryInvoice(sessionId.slice("invoice:".length));
      } else {
        result = await retryCheckoutSession(sessionId);
      }
    } catch (e) {
      const msg = (e as Error).message;
      await sb.from("failed_purchases").update({
        error: `retry: ${msg}`,
        attempts: sb.rpc ? undefined : undefined,
        updated_at: new Date().toISOString(),
      }).eq("id", data.id);
      await logActivity(context.userId, "failed_purchase_retry_failed", { id: data.id, session_id: sessionId, error: msg });
      throw new Error(msg);
    }

    await sb.from("failed_purchases").update({
      resolved: true, resolved_at: new Date().toISOString(), resolved_by: context.userId,
      updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    await logActivity(context.userId, "failed_purchase_resolved", {
      id: data.id, session_id: sessionId, verification_id: result.verification_id,
    });
    return { ok: true, verification_id: result.verification_id };
  });

