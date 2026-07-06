import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function assertAdmin(context: { userId: string; supabase: any }) {
  const { data: ok } = await context.supabase.rpc("has_role", {
    _user_id: context.userId, _role: "admin",
  });
  if (!ok) throw new Error("Forbidden: admin krävs.");
}

export interface CertTemplateRow {
  id: string;
  slug: string;
  namn: string;
  sort: number;
  aktiv: boolean;
  bg_url: string;
  kort_url: string | null;
  falt: Record<string, any>;
  allows_greeting: boolean;
  canvas: { w: number; h: number };
  created_at: string;
}

export const adminListCertTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("cert_templates")
      .select("*")
      .order("sort", { ascending: true });
    if (error) throw new Error(error.message);
    return { templates: (data ?? []) as CertTemplateRow[] };
  });

export const adminSetCertTemplateActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(), aktiv: z.boolean(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("cert_templates")
      .update({ aktiv: data.aktiv }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminMoveCertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(), direction: z.enum(["up","down"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: all } = await db.from("cert_templates").select("id, sort").order("sort", { ascending: true });
    const rows = (all ?? []) as Array<{ id: string; sort: number }>;
    const idx = rows.findIndex((r) => r.id === data.id);
    if (idx < 0) throw new Error("Not found");
    const swap = data.direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= rows.length) return { ok: true };
    const a = rows[idx], b = rows[swap];
    // temporär swap för att undvika ev. unique-krock (finns ej idag men trygghet)
    await db.from("cert_templates").update({ sort: -1 }).eq("id", a.id);
    await db.from("cert_templates").update({ sort: a.sort }).eq("id", b.id);
    await db.from("cert_templates").update({ sort: b.sort }).eq("id", a.id);
    return { ok: true };
  });

export const adminDuplicateCertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: src, error } = await db.from("cert_templates").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!src) throw new Error("Not found");
    // Skapa unik slug med -kopia-suffix
    let newSlug = `${src.slug}-kopia`;
    let n = 2;
    while (true) {
      const { data: hit } = await db.from("cert_templates").select("id").eq("slug", newSlug).maybeSingle();
      if (!hit) break;
      newSlug = `${src.slug}-kopia-${n++}`;
    }
    const { data: maxRow } = await db.from("cert_templates").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
    const nextSort = ((maxRow?.sort ?? 0) as number) + 1;
    const { data: ins, error: e2 } = await db.from("cert_templates").insert({
      slug: newSlug, namn: `${src.namn} (kopia)`, sort: nextSort,
      aktiv: false, bg_url: src.bg_url, kort_url: src.kort_url,
      falt: src.falt, allows_greeting: src.allows_greeting, canvas: src.canvas,
    }).select("id").single();
    if (e2) throw new Error(e2.message);
    return { id: ins.id, slug: newSlug };
  });
