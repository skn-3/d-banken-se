import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ALLOWED_TAGS = new Set([
  "svg", "rect", "circle", "ellipse", "path", "polygon", "polyline", "line",
  "g", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "title", "desc",
]);
const FORBIDDEN_TAGS = new Set([
  "script", "foreignObject", "image", "use", "iframe", "object", "embed",
  "style", "link", "animate", "animatetransform", "animatemotion", "set", "a",
]);

/**
 * Rensa AI-genererad SVG hårt: släpper endast tag-allowlist,
 * strippar on*, href/xlink:href, script/image/use/foreignObject.
 * Kastar om otillåten tag hittas eller om <svg>-rot saknas.
 */
function sanitizeSvg(raw: string): string {
  const trimmed = raw
    .replace(/^```(?:svg|xml)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = trimmed.indexOf("<svg");
  const end = trimmed.lastIndexOf("</svg>");
  if (start < 0 || end < 0 || end < start) throw new Error("Ingen giltig <svg>-rot i svaret.");
  let svg = trimmed.slice(start, end + "</svg>".length);

  // Ta bort kommentarer och CDATA
  svg = svg.replace(/<!--[\s\S]*?-->/g, "");
  svg = svg.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

  // Walk alla taggar
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(svg)) !== null) {
    const tagName = m[1].toLowerCase();
    const isClose = svg[m.index + 1] === "/";
    if (FORBIDDEN_TAGS.has(tagName) || !ALLOWED_TAGS.has(tagName)) {
      throw new Error(`Otillåten tagg i SVG: <${tagName}>`);
    }
    // Bygg attribut-sträng säker
    let attrs = m[2] || "";
    // Strippa on*-handlers
    attrs = attrs.replace(/\s(on[a-zA-Z]+)\s*=\s*"[^"]*"/g, "");
    attrs = attrs.replace(/\s(on[a-zA-Z]+)\s*=\s*'[^']*'/g, "");
    // Strippa href, xlink:href, xmlns:xlink (yttre referenser)
    attrs = attrs.replace(/\s(xlink:href|href)\s*=\s*"[^"]*"/gi, "");
    attrs = attrs.replace(/\s(xlink:href|href)\s*=\s*'[^']*'/gi, "");
    // Strippa javascript:-URLs inne i style, om något
    if (/javascript\s*:/i.test(attrs)) {
      attrs = attrs.replace(/javascript\s*:[^"'\s>]*/gi, "");
    }
    out += svg.slice(last, m.index);
    out += isClose ? `</${tagName}>` : `<${tagName}${attrs}>`;
    last = tagRe.lastIndex;
  }
  out += svg.slice(last);

  // Säkerställ viewBox och xmlns
  if (!/xmlns\s*=/.test(out)) {
    out = out.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/viewBox\s*=/.test(out)) {
    out = out.replace(/^<svg\b/, '<svg viewBox="0 0 1240 1754"');
  }
  return out;
}

const SYSTEM_PROMPT = `Du designar A4-bakgrunder för värdebevis (planteringscertifikat).

CANVAS: viewBox 0 0 1240 1754 (A4 stående). Rendera i den och lämna generösa tomytor i mittfältet (~y=500 till y=1250) där certifikattexten läggs.

UTGÅNG: Returnera ENBART en komplett <svg>-tagg. Ingen markdown, inga kodstaket, ingen förklaring, ingen text i SVG:n (text ritas av separata fält).

TILLÅTNA TAGGAR: svg, rect, circle, ellipse, path, polygon, polyline, line, g, defs, linearGradient, radialGradient, stop, clipPath. INGET annat (ingen text, tspan, image, use, foreignObject, script, style, animate).

FORMSPRÅKSRECEPT (designfamiljen):
- Organiska blobbar via quadratic-paths (Q-kommandon) med några punkter, mjuka svängar.
- Konfetti: små roterade rundade rects + cirklar utspridda i toppen och botten.
- "Snittmärken": täta handskakiga horisontella linjer, små y-jitter.
- Papperssax-kanter: taggiga polygonkanter mot en horisont.
- Jitter: små slumpförskjutningar på path-punkter så det inte ser digitalt ut.
- Lagersiluetter för djup (bakre, mellan, främre).

FÄRG: max 4-5 färger per design. Använd defs+linearGradient/radialGradient för himlar och blobbar. Håll toppen och botten aktivare, mitten luftig.`;

async function assertAdmin(context: { userId: string; supabase: any }) {
  const { data: ok } = await context.supabase.rpc("has_role", {
    _user_id: context.userId, _role: "admin",
  });
  if (!ok) throw new Error("Forbidden: admin krävs.");
}

async function callAnthropic(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY saknas.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 300)}`);
  }
  const j: any = await res.json();
  const parts = j?.content ?? [];
  const text = parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
  if (!text) throw new Error("Tomt svar från Claude.");
  return text;
}

export const studioGenerateSvg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    brief: z.string().min(2).max(2000),
    nuvarande_svg: z.string().max(200_000).optional(),
    justering: z.string().max(1000).optional(),
    slug: z.string().min(1).max(80),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    // Rate-limit 40/dag per admin (körs som användaren via context.supabase)
    const { data: allowed, error: rlErr } = await context.supabase.rpc("admin_bump_ai_usage", {
      _kind: "studio_svg", _limit: 40,
    });
    if (rlErr) throw new Error(`Rate-limit-fel: ${rlErr.message}`);
    if (allowed === false) throw new Error("Dagens kvot (40) för AI-bakgrunder är nådd. Försök igen imorgon.");

    let userMsg: string;
    if (data.nuvarande_svg && data.justering) {
      userMsg = `Justera denna SVG enligt instruktion. Returnera HELA den modifierade SVG:n. Ändra ENDAST det som instruktionen ber om.\n\nINSTRUKTION: ${data.justering}\n\nNUVARANDE SVG:\n${data.nuvarande_svg}`;
    } else {
      userMsg = `Designa en bakgrund enligt denna brief:\n\n${data.brief}`;
    }

    const raw = await callAnthropic(SYSTEM_PROMPT, userMsg);
    const clean = sanitizeSvg(raw);

    // Ladda upp
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `bg/${data.slug || "ai"}-${Date.now()}.svg`;
    const bytes = new TextEncoder().encode(clean);
    const { error: upErr } = await (supabaseAdmin as any).storage
      .from("cert-assets").upload(path, bytes, { contentType: "image/svg+xml", upsert: false });
    if (upErr) throw new Error(`Upload: ${upErr.message}`);
    const { data: signed, error: se } = await (supabaseAdmin as any).storage
      .from("cert-assets").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (se || !signed?.signedUrl) throw new Error(se?.message ?? "Signering misslyckades");

    return { url: signed.signedUrl as string, svg: clean, path };
  });
