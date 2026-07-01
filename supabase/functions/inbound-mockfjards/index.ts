import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INBOUND_SECRET = Deno.env.get("SMARTKLIMAT_INBOUND_SECRET") ?? "";
const APP_PUBLIC_URL = (Deno.env.get("APP_PUBLIC_URL") ?? "").replace(/\/+$/, "");
const PRICE_PER_TREE_ORE = 3500;
const MOCKFJARDS_ORG = "Mockfjärds Fönster";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < ab.length; i++) out |= ab[i] ^ bb[i];
  return out === 0;
}
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, reason: "method_not_allowed" });

  const provided = req.headers.get("x-gateway-secret") ?? "";
  if (!INBOUND_SECRET || !timingSafeEqual(provided, INBOUND_SECRET))
    return json(401, { ok: false, reason: "unauthorized" });

  let p: any;
  try { p = await req.json(); } catch { return json(400, { ok: false, reason: "invalid_json" }); }

  const sellerEmail = String(p?.seller_email ?? "").trim().toLowerCase();
  const c = p?.customer ?? {};
  const custName = String(c?.name ?? "").trim();
  const custEmail = String(c?.email ?? "").trim().toLowerCase();
  const orderRef = String(p?.mockfjards_order_number ?? "").trim();

  let treeCount = Math.floor(Number(p?.tree_count ?? 0));
  if (!treeCount && p?.units) {
    const u = p.units;
    treeCount = Math.floor(Number(u?.windows ?? 0) + Number(u?.doors ?? 0) + Number(u?.roof_windows ?? 0));
  }

  if (!sellerEmail) return json(400, { ok: false, reason: "missing_seller_email" });
  if (!custName || !custEmail) return json(400, { ok: false, reason: "missing_customer" });
  if (!orderRef) return json(400, { ok: false, reason: "missing_order_number" });
  if (!(treeCount >= 1)) return json(400, { ok: false, reason: "tree_count_must_be_at_least_1" });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const verifyUrl = (vid: string) => APP_PUBLIC_URL ? `${APP_PUBLIC_URL}/v/${vid}` : null;

  // 1) Idempotens
  const existing = await db.from("purchases").select("id").eq("source_order_ref", orderRef).maybeSingle();
  if (existing.data) {
    const cert = await db.from("certificates").select("verification_id").eq("purchase_id", existing.data.id).maybeSingle();
    const vid = cert.data?.verification_id ?? null;
    return json(200, { ok: true, idempotent: true, verification_id: vid, verify_url: vid ? verifyUrl(vid) : null });
  }

  // 2) Hitta säljaren via mejl + verifiera Mockfjärds-medlemskap
  const prof = await db.from("profiles").select("user_id").eq("email", sellerEmail).maybeSingle();
  if (!prof.data?.user_id) return json(404, { ok: false, reason: "seller_not_found", seller_email: sellerEmail });
  const sellerUserId = prof.data.user_id;

  const mem = await db.from("team_members").select("team_id").eq("user_id", sellerUserId);
  const teamIds = (mem.data ?? []).map((m: any) => m.team_id);
  let inMockfjards = false;
  if (teamIds.length) {
    const tms = await db.from("teams").select("organization_id").in("id", teamIds);
    const orgIds = [...new Set((tms.data ?? []).map((t: any) => t.organization_id))];
    if (orgIds.length) {
      const orgs = await db.from("organizations").select("id").in("id", orgIds).eq("name", MOCKFJARDS_ORG);
      inMockfjards = (orgs.data ?? []).length > 0;
    }
  }
  if (!inMockfjards) return json(403, { ok: false, reason: "seller_not_in_mockfjards", seller_email: sellerEmail });

  // 3) Upsert kund via mejl
  let customerId: string;
  const ec = await db.from("customers").select("id, name").eq("email", custEmail).maybeSingle();
  if (ec.data) {
    customerId = ec.data.id;
    if (ec.data.name !== custName)
      await db.from("customers").update({ name: custName, updated_at: new Date().toISOString() }).eq("id", customerId);
  } else {
    const ins = await db.from("customers").insert({ email: custEmail, name: custName }).select("id").single();
    if (ins.error) return json(500, { ok: false, reason: "customer_insert_failed", detail: ins.error.message });
    customerId = ins.data.id;
  }

  // 4) Skapa purchase (idempotent på source_order_ref)
  const total = treeCount * PRICE_PER_TREE_ORE;
  const pur = await db.from("purchases").insert({
    user_id: null, customer_id: customerId,
    recipient_name: custName, recipient_email: custEmail,
    tree_count: treeCount, unit_price_ore: PRICE_PER_TREE_ORE, total_amount_ore: total,
    status: "paid", paid_at: new Date().toISOString(),
    registered_by_user_id: sellerUserId, source: "mockfjards", source_order_ref: orderRef,
  }).select("id").single();

  if (pur.error) {
    if ((pur.error as any).code === "23505") {
      const ex2 = await db.from("purchases").select("id").eq("source_order_ref", orderRef).maybeSingle();
      const cert = ex2.data ? await db.from("certificates").select("verification_id").eq("purchase_id", ex2.data.id).maybeSingle() : { data: null } as any;
      const vid = cert.data?.verification_id ?? null;
      return json(200, { ok: true, idempotent: true, verification_id: vid, verify_url: vid ? verifyUrl(vid) : null });
    }
    return json(500, { ok: false, reason: "purchase_insert_failed", detail: pur.error.message });
  }

  // 5) Generera värdebeviset (service-role tillåts av RPC:n)
  const gen = await db.rpc("generate_certificate", { _purchase_id: pur.data.id });
  if (gen.error) return json(500, { ok: false, reason: "certificate_failed", detail: gen.error.message });
  const vid = (gen.data as any)?.verification_id ?? null;

  console.log("inbound-mockfjards ok", { orderRef, sellerEmail, treeCount, verificationId: vid });
  return json(200, { ok: true, idempotent: false, tree_count: treeCount, verification_id: vid, verify_url: vid ? verifyUrl(vid) : null });
});
