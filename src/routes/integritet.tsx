import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, Blobs } from "@/components/site-chrome";

export const Route = createFileRoute("/integritet")({
  head: () => ({
    meta: [
      { title: "Integritetspolicy — SmartKlimat" },
      { name: "description", content: "Så hanterar vi dina uppgifter i SmartKlimat." },
    ],
  }),
  component: IntegritetPage,
});

function IntegritetPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Blobs />
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-4">
        <Link to="/hjalp" className="text-sm" style={{ color: "var(--muted-foreground)" }}>← Hjälp</Link>
        <h1 className="mt-2 font-display text-3xl font-semibold">Integritetspolicy</h1>

        <div className="mt-6 space-y-6 text-sm leading-relaxed" style={{ color: "var(--forest)" }}>
          <section>
            <h2 className="font-display text-lg font-semibold">Vilka uppgifter samlar vi in?</h2>
            <p className="mt-2">
              För att kunna använda SmartKlimat lagrar vi förnamn, e-post och profilbild.
              Säljares lag och roll lagras för att räkna träd och poäng. Kunders förnamn och
              e-post lagras för att skicka värdebevis. När du skickar en gåva med
              schemalagd leverans lagrar vi även mottagarens e-post — den används enbart
              för att skicka värdebeviset på den dag du valt och raderas på begäran.
            </p>

          </section>

          <section>
            <h2 className="font-display text-lg font-semibold">Vad delas publikt?</h2>
            <p className="mt-2">
              På topplistor och i aktivitetsloggen visas endast förnamn, avatar, lagnamn,
              poäng och märken. Efternamn, e-post och vårdnadshavaruppgifter delas aldrig
              utanför din egen kontovy.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold">Barn och vårdnadshavare</h2>
            <p className="mt-2">
              Är säljaren under 13 år krävs samtycke från vårdnadshavare vid registrering.
              Vårdnadshavare kan när som helst begära att kontot raderas.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold">Radera ditt konto</h2>
            <p className="mt-2">
              Vill du radera ditt konto och dina uppgifter? Mejla{" "}
              <a href="mailto:hej@smartklimat.org" className="underline">hej@smartklimat.org</a>{" "}
              så hjälper vi dig inom 24 timmar på vardagar.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold">Kontakt</h2>
            <p className="mt-2">
              Frågor om personuppgifter? Skriv till{" "}
              <a href="mailto:hej@smartklimat.org" className="underline">hej@smartklimat.org</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
