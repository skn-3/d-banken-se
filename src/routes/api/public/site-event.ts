import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_EVENTS = new Set(["verify_view", "avtryck_result", "plantera_click", "kalkylator_flight"]);
const ALLOWED_ORIGINS = new Set([
  "https://smartklimat.org",
  "https://www.smartklimat.org",
  "https://app.smartklimat.org",
]);

// In-memory rate limit (best-effort per worker instance)
const RL = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = RL.get(ip);
  if (!cur || cur.reset < now) {
    RL.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  cur.count += 1;
  if (cur.count > MAX_PER_WINDOW) return true;
  return false;
}

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "vary": "origin",
  };
}

export const Route = createFileRoute("/api/public/site-event")({
  server: {
    handlers: {
      OPTIONS: ({ request }) =>
        new Response(null, { status: 204, headers: corsHeadersFor(request.headers.get("origin")) }),
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        const cors = corsHeadersFor(origin);
        if (!origin || !ALLOWED_ORIGINS.has(origin)) {
          return new Response("forbidden_origin", { status: 403, headers: cors });
        }
        const ip = request.headers.get("cf-connecting-ip")
          ?? request.headers.get("x-forwarded-for")?.split(",")[0].trim()
          ?? "unknown";
        if (rateLimited(ip)) return new Response("rate_limited", { status: 429, headers: cors });

        let body: unknown;
        try { body = await request.json(); } catch { return new Response("bad_json", { status: 400, headers: cors }); }
        const b = body as { event?: unknown; path?: unknown; meta?: unknown };
        const event = typeof b.event === "string" ? b.event : "";
        if (!ALLOWED_EVENTS.has(event)) return new Response("bad_event", { status: 400, headers: cors });
        const path = typeof b.path === "string" ? b.path.slice(0, 500) : null;
        const meta = b.meta && typeof b.meta === "object" ? b.meta : {};
        const metaStr = JSON.stringify(meta);
        if (metaStr.length > 2000) return new Response("meta_too_large", { status: 400, headers: cors });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("site_events").insert({ event, path, meta });
        if (error) {
          console.error("site-event insert failed", error.message);
          return new Response("insert_failed", { status: 500, headers: cors });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json", ...cors },
        });
      },
    },
  },
});
