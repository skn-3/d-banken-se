import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/weekly-backup")({
  server: {
    handlers: {
      POST: async () => {
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
