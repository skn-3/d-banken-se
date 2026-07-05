import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader, Blobs } from "@/components/site-chrome";
import { useAuth } from "@/hooks/use-auth";
import { getHelpContext } from "@/lib/help.functions";
import { Search, Mail, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/hjalp")({
  head: () => ({
    meta: [
      { title: "Hjälp — SmartKlimat" },
      { name: "description", content: "Kom igång, förklaringar, vanliga frågor och kontakt." },
    ],
  }),
  component: HjalpPage,
});

type Ctx = { role: "seller" | "leader" | "buyer"; teamName: string | null; leaderFirstName: string | null };

type Section = { id: string; title: string; emoji: string; items: { q: string; a: string }[] };

const SECTIONS: Section[] = [
  {
    id: "kom-igang",
    title: "Kom igång",
    emoji: "🚀",
    items: [
      {
        q: "Installera på hemskärmen — iPhone",
        a: "Öppna appen i Safari. Tryck på dela-ikonen längst ner (fyrkant med pil upp). Bläddra och välj \"Lägg till på hemskärmen\". Tryck \"Lägg till\" uppe till höger. Ikonen dyker upp på hemskärmen som en app.",
      },
      {
        q: "Installera på hemskärmen — Android",
        a: "Öppna appen i Chrome. Tryck på menyn (tre prickar) uppe till höger. Välj \"Lägg till på startskärmen\" eller \"Installera app\". Bekräfta. Ikonen läggs till på hemskärmen.",
      },
      {
        q: "Gå med med lagkod",
        a: "Öppna länken eller QR-koden du fått av din lagledare, eller gå till \"Aktivera\" och skriv in koden. Skapa ett konto med förnamn och e-post — sen är du inne i laget.",
      },
      {
        q: "Plantera ditt första träd",
        a: "Gå till Säljarvyn och tryck på \"Plantera träd\". Fyll i kundens förnamn och e-post och antal träd. Kunden får ett värdebevis på mejlen och trädet räknas i din trädbank direkt.",
      },
    ],
  },
  {
    id: "poang",
    title: "Poäng, boosts och elden",
    emoji: "🔥",
    items: [
      {
        q: "Hur får jag poäng?",
        a: "Varje sålt träd ger baspoäng. Poängen används sen till att låsa upp belöningar. Ditt lag samlar också poäng tillsammans.",
      },
      {
        q: "Vad är boosts?",
        a: "Boosts är tidsbegränsade multiplikatorer — till exempel dubbla poäng en viss period. Aktivera dem från Boost-hubben när de finns tillgängliga.",
      },
      {
        q: "Vad är elden (streak)?",
        a: "Elden är din svit — antal dagar i rad du planterat minst ett träd. Håll den vid liv, den ger extra märken. Missar du en dag börjar den om.",
      },
    ],
  },
];

function HjalpPage() {
  const { user } = useAuth();
  const fetchCtx = useServerFn(getHelpContext);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) { setCtx(null); return; }
    let alive = true;
    fetchCtx()
      .then((r) => { if (alive) setCtx(r as Ctx); })
      .catch(() => { if (alive) setCtx({ role: "buyer", teamName: null, leaderFirstName: null }); });
    return () => { alive = false; };
  }, [user, fetchCtx]);

  const query = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return SECTIONS;
    return SECTIONS
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => i.q.toLowerCase().includes(query) || i.a.toLowerCase().includes(query)),
      }))
      .filter((s) => s.items.length > 0);
  }, [query]);

  const mailSubject = ctx?.teamName ? `[Support] ${ctx.teamName}` : "[Support]";
  const mailHref = `mailto:hej@smartklimat.org?subject=${encodeURIComponent(mailSubject)}`;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Blobs />
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-4">
        <h1 className="font-display text-3xl font-semibold">Hjälp</h1>
        <p className="mt-2" style={{ color: "var(--muted-foreground)" }}>
          Kort och enkelt — hittar du inte det du söker, hör av dig.
        </p>

        {/* Search */}
        <div className="mt-6 relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--muted-foreground)" }} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Sök i hjälpen…"
            className="w-full rounded-2xl border py-3.5 pl-11 pr-4 text-base outline-none transition focus:border-[color:var(--forest)]"
            style={{ borderColor: "var(--border)", background: "var(--paper)" }}
          />
        </div>

        {/* Sections */}
        <div className="mt-8 space-y-8">
          {filtered.length === 0 && (
            <div className="surface-card p-6 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Inga träffar för "{q}". Prova ett annat ord.
            </div>
          )}
          {filtered.map((s) => (
            <section key={s.id}>
              <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                <span>{s.emoji}</span>
                {s.title}
              </h2>
              <div className="mt-3 space-y-2">
                {s.items.map((it, i) => {
                  const key = `${s.id}-${i}`;
                  const isOpen = !!open[key] || !!query;
                  return (
                    <div key={key} className="surface-card overflow-hidden">
                      <button
                        onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                        className="flex w-full items-center justify-between gap-3 p-4 text-left transition active:scale-[0.99]"
                      >
                        <span className="font-display text-base font-medium">{it.q}</span>
                        <ChevronDown
                          size={18}
                          className="shrink-0 transition-transform"
                          style={{ color: "var(--muted-foreground)", transform: isOpen ? "rotate(180deg)" : "none" }}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 text-sm leading-relaxed" style={{ color: "var(--forest)" }}>
                          {it.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Contact */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold flex items-center gap-2">
            <span>💬</span>
            Kontakt
          </h2>

          {ctx?.role === "seller" ? (
            <>
              <div
                className="mt-3 rounded-3xl p-5"
                style={{ background: "var(--mint)", border: "1px solid var(--border)" }}
              >
                <div className="font-display text-lg font-semibold" style={{ color: "var(--forest)" }}>
                  Fråga {ctx.leaderFirstName ?? "din lagledare"} — hen kan det mesta! 💚
                </div>
                <p className="mt-2 text-sm" style={{ color: "var(--forest)" }}>
                  Din lagledare känner ert lag bäst och svarar snabbast på det mesta.
                </p>
              </div>
              <p className="mt-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                Behöver du mer hjälp? Be en vuxen maila{" "}
                <a href="mailto:hej@smartklimat.org" className="underline">hej@smartklimat.org</a>.
              </p>
            </>
          ) : (
            <div className="mt-3 surface-card p-5">
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Vi svarar inom 24 timmar på vardagar.
              </p>
              <a
                href={mailHref}
                className="btn-primary mt-4 inline-flex items-center gap-2"
              >
                <Mail size={18} />
                Mejla hej@smartklimat.org
              </a>
            </div>
          )}
        </section>

        <footer className="mt-14 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          <Link to="/integritet" className="underline">Integritetspolicy</Link>
        </footer>
      </main>
    </div>
  );
}
