// Server-side purchase tracking: Meta CAPI + GA4 Measurement Protocol.
// ALDRIG blockerande — alla fel loggas och sväljs.

const META_PIXEL_ID = Deno.env.get("META_PIXEL_ID") ?? "";
const META_CAPI_TOKEN = Deno.env.get("META_CAPI_TOKEN") ?? "";
const GA4_MEASUREMENT_ID = Deno.env.get("GA4_MEASUREMENT_ID") ?? "";
const GA4_API_SECRET = Deno.env.get("GA4_API_SECRET") ?? "";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type PurchaseTrackingInput = {
  eventId: string;            // session.id — dedupliceras mot browser-pixeln
  email: string;
  valueSek: number;
  quantity: number;
  contentId: string;          // tema (slug/id) eller "trad"
  metadata: Record<string, string>;
  eventSourceUrl?: string;
};

async function sendMetaCapi(i: PurchaseTrackingInput) {
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) return;
  const em = i.email ? await sha256Hex(i.email.trim().toLowerCase()) : null;
  const user_data: Record<string, unknown> = {};
  if (em) user_data.em = [em];
  if (i.metadata.fbp) user_data.fbp = i.metadata.fbp;
  const fbc = i.metadata.fbc || (i.metadata.fbclid ? `fb.1.${Date.now()}.${i.metadata.fbclid}` : "");
  if (fbc) user_data.fbc = fbc;

  const body = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: i.eventId,
      action_source: "website",
      event_source_url: i.eventSourceUrl ?? "https://smartklimat.org/plantera",
      user_data,
      custom_data: {
        value: i.valueSek,
        currency: "SEK",
        content_ids: [i.contentId],
        content_type: "product",
        num_items: i.quantity,
      },
    }],
  };

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(META_CAPI_TOKEN)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) console.error("meta capi fail", res.status, await res.text());
  else console.log("meta capi ok", i.eventId);
}

async function sendGa4(i: PurchaseTrackingInput) {
  if (!GA4_MEASUREMENT_ID || !GA4_API_SECRET) return;
  const clientId = i.metadata.ga_client_id || `${Math.floor(Math.random() * 1e10)}.${Math.floor(Date.now() / 1000)}`;
  const params: Record<string, unknown> = {
    transaction_id: i.eventId,
    value: i.valueSek,
    currency: "SEK",
    items: [{ item_id: i.contentId, item_name: i.contentId, quantity: i.quantity }],
  };
  if (i.metadata.gclid) params.gclid = i.metadata.gclid;
  if (i.metadata.utm_source) params.source = i.metadata.utm_source;
  if (i.metadata.utm_medium) params.medium = i.metadata.utm_medium;
  if (i.metadata.utm_campaign) params.campaign = i.metadata.utm_campaign;

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(GA4_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(GA4_API_SECRET)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      non_personalized_ads: false,
      events: [{ name: "purchase", params }],
    }),
  });
  if (!res.ok) console.error("ga4 mp fail", res.status, await res.text());
  else console.log("ga4 mp ok", i.eventId);
}

export async function trackPurchase(i: PurchaseTrackingInput): Promise<void> {
  const results = await Promise.allSettled([sendMetaCapi(i), sendGa4(i)]);
  for (const r of results) {
    if (r.status === "rejected") console.error("tracking error", String(r.reason));
  }
}
