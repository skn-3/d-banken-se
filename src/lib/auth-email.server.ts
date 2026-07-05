import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  AUTH_EMAIL_FROM,
  renderAuthResetEmail,
  renderAuthSignupEmail,
  sendEmail,
} from "@/lib/email/resend.server";

export const PASSWORD_RESET_SENT_MESSAGE = "Om adressen finns har vi skickat en länk.";

type AccountType = "privat" | "saljare";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function actionLinkFrom(data: unknown) {
  const link = (data as { properties?: { action_link?: string | null } } | null)?.properties?.action_link;
  if (!link) throw new Error("Ingen åtgärdslänk kunde skapas.");
  return link;
}

function mapAuthError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (/already|registered|exists/i.test(msg)) return "E-postadressen används redan.";
  return msg || "Kunde inte skapa bekräftelselänk.";
}

export async function sendRecoveryEmail(args: { email: string; redirectTo: string }) {
  const email = normalizeEmail(args.email);
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: args.redirectTo },
  });
  if (error) throw new Error(error.message);

  const actionUrl = actionLinkFrom(data);
  const { subject, html } = renderAuthResetEmail({ actionUrl });
  const res = await sendEmail({ to: email, subject, html, from: AUTH_EMAIL_FROM });
  if (!res.ok) throw new Error((res as { error?: string }).error || "Mailutskick misslyckades.");
  return { actionLink: actionUrl };
}

export async function sendSignupConfirmationEmail(args: {
  email: string;
  password: string;
  name: string;
  accountType: AccountType;
  redirectTo: string;
}) {
  const email = normalizeEmail(args.email);
  const name = args.name.trim();
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "signup",
    email,
    password: args.password,
    options: {
      redirectTo: args.redirectTo,
      data: { name, account_type: args.accountType },
    },
  });
  if (error) throw new Error(mapAuthError(error));

  const actionUrl = actionLinkFrom(data);
  const userId = (data as { user?: { id?: string } } | null)?.user?.id ?? null;
  if (userId) {
    await supabaseAdmin.from("profiles").upsert(
      { user_id: userId, name, email, account_type: args.accountType },
      { onConflict: "user_id" },
    );
  }

  const { subject, html } = renderAuthSignupEmail({ actionUrl });
  const res = await sendEmail({ to: email, subject, html, from: AUTH_EMAIL_FROM });
  if (!res.ok) throw new Error((res as { error?: string }).error || "Mailutskick misslyckades.");
  return { actionLink: actionUrl, userId };
}

export async function sendTeamSignupConfirmationEmail(args: {
  email: string;
  password: string;
  firstName: string;
  teamCode: string;
  redirectTo: string;
  under13?: boolean;
  guardianEmail?: string | null;
}) {
  const teamCode = args.teamCode.trim().toUpperCase();
  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("join_code", teamCode)
    .maybeSingle();
  if (teamErr) throw new Error(teamErr.message);
  if (!team) throw new Error("Ogiltig lagkod.");

  const result = await sendSignupConfirmationEmail({
    email: args.email,
    password: args.password,
    name: args.firstName,
    accountType: "saljare",
    redirectTo: args.redirectTo,
  });
  if (!result.userId) throw new Error("Kunde inte koppla kontot till laget.");

  await supabaseAdmin
    .from("team_members")
    .insert({ team_id: team.id, user_id: result.userId, role: "seller" })
    .throwOnError();
  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: result.userId, role: "seller" }, { onConflict: "user_id,role", ignoreDuplicates: true })
    .throwOnError();

  if (args.under13) {
    await supabaseAdmin
      .from("profiles")
      .update({ is_minor: true, guardian_email: args.guardianEmail ?? null })
      .eq("user_id", result.userId)
      .throwOnError();
  }

  return result;
}
