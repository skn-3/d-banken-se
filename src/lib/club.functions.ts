import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyClub = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any).rpc("get_my_club");
    if (error) throw new Error(error.message);
    return data as { lov: number; trees: number; claims: Array<{ id: string; deal_id: string; code_issued: string; created_at: string; title: string; partner_name: string }> };
  });

export const listActiveDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("partner_deals")
      .select("id, title, partner_name, description, lov_cost, stock, active, sort")
      .eq("active", true)
      .order("sort", { ascending: true })
      .order("lov_cost", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listActiveCompetitions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("competitions")
      .select("id, title, description, end_date, active")
      .eq("active", true)
      .order("end_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const claimDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { deal_id: string }) => data)
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (context.supabase as any).rpc("claim_deal", { _deal_id: data.deal_id });
    if (error) throw new Error(error.message);
    return row as { id: string; code_issued: string; deal_id: string; lov_cost: number };
  });

// ============ ADMIN ============
async function assertAdmin(supabase: unknown, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const adminListDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("partner_deals").select("*").order("sort").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    id?: string; title: string; partner_name: string; description: string;
    lov_cost: number; code_type: "static" | "unique"; code_static?: string;
    code_unique_list?: string; stock: number | null; active: boolean; sort: number;
  }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const code_data = data.code_type === "static"
      ? { code: data.code_static ?? "" }
      : { codes: (data.code_unique_list ?? "").split(/\r?\n/).map(s => s.trim()).filter(Boolean) };
    const row = {
      title: data.title, partner_name: data.partner_name, description: data.description,
      lov_cost: data.lov_cost, code_type: data.code_type, code_data,
      stock: data.stock, active: data.active, sort: data.sort,
    };
    if (data.id) {
      const { error } = await context.supabase.from("partner_deals").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("partner_deals").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const adminDeleteDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("partner_deals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("deal_claims")
      .select("id, created_at, code_issued, lov_cost, deal_id, user_id, partner_deals(title, partner_name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminListCompetitions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("competitions").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertCompetition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: string; title: string; description: string; end_date: string | null; active: boolean }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.id) {
      const { error } = await context.supabase.from("competitions").update({
        title: data.title, description: data.description, end_date: data.end_date, active: data.active,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("competitions").insert({
      title: data.title, description: data.description, end_date: data.end_date, active: data.active,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const adminDeleteCompetition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("competitions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
