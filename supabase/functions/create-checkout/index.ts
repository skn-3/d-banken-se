import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
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

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });

  const isSubscription = type === "manad";
  const priceData: any = {
    currency: "sek",
    unit_amount: 3500,
    product_data: { name: "Träd — SmartKlimat" },
  };
  if (isSubscription) priceData.recurring = { interval: "month" };

  const params: any = {
    mode: isSubscription ? "subscription" : "payment",
    line_items: [{ price_data: priceData, quantity }],
    success_url: "https://smartklimat.org/plantera?tack=1",
    cancel_url: "https://smartklimat.org/plantera",
    metadata: { type, quantity: String(quantity) },
  };

  if (type === "gava") {
    params.custom_fields = [
      {
        key: "recipient_name",
        label: { type: "custom", custom: "Mottagarens namn" },
        type: "text",
        optional: false,
      },
      {
        key: "greeting",
        label: { type: "custom", custom: "Hälsning" },
        type: "text",
        optional: true,
      },
    ];
  }

  try {
    const session = await stripe.checkout.sessions.create(params);
    return json(200, { url: session.url });
  } catch (e) {
    console.error("create-checkout error", e);
    return json(500, { error: "stripe_error", detail: (e as Error).message });
  }
});
