import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APP_URL = "https://app.smartklimat.org";

async function stripeGet(path: string): Promise<Record<string, unknown> | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

async function stripePost(path: string, form: Record<string, string>): Promise<Record<string, unknown> | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const body = new URLSearchParams(form).toString();
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

async function findStripeCustomerId(email: string): Promise<string | null> {
  const r = await stripeGet(`customers?email=${encodeURIComponent(email)}&limit=1`);
  const list = (r?.data as Array<{ id: string }> | undefined) ?? [];
  return list[0]?.id ?? null;
}

async function findActiveSubscription(customerId: string): Promise<{ id: string; nextChargeAt: number | null } | null> {
  const r = await stripeGet(`subscriptions?customer=${customerId}&status=active&limit=1`);
  const list = (r?.data as Array<{ id: string; current_period_end?: number }> | undefined) ?? [];
  const s = list[0];
  if (!s) return null;
  return { id: s.id, nextChargeAt: s.current_period_end ?? null };
}

export interface MyCertificate {
  id: string;
  verification_id: string;
  recipient_name: string;
  tree_count: number;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  issued_date: string;
  theme_slug: string | null;
  status: string | null;
  deliver_at: string | null;
  recipient_delivery_email: string | null;
}


export interface MyForestData {
  email: string;
  certificates: MyCertificate[];
  totalTrees: number;
  totalCo2Kg: number;
  firstPurchaseAt: string | null;
  subscription: { active: boolean; nextChargeAt: number | null };
}

export const getMyForest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyForestData> => {
    const email = String((context.claims as { email?: string })?.email ?? "").toLowerCase();

    // RLS "Users read own certificates" matches by user_id, customer.account_user_id,
    // customer.email, or purchase.recipient_email — so a plain SELECT returns everything
    // the user owns without extra filtering.
    const { data: certs, error } = await context.supabase
      .from("certificates")
      .select("id, verification_id, recipient_name, tree_count, location_name, latitude, longitude, issued_date, purchase_id, status, deliver_at, recipient_delivery_email")
      .order("issued_date", { ascending: false });
    if (error) throw new Error(error.message);

    const purchaseIds = Array.from(new Set((certs ?? []).map((c) => c.purchase_id).filter(Boolean))) as string[];
    const themeByPurchase = new Map<string, string | null>();
    let firstPurchaseAt: string | null = null;
    if (purchaseIds.length) {
      const { data: pur } = await context.supabase
        .from("purchases")
        .select("id, created_at, theme_id")
        .in("id", purchaseIds);
      const themeIds = Array.from(new Set((pur ?? []).map((p) => p.theme_id).filter(Boolean))) as string[];
      let slugById = new Map<string, string>();
      if (themeIds.length) {
        const { data: th } = await context.supabase
          .from("greeting_themes")
          .select("id, slug")
          .in("id", themeIds);
        slugById = new Map((th ?? []).map((t) => [t.id as string, t.slug as string]));
      }
      for (const p of pur ?? []) {
        themeByPurchase.set(p.id as string, p.theme_id ? slugById.get(p.theme_id as string) ?? null : null);
      }
      const sorted = [...(pur ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      firstPurchaseAt = sorted[0]?.created_at as string | null ?? null;
    }

    const certificates: MyCertificate[] = (certs ?? []).map((c) => ({
      id: c.id as string,
      verification_id: c.verification_id as string,
      recipient_name: c.recipient_name as string,
      tree_count: Number(c.tree_count ?? 0),
      location_name: (c.location_name as string | null) ?? null,
      latitude: c.latitude == null ? null : Number(c.latitude),
      longitude: c.longitude == null ? null : Number(c.longitude),
      issued_date: c.issued_date as string,
      theme_slug: c.purchase_id ? themeByPurchase.get(c.purchase_id as string) ?? null : null,
      status: (c as { status?: string | null }).status ?? null,
      deliver_at: (c as { deliver_at?: string | null }).deliver_at ?? null,
      recipient_delivery_email: (c as { recipient_delivery_email?: string | null }).recipient_delivery_email ?? null,
    }));


    const totalTrees = certificates.reduce((s, c) => s + c.tree_count, 0);
    const totalCo2Kg = totalTrees * 20;

    // Stripe subscription lookup (best-effort — no throw)
    let subscription = { active: false, nextChargeAt: null as number | null };
    if (email) {
      try {
        const custId = await findStripeCustomerId(email);
        if (custId) {
          const sub = await findActiveSubscription(custId);
          if (sub) subscription = { active: true, nextChargeAt: sub.nextChargeAt };
        }
      } catch (e) {
        console.error("[skog] stripe subscription check failed", (e as Error).message);
      }
    }

    return {
      email,
      certificates,
      totalTrees,
      totalCo2Kg,
      firstPurchaseAt,
      subscription,
    };
  });

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string }> => {
    const email = String((context.claims as { email?: string })?.email ?? "").toLowerCase();
    if (!email) throw new Error("no_email");
    const custId = await findStripeCustomerId(email);
    if (!custId) throw new Error("no_stripe_customer");
    const session = await stripePost("billing_portal/sessions", {
      customer: custId,
      return_url: `${APP_URL}/skog`,
    });
    const url = (session?.url as string | undefined) ?? null;
    if (!url) throw new Error("portal_session_failed");
    return { url };
  });
