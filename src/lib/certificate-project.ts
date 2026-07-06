// Client-safe project resolver — mirrors resolveProject() i src/lib/email/resend.server.ts
// så att bevis-PDF:en visar samma projekttext som bevismailets projektkort.

export interface CertProject {
  key: "khasi" | "copperbelt" | "pontal" | "generic";
  name: string;
  story: string;
}

export function resolveCertProject(locationName?: string | null): CertProject {
  const l = (locationName || "").toLowerCase();
  if (l.includes("khasi")) {
    return {
      key: "khasi",
      name: "Khasi Hills, Indien",
      story:
        "Träden har planterats i Meghalayas molnskog — en av jordens våtaste platser — där 59 byar återställer skogen som ger dem vattnet. Din insats binder koldioxid i decennier och skyddar källvattnet.",
    };
  }
  if (l.includes("copperbelt") || l.includes("zambia") || l.includes("luanshya")) {
    return {
      key: "copperbelt",
      name: "Copperbelt, Zambia",
      story:
        "Träden har planterats i Luanshya, Copperbelt, Zambia — i miomboskog som återväxer på gruvornas gamla mark, med bikupor som ger byarna inkomst. Din insats binder koldioxid i decennier och ger skogen väg tillbaka.",
    };
  }
  if (l.includes("pontal") || l.includes("brasilien") || l.includes("paranapanema")) {
    return {
      key: "pontal",
      name: "Pontal, Brasilien",
      story:
        "Träden har planterats i Pontal do Paranapanema, Brasilien — där korridorer av atlantskog binder ihop reservaten igen. Varje träd är en bit av jaguarens och det svarta lejontamarinens väg hem, och ger de vilda plats att vandra.",
    };
  }
  return {
    key: "generic",
    name: "Ett av våra WeForest-projekt",
    story:
      "Träden har planterats i ett av våra tre granskade projekt — molnskogen i Khasi Hills, miombon i Copperbelt eller vilddjurskorridorerna i Pontal do Paranapanema. Din insats binder koldioxid i decennier.",
  };
}
