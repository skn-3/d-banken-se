import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const APP_PUBLIC_URL = "https://app.smartklimat.org";
export const CONSENT_TEXT_VERSION = "v1-2026-09-22";

export type ClaimStatus = "unknown" | "open" | "claimed" | "revoked";

export interface ClaimInfo {
  status: ClaimStatus;
  trees: number;
  verification_id: string | null;
}

const CodeInput = z.object({ code: z.string().trim().min(4).max(24) });

export const getClaimInfo = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => CodeInput.parse(i))
  .handler(async ({ data }): Promise<ClaimInfo> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("mockfjards_cases")
      .select("claim_code, total_trees, verification_id, claimed_at, revoked_at")
      .eq("claim_code", data.code.toUpperCase())
      .maybeSingle();
    if (!row) return { status: "unknown", trees: 0, verification_id: null };
    const status: ClaimStatus = row.revoked_at ? "revoked" : row.claimed_at ? "claimed" : "open";
    return { status, trees: row.total_trees ?? 0, verification_id: row.verification_id };
  });

const ClaimInput = z.object({
  code: z.string().trim().min(4).max(24),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  consentCertificate: z.boolean(),
  consentUpdates: z.boolean(),
});

export const claimCertificate = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ClaimInput.parse(i))
  .handler(async ({ data }) => {
    if (!data.consentCertificate) throw new Error("Samtycke krävs för att hämta värdebeviset.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.toUpperCase();
    const email = data.email.toLowerCase();

    const { data: kase } = await supabaseAdmin
      .from("mockfjards_cases")
      .select("*")
      .eq("claim_code", code)
      .maybeSingle();
    if (!kase) throw new Error("Hämtningskoden hittades inte.");
    if (kase.claimed_at && !kase.revoked_at) {
      return { status: "claimed" as const, verification_id: kase.verification_id, alreadyClaimed: true };
    }

    // Koppla/skapa kund
    let customerId: string | null = null;
    const { data: existingCustomer } = await supabaseAdmin
      .from("customers").select("id").eq("email", email).maybeSingle();
    if (existingCustomer) {
      customerId = existingCustomer.id;
      await supabaseAdmin.from("customers")
        .update({ name: data.name, updated_at: new Date().toISOString() })
        .eq("id", customerId);
    } else {
      const ins = await supabaseAdmin.from("customers")
        .insert({ email, name: data.name }).select("id").single();
      customerId = ins.data?.id ?? null;
    }

    await supabaseAdmin.from("purchases").update({
      recipient_name: data.name,
      recipient_email: email,
      ...(customerId ? { customer_id: customerId } : {}),
    }).eq("id", kase.purchase_id);

    await supabaseAdmin.from("certificates").update({
      recipient_name: data.name,
      ...(customerId ? { customer_id: customerId } : {}),
    }).eq("id", kase.certificate_id);

    await supabaseAdmin.from("consent_log").insert({
      claim_code: code,
      case_id: kase.case_id,
      email,
      name: data.name,
      text_version: CONSENT_TEXT_VERSION,
      consent_certificate: true,
      consent_updates: data.consentUpdates,
      action: "granted",
    });

    await supabaseAdmin.from("mockfjards_cases").update({
      claimed_at: new Date().toISOString(),
      claim_name: data.name,
      claim_email: email,
      updates_opt_in: data.consentUpdates,
      revoked_at: null,
      updated_at: new Date().toISOString(),
    }).eq("case_id", kase.case_id);

    // Bevismail — skickas via edge-funktionen inbound-mockfjards (service role),
    // vars Resend-nyckel är verifierad för avsändardomänen i produktion.
    const { data: cert } = await supabaseAdmin
      .from("certificates").select("location_name").eq("id", kase.certificate_id).maybeSingle();
    try {
      const url = `${process.env.SUPABASE_URL}/functions/v1/inbound-mockfjards`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          action: "send_claim_mail",
          to: email,
          recipient_name: data.name,
          tree_count: kase.total_trees ?? 0,
          verification_id: kase.verification_id,
          revoke_token: kase.revoke_token,
          location_name: cert?.location_name ?? null,
        }),
      });
      const body = await res.text();
      if (!res.ok) console.error("[claim] bevismail misslyckades", { status: res.status, body });
      else console.log("[claim] bevismail skickat", { to: email, body });
    } catch (err) {
      console.error("[claim] bevismail kastade fel", err);
    }

    return { status: "claimed" as const, verification_id: kase.verification_id, alreadyClaimed: false };
  });

