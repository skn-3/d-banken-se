import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ResetSchema = z.object({
  email: z.string().trim().email().max(255),
  redirectTo: z.string().url(),
});

const SignupSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(2).max(120),
  accountType: z.enum(["privat", "saljare"]),
  redirectTo: z.string().url(),
});

const TeamSignupSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
  firstName: z.string().trim().min(1).max(80),
  teamCode: z.string().trim().min(1).max(24),
  redirectTo: z.string().url(),
  under13: z.boolean().optional().default(false),
  guardianEmail: z.string().trim().email().max(255).nullable().optional(),
});

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ResetSchema.parse(input))
  .handler(async ({ data }) => {
    const { PASSWORD_RESET_SENT_MESSAGE, sendRecoveryEmail } = await import("@/lib/auth-email.server");
    try {
      await sendRecoveryEmail({ email: data.email, redirectTo: data.redirectTo });
    } catch (error) {
      console.error("[auth-email] password reset not sent", error);
    }
    return { ok: true, message: PASSWORD_RESET_SENT_MESSAGE };
  });

export const requestSignupConfirmation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SignupSchema.parse(input))
  .handler(async ({ data }) => {
    const { sendSignupConfirmationEmail } = await import("@/lib/auth-email.server");
    await sendSignupConfirmationEmail(data);
    return { ok: true };
  });

export const requestTeamSignupConfirmation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TeamSignupSchema.parse(input))
  .handler(async ({ data }) => {
    const { sendTeamSignupConfirmationEmail } = await import("@/lib/auth-email.server");
    await sendTeamSignupConfirmationEmail(data);
    return { ok: true };
  });
