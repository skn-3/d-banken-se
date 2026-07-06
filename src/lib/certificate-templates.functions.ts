import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

// Public: list active templates for kassa — läser den sammanslagna cert_templates.
export const listActiveTemplates = createServerFn({ method: "GET" })
  .handler(async () => {
    const s = publicClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (s as any)
      .from("cert_templates")
      .select("id, name, namn, category, accent_color, heading_text, background_key, thumbnail_url, kort_url, allows_greeting, sort, config, is_default")
      .eq("aktiv", true)
      .order("sort")
      .order("category");
    if (error) throw new Error(error.message);
    const templates = (data ?? []).map((t: Record<string, unknown>) => ({
      id: t.id as string,
      name: (t.name as string | null) ?? (t.namn as string),
      category: (t.category as string) ?? "standard",
      accent_color: (t.accent_color as string) ?? "#1E9E6A",
      heading_text: (t.heading_text as string) ?? "VÄRDEBEVIS",
      background_key: (t.background_key as string) ?? "mint",
      thumbnail_url: (t.thumbnail_url as string | null) ?? (t.kort_url as string | null) ?? null,
      allows_greeting: Boolean(t.allows_greeting),
      is_default: Boolean(t.is_default),
      sort: (t.sort as number) ?? 0,
      config: (t.config as Record<string, unknown>) ?? {},
    }));
    return { templates };
  });

// Admin: full list including inactive
export const adminListTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any)
      .from("cert_templates")
      .select("*")
      .order("category")
      .order("sort");
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
  });

const TemplatePayload = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  category: z.enum(["standard", "tillval", "org"]),
  accent_color: z.string().trim().min(3).max(20),
  heading_text: z.string().trim().min(1).max(60),
  body_text: z.string().trim().max(500),
  background_key: z.string().trim().min(1).max(40),
  logo_url: z.string().trim().max(500).nullable(),
  thumbnail_url: z.string().trim().max(500).nullable(),
  active: z.boolean(),
  sort: z.number().int().min(0).max(9999),
  org_id: z.string().uuid().nullable(),
  allows_greeting: z.boolean(),
  show_coordinates: z.boolean(),
  show_social: z.boolean(),
  social_handles: z.string().trim().max(120),
  config: z.record(z.string(), z.unknown()),
});

export const adminUpsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TemplatePayload.parse(input))
  .handler(async ({ data, context }) => {
    const { id, active, name, ...rest } = data;
    // Sammanslagen tabell använder `namn` + `aktiv`; behåll `name` för legacy-läsning.
    const row: Record<string, unknown> = {
      ...rest, name, namn: name, aktiv: active,
      // cert_templates har NOT NULL slug — härled om saknas
      slug: `admin-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    };
    if (id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (context.supabase as any)
        .from("cert_templates").update(row).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ins, error } = await (context.supabase as any)
      .from("cert_templates").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id as string };
  });

export const adminDeleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any).from("cert_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Greeting moderation
export const moderateGreeting = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ text: z.string().trim().max(120) }).parse(i))
  .handler(async ({ data }) => {
    const s = publicClient();
    const { data: rows, error } = await s.from("greeting_blocklist").select("word");
    if (error) return { ok: true }; // fail-open on read
    const lower = data.text.toLowerCase();
    const hit = (rows ?? []).find((r) => r.word && lower.includes(r.word.toLowerCase()));
    if (hit) return { ok: false as const, reason: `Innehåller olämpligt ord.` };
    return { ok: true as const };
  });

// Admin: greetings feed
export const adminListGreetings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { has_role } = await (async () => {
      const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      return { has_role: !!data };
    })();
    if (!has_role) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin as any)
      .from("admin_greetings_view")
      .select("*")
      .order("purchase_created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const adminReplaceGreeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    certificateId: z.string().uuid(),
    newGreeting: z.string().trim().max(120),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_replace_greeting", {
      _certificate_id: data.certificateId,
      _new_greeting: data.newGreeting,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    if (error) throw new Error(error.message);
    // Re-send certificate email (best-effort, admin flow)
    try {
      const { data: cert } = await context.supabase
        .from("certificates")
        .select("id, verification_id, recipient_name, tree_count, location_name, template_snapshot, greeting, purchase_id")
        .eq("id", data.certificateId).maybeSingle();
      const { data: purchase } = cert?.purchase_id
        ? await context.supabase.from("purchases").select("recipient_email, total_amount_ore, created_at").eq("id", cert.purchase_id).maybeSingle()
        : { data: null };
      if (cert && purchase?.recipient_email) {
        const { renderThanksEmail, sendEmail } = await import("@/lib/email/resend.server");
        const totalKr = `${((purchase.total_amount_ore ?? 0) / 100).toLocaleString("sv-SE")} kr`;
        const dateText = new Date(purchase.created_at ?? Date.now()).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
        const { subject, html } = renderThanksEmail({
          recipientName: cert.recipient_name,
          recipientEmail: purchase.recipient_email,
          treeCount: cert.tree_count,
          totalKr,
          dateText,
          verificationId: cert.verification_id,
          verifyUrl: `https://smartklimat.org/v/${cert.verification_id}`,
          locationName: cert.location_name,
        });
        await sendEmail({ to: purchase.recipient_email, subject, html });
      }
    } catch (err) {
      console.error("[greeting-resend] failed", (err as Error).message);
    }
    return { ok: true };
  });
