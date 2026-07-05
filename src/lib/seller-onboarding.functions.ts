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

export type TeamLookup = {
  id: string;
  name: string;
  project_location: string | null;
  goal_trees: number | null;
  goal_end_date: string | null;
  organization_name: string | null;
  city: string | null;
} | null;

export const lookupTeamByCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: z.string().trim().min(1).max(24) }).parse(input))
  .handler(async ({ data }) => {
    const s = publicClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: res, error } = await s.rpc("lookup_team_by_code" as any, { _code: data.code } as any);
    if (error) throw new Error(error.message);
    return { team: (res as TeamLookup) ?? null };
  });

export const joinTeamByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().trim().min(1).max(24) }).parse(input))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: res, error } = await context.supabase.rpc("join_team_by_code" as any, { _code: data.code } as any);
    if (error) throw new Error(error.message);
    const joined = res as { team_id: string; team_name: string };
    // Fire-and-forget welcome mail (idempotent per user+team).
    try {
      const { sendSellerWelcomeIfNew } = await import("@/lib/email/welcome.server");
      await sendSellerWelcomeIfNew({ userId: context.userId, teamId: joined.team_id });
    } catch (err) {
      console.error("[seller-onboarding] welcome dispatch failed", (err as Error).message);
    }
    return joined;
  });

export const notifyGuardian = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      guardianEmail: z.string().trim().email().max(255),
      childFirstName: z.string().trim().min(1).max(80),
      teamName: z.string().trim().min(1).max(200),
      teamCode: z.string().trim().min(1).max(24),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    // Verify the team code is real before spending an email
    const s = publicClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: team } = await s.rpc("lookup_team_by_code" as any, { _code: data.teamCode } as any);
    if (!team) throw new Error("Ogiltig lagkod");

    const subject = `${data.childFirstName} har skapat ett SmartKlimat-konto`;
    const html = `
      <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#0B3D2E">
        <div style="background:#0B3D2E;color:#fff;border-radius:20px;padding:28px 24px;text-align:center">
          <p style="margin:0;font-size:11px;letter-spacing:0.2em;color:#9FD9B6;text-transform:uppercase">Information till vårdnadshavare</p>
          <h1 style="margin:12px 0 0;font-size:24px">${escapeHtml(data.childFirstName)} har skapat ett konto på SmartKlimat</h1>
        </div>
        <div style="background:#F4FAF5;border:1px solid #D9EBE0;border-radius:16px;padding:20px;margin-top:16px;line-height:1.55;font-size:15px">
          <p>Hej!</p>
          <p>${escapeHtml(data.childFirstName)} har registrerat ett säljarkonto i laget <strong>${escapeHtml(data.teamName)}</strong> hos SmartKlimat.</p>
          <p>Vi samlar bara in förnamn och e-post för barnet. Inga fler personuppgifter registreras. Kontot används för att sälja trädplanteringar och följa lagets kampanj.</p>
          <p>Om du inte vill att kontot ska finnas kvar, svara på det här mejlet så tar vi bort det direkt.</p>
          <p style="margin-top:20px">Tack för att du låter ${escapeHtml(data.childFirstName)} vara med och plantera skog med oss.</p>
          <p style="margin-top:20px;color:#52705F;font-size:13px">SmartKlimat · Stockholm</p>
        </div>
      </div>
    `;
    const { sendEmail } = await import("@/lib/email/resend.server");
    const res = await sendEmail({ to: data.guardianEmail, subject, html });
    return { ok: res.ok === true };
  });

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
