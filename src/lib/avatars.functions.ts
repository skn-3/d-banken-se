import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export const getAvatarState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySb = supabase as any;
    const [profileRes, catalogRes, streaksRes, boostsRes, treesRes] = await Promise.all([
      anySb.from("profiles").select("photo_path, avatar_key, name").eq("user_id", userId).maybeSingle(),
      anySb.from("avatar_catalog").select("*").eq("active", true).order("sort_order"),
      anySb.from("seller_streaks").select("current_weeks, best_weeks").eq("user_id", userId).maybeSingle(),
      anySb.from("seller_boosts").select("boost_key").eq("user_id", userId),
      anySb.from("purchases").select("tree_count").eq("registered_by_user_id", userId).eq("status", "paid"),
    ]);
    const totalTrees = (treesRes.data ?? []).reduce((s: number, r: Any) => s + Number(r.tree_count ?? 0), 0);
    const bestStreak = Number(streaksRes.data?.best_weeks ?? 0);
    const badges = new Set((boostsRes.data ?? []).map((b: Any) => String(b.boost_key)));
    const catalog = (catalogRes.data ?? []) as Any[];
    const unlocked = new Set<string>();
    for (const a of catalog) {
      if (a.unlock_type === "free") unlocked.add(String(a.key));
      else if (a.unlock_type === "level" && totalTrees >= Number((a.unlock_config as Any)?.threshold ?? 0)) unlocked.add(String(a.key));
      else if (a.unlock_type === "streak" && bestStreak >= Number((a.unlock_config as Any)?.weeks ?? 0)) unlocked.add(String(a.key));
      else if (a.unlock_type === "badge" && badges.has(String((a.unlock_config as Any)?.badge ?? ""))) unlocked.add(String(a.key));
    }
    return {
      profile: profileRes.data ?? { photo_path: null, avatar_key: "kronorn", name: "" },
      catalog,
      unlocked: Array.from(unlocked),
      totalTrees,
      bestStreak,
    };
  });

export const saveUploadedPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.path.startsWith(`${userId}/`)) throw new Error("Ogiltig sökväg");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySb = supabase as any;
    const { data: prev } = await anySb.from("profiles").select("photo_path").eq("user_id", userId).maybeSingle();
    const { error } = await anySb.from("profiles").update({ photo_path: data.path }).eq("user_id", userId);
    if (error) throw new Error(error.message);
    if (prev?.photo_path && prev.photo_path !== data.path) {
      await anySb.storage.from("avatars").remove([prev.photo_path]);
    }
    return { ok: true };
  });

export const setAvatarKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySb = supabase as any;
    const { error } = await anySb.from("profiles").update({ avatar_key: data.key }).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const signAvatarPaths = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ paths: z.array(z.string().min(1).max(300)).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.paths.length === 0) return { urls: {} as Record<string, string> };
    // Need service role to sign paths owned by other users. Load admin.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const map: Record<string, string> = {};
    const { data: signed, error } = await supabaseAdmin.storage.from("avatars")
      .createSignedUrls(data.paths, 3600);
    if (error) throw new Error(error.message);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
    }
    void supabase; // silence linter
    return { urls: map };
  });

export const reportPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    userId: z.string().uuid(),
    reason: z.string().trim().min(2).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySb = supabase as any;
    const { data: prof } = await anySb.from("profiles").select("photo_path").eq("user_id", data.userId).maybeSingle();
    const { error } = await anySb.from("photo_reports").insert({
      reported_user_id: data.userId,
      reported_by_user_id: userId,
      reason: data.reason,
      photo_path: prof?.photo_path ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const leaderResetMemberPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("leader_reset_member_photo", { _user_id: data.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Admin
async function assertAdmin(context: { supabase: unknown; userId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ok } = await (context.supabase as any).rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!ok) throw new Error("Inte auktoriserad");
}

export const listPhotoReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySb = context.supabase as any;
    const { data, error } = await anySb.from("photo_reports")
      .select("id, reported_user_id, reported_by_user_id, reason, photo_path, status, created_at")
      .eq("status", "open").order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return { reports: (data ?? []) as Any[] };
  });

export const dismissPhotoReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySb = context.supabase as any;
    await anySb.from("photo_reports").update({
      status: "dismissed", resolved_by: context.userId, resolved_at: new Date().toISOString(),
    }).eq("id", data.id);
    await anySb.rpc("log_admin_activity", {
      _action: "photo_report_dismissed", _detail: { report_id: data.id },
    });
    return { ok: true };
  });

export const adminRemovePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySb = supabaseAdmin as any;
    const { data: rep } = await anySb.from("photo_reports").select("*").eq("id", data.id).maybeSingle();
    if (!rep) throw new Error("Anmälan hittades inte");
    const { data: prof } = await anySb.from("profiles").select("photo_path, email, name").eq("user_id", rep.reported_user_id).maybeSingle();
    if (prof?.photo_path) await anySb.storage.from("avatars").remove([prof.photo_path]);
    await anySb.from("profiles").update({ photo_path: null }).eq("user_id", rep.reported_user_id);
    await anySb.from("photo_reports").update({
      status: "removed", resolved_by: context.userId, resolved_at: new Date().toISOString(),
    }).eq("id", data.id);
    await anySb.rpc("log_admin_activity", {
      _action: "photo_removed", _detail: { report_id: data.id, user_id: rep.reported_user_id },
    });
    // Friendly email (best effort)
    if (prof?.email) {
      try {
        const { sendEmail } = await import("@/lib/email/resend.server");
        await sendEmail({
          to: prof.email,
          subject: "Din profilbild togs bort",
          html: `<p>Hej ${prof.name ? String(prof.name).split(" ")[0] : ""}!</p>
            <p>Vi behövde tyvärr ta bort din profilbild eftersom den bröt mot våra riktlinjer. Du kan ladda upp en ny när du vill, eller välja en av våra avatarer.</p>
            <p>Hälsningar,<br/>SmartKlimat</p>`,
        });
      } catch { /* non-blocking */ }
    }
    return { ok: true };
  });
