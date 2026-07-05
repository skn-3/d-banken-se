import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "backups";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

async function requireAdminOrService(req: Request): Promise<{ userId: string | null } | Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return new Response("unauthorized", { status: 401, headers: cors });
  // If service role, allow (cron)
  if (token === SERVICE_KEY) return { userId: null };
  const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData } = await asUser.auth.getUser();
  if (!userData?.user) return new Response("unauthorized", { status: 401, headers: cors });
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: role } = await db
    .from("user_roles").select("role")
    .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
  if (!role) return new Response("forbidden", { status: 403, headers: cors });
  return { userId: userData.user.id };
}

async function dumpTable(db: ReturnType<typeof createClient>, table: string) {
  const rows: unknown[] = [];
  const chunk = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await db.from(table).select("*").range(from, from + chunk - 1);
    if (error) throw new Error(`dump_${table}: ${error.message}`);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < chunk) break;
    from += chunk;
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405, headers: cors });

  const gate = await requireAdminOrService(req);
  if (gate instanceof Response) return gate;

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const triggered = gate.userId ? "manual" : "cron";
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const files: Array<{ path: string; size: number; table: string }> = [];
  const deleted: string[] = [];

  try {
    for (const table of ["purchases", "certificates", "email_suppression"]) {
      const rows = await dumpTable(db, table);
      const path = `${ts}/${table}.json`;
      const body = new TextEncoder().encode(JSON.stringify(rows, null, 2));
      const up = await db.storage.from(BUCKET).upload(path, body, {
        contentType: "application/json",
        upsert: true,
      });
      if (up.error) throw new Error(`upload_${table}: ${up.error.message}`);
      files.push({ path, size: body.byteLength, table });
    }

    // Cleanup >90 days
    const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
    const { data: list, error: listErr } = await db.storage.from(BUCKET).list("", { limit: 1000 });
    if (!listErr && list) {
      for (const folder of list) {
        // top-level entries are folders named after timestamps
        const raw = folder.name;
        const iso = raw.replace(/-/g, (m, i) => (i === 4 || i === 7 ? "-" : i === 10 ? "T" : i === 13 || i === 16 ? ":" : "."));
        const t = Date.parse(iso);
        if (isFinite(t) && t < cutoff) {
          const { data: inner } = await db.storage.from(BUCKET).list(raw, { limit: 100 });
          const paths = (inner ?? []).map((f) => `${raw}/${f.name}`);
          if (paths.length) {
            const del = await db.storage.from(BUCKET).remove(paths);
            if (!del.error) deleted.push(...paths);
          }
        }
      }
    }

    await db.from("backup_runs").insert({
      ok: true, files, deleted, triggered_by: triggered,
    });
    if (gate.userId) {
      await db.from("admin_activity").insert({
        user_id: gate.userId, action: "backup_run",
        detail: { files: files.length, deleted: deleted.length },
      });
    }

    return new Response(JSON.stringify({ ok: true, files, deleted }), {
      status: 200, headers: { ...cors, "content-type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    await db.from("backup_runs").insert({ ok: false, files, deleted, note: msg, triggered_by: triggered });
    console.error("run-backup error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
});
