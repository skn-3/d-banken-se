import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = "https://smartklimat.org";

const corsHeaders = {
  "access-control-allow-origin": ALLOWED_ORIGIN,
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
  "access-control-max-age": "86400",
  "vary": "origin",
};

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders, ...extra },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!STRIPE_SECRET_KEY) return json(500, { error: "missing_stripe_key" });

  let p: any;
  try { p = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

  const type = String(p?.type ?? "");
  const quantity = Math.floor(Number(p?.quantity ?? 0));
  if (!["engang", "manad", "gava"].includes(type)) return json(400, { error: "invalid_type" });
  if (!(quantity >= 1 && quantity <= 500)) return json(400, { error: "invalid_quantity" });

  // Optional theme + greeting
  const rawThemeId = p?.theme_id ?? p?.themeId ?? null;
  const rawGreeting = p?.halsning ?? p?.greeting ?? null;

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let themeId: string | null = null;
  let themeSlug: string | null = null;
  if (rawThemeId !== null && rawThemeId !== "") {
    const idStr = String(rawThemeId);
    const t = await db.from("greeting_themes").select("id, slug, active").eq("id", idStr).maybeSingle();
    if (!t.data || !t.data.active) return json(400, { error: "invalid_theme_id" });
    themeId = t.data.id;
    themeSlug = t.data.slug;
  }

  let greeting: string | null = null;
  if (rawGreeting !== null && String(rawGreeting).trim() !== "") {
    const g = String(rawGreeting).trim();
    if (g.length > 120) return json(400, { error: "greeting_too_long" });
    const bl = await db.from("greeting_blocklist").select("word");
    const words = (bl.data ?? []).map((r: any) => String(r.word ?? "").toLowerCase()).filter(Boolean);
    const lc = g.toLowerCase();
    if (words.some((w) => lc.includes(w))) return json(400, { error: "greeting_blocked" });
    greeting = g;
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });

  const isSubscription = type === "manad";
  const priceData: any = {
    currency: "sek",
    unit_amount: 3500,
    product_data: { name: "Träd — SmartKlimat" },
  };
  if (isSubscription) priceData.recurring = { interval: "month" };

  const metadata: Record<string, string> = { type, quantity: String(quantity) };
  if (themeId) metadata.theme_id = themeId;
  if (greeting) metadata.halsning = greeting;

  const params: any = {
    mode: isSubscription ? "subscription" : "payment",
    line_items: [{ price_data: priceData, quantity }],
    success_url: `https://smartklimat.org/plantera?tack=1${themeSlug ? `&tema=${encodeURIComponent(themeSlug)}` : ""}`,
    cancel_url: "https://smartklimat.org/plantera",
    metadata,
  };
  if (isSubscription) params.subscription_data = { metadata };

  if (type === "gava") {
    params.custom_fields = [
      {
        key: "recipient_name",
        label: { type: "custom", custom: "Mottagarens namn" },
        type: "text",
        optional: false,
      },
    ];
    if (!greeting) {
      params.custom_fields.push({
        key: "greeting",
        label: { type: "custom", custom: "Hälsning" },
        type: "text",
        optional: true,
      });
    }
  }

  try {
    const session = await stripe.checkout.sessions.create(params);
    return json(200, { url: session.url });
  } catch (e) {
    console.error("create-checkout error", e);
    return json(500, { error: "stripe_error", detail: (e as Error).message });
  }
});
