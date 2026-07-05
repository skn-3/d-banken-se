import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { buildPushPayload, type PushSubscription, type VapidKeys } from "@block65/webcrypto-web-push";

type Kind = "boost_earned" | "team_turbo" | "level_up" | "streak_reminder_batch";

function stockholmHour(d = new Date()): number {
  const s = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", hour12: false }).format(d);
  return parseInt(s, 10);
}

function isQuietHours(): boolean {
  const h = stockholmHour();
  return h >= 21 || h < 8;
}

function composeForBoost(boostKey: string, meta: Record<string, unknown>): { title: string; body: string } | null {
  if (boostKey === "turbo") {
    const reason = String(meta?.reason ?? "");
    if (reason === "lagturbo") return null; // handled as team_turbo kind
    return { title: "🚀 Turbo upplåst", body: "Aktivera när du vill — 2x poäng på nästa fem träd." };
  }
  return null;
}

async function loadAdmin(): Promise<any> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sendToUser(admin: any, userId: string, title: string, body: string, url: string, kind: string, tag?: string) {
  const vapid: VapidKeys = {
    subject: process.env.VAPID_SUBJECT || "mailto:hej@smartklimat.org",
    publicKey: process.env.VAPID_PUBLIC_KEY!,
    privateKey: process.env.VAPID_PRIVATE_KEY!,
  };
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", userId);
  let ok = 0, failed = 0;
  const dead: string[] = [];
  const payloadStr = JSON.stringify({ title, body, url, tag: tag ?? kind });
  for (const s of subs ?? []) {
    const row = s as { endpoint: string; p256dh: string; auth: string };
    const sub: PushSubscription = { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } };
    try {
      const payload = await buildPushPayload({ data: payloadStr, options: { ttl: 3600 } }, sub, vapid);
      const res = await fetch(sub.endpoint, { ...payload, body: (payload.body as Uint8Array).slice().buffer } as RequestInit);
      if (res.status === 404 || res.status === 410) { dead.push(row.endpoint); failed++; }
      else if (res.ok) ok++;
      else failed++;
    } catch { failed++; }
  }
  if (dead.length) await admin.from("push_subscriptions").delete().in("endpoint", dead);
  await admin.from("push_log").insert({ user_id: userId, kind, payload: { title, body }, ok, failed });
  return { ok, failed };
}

async function handleStreakBatch(admin: any) {
  // Compute this ISO week in Europe/Stockholm on JS side is tricky; use SQL: fetch candidates via RPC-style raw query.
  const { data: streaks } = await admin
    .from("seller_streaks")
    .select("user_id,current_weeks,freezes")
    .gte("current_weeks", 2);
  if (!streaks?.length) return { total: 0 };

  // Find week bounds (Mon-Sun) in Stockholm
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const parts = fmt.formatToParts(now);
  const wd = parts.find(p => p.type === "weekday")?.value ?? "Mon";
  const dow = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].indexOf(wd);
  const todayStr = `${parts.find(p=>p.type==="year")?.value}-${parts.find(p=>p.type==="month")?.value}-${parts.find(p=>p.type==="day")?.value}`;
  const today = new Date(todayStr + "T00:00:00Z");
  const monday = new Date(today); monday.setUTCDate(today.getUTCDate() - dow);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 7);

  let sent = 0;
  for (const s of streaks) {
    const row = s as { user_id: string; current_weeks: number };
    const { count } = await admin
      .from("purchases")
      .select("id", { count: "exact", head: true })
      .eq("registered_by_user_id", row.user_id)
      .eq("status", "paid")
      .gte("created_at", monday.toISOString())
      .lt("created_at", sunday.toISOString());
    if ((count ?? 0) > 0) continue;
    const r = await sendToUser(
      admin, row.user_id,
      `🔥 Din eld på ${row.current_weeks} veckor`,
      "Ett träd räcker för att hålla den vid liv!",
      "/saljare", "streak_reminder", `streak-${row.user_id}-${todayStr}`,
    );
    if (r.ok > 0) sent++;
  }
  return { total: streaks.length, sent };
}

let cachedSecret: string | null = null;
async function expectedSecret(admin: any): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const { data } = await admin.rpc("get_internal_secret", { _name: "PUSH_NOTIFY_SECRET" });
  cachedSecret = typeof data === "string" ? data : "";
  return cachedSecret;
}

export const Route = createFileRoute("/api/public/push-notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const admin = await loadAdmin();
        const provided = request.headers.get("x-internal-secret") ?? "";
        const expected = await expectedSecret(admin);
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (isQuietHours()) return Response.json({ skipped: "quiet_hours" });
        let body: { kind?: Kind; user_id?: string; boost_key?: string; meta?: Record<string, unknown> } = {};
        try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400 }); }

        if (body.kind === "streak_reminder_batch") {
          const r = await handleStreakBatch(admin);
          return Response.json(r);
        }

        if (!body.user_id) return new Response("user_id required", { status: 400 });

        if (body.kind === "team_turbo") {
          const r = await sendToUser(admin, body.user_id, "🤝 Lagturbo!", "Laget nådde veckomålet — alla fick Turbo!", "/saljare", "team_turbo");
          return Response.json(r);
        }
        if (body.kind === "level_up") {
          const threshold = body.meta?.threshold ?? "";
          const r = await sendToUser(admin, body.user_id, "🎉 Ny nivå!", `Du har passerat ${threshold} träd. Grattis!`, "/saljare", "level_up");
          return Response.json(r);
        }
        if (body.kind === "boost_earned") {
          const composed = composeForBoost(body.boost_key ?? "", body.meta ?? {});
          if (!composed) return Response.json({ skipped: "not_notifiable" });
          const r = await sendToUser(admin, body.user_id, composed.title, composed.body, "/saljare", "boost_earned", `boost-${body.boost_key}`);
          return Response.json(r);
        }
        return new Response("Unknown kind", { status: 400 });
      },
    },
  },
});
