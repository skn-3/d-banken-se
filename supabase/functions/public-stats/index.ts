import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Träd planterade innan systemet togs i bruk — läggs ovanpå databasens live-antal. Uppdateras aldrig nedåt.
const HISTORICAL_BASELINE = 26700;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minuter

let cachedDbValue: number | null = null;
let cachedAt = 0;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-max-age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const now = Date.now();
  if (cachedDbValue !== null && now - cachedAt < CACHE_TTL_MS) {
    return json({ trees_total: HISTORICAL_BASELINE + cachedDbValue });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // All paid purchases: one-time (web), gift, and monthly subscriptions
  const { data, error } = await db
    .from("purchases")
    .select("tree_count")
    .eq("status", "paid");

  if (error) {
    console.error("public-stats query error", error.message);
    // serve stale cache if available
    if (cachedDbValue !== null) {
      return json({ trees_total: HISTORICAL_BASELINE + cachedDbValue });
    }
    return json({ error: "query_failed" }, 500);
  }

  const dbTotal = (data ?? []).reduce((sum: number, row: any) => sum + (row.tree_count ?? 0), 0);
  cachedDbValue = dbTotal;
  cachedAt = now;

  return json({ trees_total: HISTORICAL_BASELINE + dbTotal });
});
