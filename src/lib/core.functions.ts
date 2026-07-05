import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId, _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

// Audience helpers: distinct sources + project names (from certificates.location_name)
export const getAudienceOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [sourcesQ, projectsQ] = await Promise.all([
      supabaseAdmin.from("purchases").select("source").eq("status", "paid").limit(50000),
      supabaseAdmin.from("certificates").select("location_name").limit(50000),
    ]);
    const sources = Array.from(new Set(
      (sourcesQ.data ?? []).map((r: any) => r.source).filter(Boolean)
    )).sort();
    const projects = Array.from(new Set(
      (projectsQ.data ?? []).map((r: any) => r.location_name).filter(Boolean)
    )).sort();
    return { sources, projects };
  });

export const listBackupFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: folders, error } = await supabaseAdmin.storage.from("backups").list("", { limit: 200, sortBy: { column: "name", order: "desc" } });
    if (error) throw new Error(error.message);
    const result: Array<{ folder: string; files: Array<{ name: string; size: number; path: string }> }> = [];
    for (const f of folders ?? []) {
      if (!f.name) continue;
      const { data: inner } = await supabaseAdmin.storage.from("backups").list(f.name, { limit: 20 });
      const files = (inner ?? []).filter((x) => x.name).map((x: any) => ({
        name: x.name, size: x.metadata?.size ?? 0, path: `${f.name}/${x.name}`,
      }));
      if (files.length) result.push({ folder: f.name, files });
    }
    return { runs: result };
  });

export const getBackupSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sig, error } = await supabaseAdmin.storage.from("backups").createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("admin_activity").insert({
      user_id: context.userId, action: "backup_download", detail: { path: data.path },
    });
    return { url: sig.signedUrl };
  });

export const listRecentNewsletters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("newsletters")
      .select("id, subject, sent_at, recipient_count, audience_kind, audience_value")
      .order("sent_at", { ascending: false })
      .limit(20);
    return { runs: data ?? [] };
  });

export const runBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runBackup } = await import("@/lib/backup.server");
    return await runBackup({ userId: context.userId, triggeredBy: "manual" });
  });

export const listRecentBackupRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("backup_runs")
      .select("id, created_at, ok, files, deleted, note, triggered_by")
      .order("created_at", { ascending: false })
      .limit(10);
    return { runs: data ?? [] };
  });
