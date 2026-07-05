// Server-only backup logic. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "backups";

async function dumpTable(table: string) {
  const rows: unknown[] = [];
  const chunk = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin.from(table).select("*").range(from, from + chunk - 1);
    if (error) throw new Error(`dump_${table}: ${error.message}`);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < chunk) break;
    from += chunk;
  }
  return rows;
}

export async function runBackup(opts: { userId?: string | null; triggeredBy: "manual" | "cron" }) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const files: Array<{ path: string; size: number; table: string }> = [];
  const deleted: string[] = [];

  try {
    for (const table of ["purchases", "certificates", "email_suppression"]) {
      const rows = await dumpTable(table);
      const path = `${ts}/${table}.json`;
      const body = new TextEncoder().encode(JSON.stringify(rows, null, 2));
      const up = await supabaseAdmin.storage.from(BUCKET).upload(path, body, {
        contentType: "application/json", upsert: true,
      });
      if (up.error) throw new Error(`upload_${table}: ${up.error.message}`);
      files.push({ path, size: body.byteLength, table });
    }

    // Cleanup >90 days
    const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
    const { data: list } = await supabaseAdmin.storage.from(BUCKET).list("", { limit: 1000 });
    for (const folder of list ?? []) {
      const raw = folder.name;
      if (!raw) continue;
      // folder names look like 2026-07-05T03-00-00-000Z
      const iso = raw.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "$1:$2:$3.$4Z");
      const t = Date.parse(iso);
      if (isFinite(t) && t < cutoff) {
        const { data: inner } = await supabaseAdmin.storage.from(BUCKET).list(raw, { limit: 100 });
        const paths = (inner ?? []).map((f) => `${raw}/${f.name}`);
        if (paths.length) {
          const del = await supabaseAdmin.storage.from(BUCKET).remove(paths);
          if (!del.error) deleted.push(...paths);
        }
      }
    }

    await supabaseAdmin.from("backup_runs").insert({
      ok: true, files, deleted, triggered_by: opts.triggeredBy,
    });
    if (opts.userId) {
      await supabaseAdmin.from("admin_activity").insert({
        user_id: opts.userId, action: "backup_run",
        detail: { files: files.length, deleted: deleted.length, triggered: opts.triggeredBy },
      });
    }
    return { ok: true, files, deleted };
  } catch (e) {
    const msg = (e as Error).message;
    await supabaseAdmin.from("backup_runs").insert({
      ok: false, files, deleted, note: msg, triggered_by: opts.triggeredBy,
    });
    throw e;
  }
}

export async function backupThrottled(minSecondsAgo = 60): Promise<boolean> {
  const since = new Date(Date.now() - minSecondsAgo * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("backup_runs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  return (count ?? 0) > 0;
}
