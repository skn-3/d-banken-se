import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { publicKey: process.env.VAPID_PUBLIC_KEY ?? "" };
});

export const getPushState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: subs }, { data: profile }] = await Promise.all([
      supabase.from("push_subscriptions").select("endpoint").eq("user_id", userId),
      supabase.from("profiles").select("is_minor, guardian_email").eq("user_id", userId).maybeSingle(),
    ]);
    return {
      enabled: (subs?.length ?? 0) > 0,
      endpoints: (subs ?? []).map((s: { endpoint: string }) => s.endpoint),
      isMinor: !!profile?.is_minor,
      guardianEmail: profile?.guardian_email ?? null,
    };
  });

const subSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export const subscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => subSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("push_subscriptions").upsert(
      { user_id: userId, endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ endpoint: z.string().optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const q = supabase.from("push_subscriptions").delete().eq("user_id", userId);
    if (data.endpoint) await q.eq("endpoint", data.endpoint);
    else await q;
    return { ok: true };
  });
