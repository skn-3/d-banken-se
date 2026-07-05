import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function verifyCron(request: Request): boolean {
  const expected = process.env.SMARTKLIMAT_CRON_SECRET ?? "";
  if (!expected) return false;
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  const header = request.headers.get("x-cron-secret") ?? bearer;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/weekly-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!verifyCron(request)) return new Response("Unauthorized", { status: 401 });
        const { runBackup, backupThrottled } = await import("@/lib/backup.server");
        if (await backupThrottled(60)) {
          return new Response(JSON.stringify({ ok: false, throttled: true }), {
            status: 429, headers: { "content-type": "application/json" },
          });
        }
        try {
          const result = await runBackup({ userId: null, triggeredBy: "cron" });
          return Response.json({ ok: true, files: result.files.length, deleted: result.deleted.length });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500, headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
