// Server-only: skicka Web Push till en given användare via VAPID.
// Håller VAPID-logiken på ett ställe så flera server-funktioner kan dela den.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildPushPayload, type PushSubscription, type VapidKeys } from "@block65/webcrypto-web-push";

interface PushArgs {
  userId: string;
  title: string;
  body: string;
  url?: string;
  kind: string;
  tag?: string;
}

export async function sendPushToUser(a: PushArgs): Promise<{ ok: number; failed: number }> {
  const vapid: VapidKeys = {
    subject: process.env.VAPID_SUBJECT || "mailto:hej@smartklimat.org",
    publicKey: process.env.VAPID_PUBLIC_KEY!,
    privateKey: process.env.VAPID_PRIVATE_KEY!,
  };
  if (!vapid.publicKey || !vapid.privateKey) {
    console.warn("[push] missing VAPID keys — skipping");
    return { ok: 0, failed: 0 };
  }
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", a.userId);
  let ok = 0, failed = 0;
  const dead: string[] = [];
  const payloadStr = JSON.stringify({ title: a.title, body: a.body, url: a.url ?? "/", tag: a.tag ?? a.kind });
  for (const row of (subs ?? []) as Array<{ endpoint: string; p256dh: string; auth: string }>) {
    const sub: PushSubscription = { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } };
    try {
      const payload = await buildPushPayload({ data: payloadStr, options: { ttl: 3600 } }, sub, vapid);
      const res = await fetch(sub.endpoint, { ...payload, body: (payload.body as Uint8Array).slice().buffer } as RequestInit);
      if (res.status === 404 || res.status === 410) { dead.push(row.endpoint); failed++; }
      else if (res.ok) ok++;
      else failed++;
    } catch { failed++; }
  }
  if (dead.length) await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", dead);
  await supabaseAdmin.from("push_log").insert({ user_id: a.userId, kind: a.kind, payload: { title: a.title, body: a.body }, ok, failed });
  return { ok, failed };
}
