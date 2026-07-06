# Designguide — värdebevis & temakort

Så skapas ett nytt tema, från idé till live i appen. Ägare: Johannes. Byggare: Claude.

## Två vägar — välj efter känsla

**A · Konstnärstema (vektor).** För grafiska identiteter: mönster, former, illustration.
Byggs parametriskt i `bygg_prod.py` (denna mapp) — deterministiskt, återkörbart, gratis.
Exempel: alla tio högtidsteman.

**B · Atmosfärstema (foto).** För fotografiska stämningar: dimskog, guldbokeh, djungel.
Byggs som ImagineArt-hybrid (AI-foto + officiellt typografiskt lager).
Exempel: Klassisk, Kalaset, Midnattsskogen, Djurfaddern.

## Briefen — sex rader räcker

    TILLFÄLLE:   (t.ex. "Studenten")
    KÄNSLA:      en konstnär/stil eller referensbild ("50-tals studentmössa-affisch")
    PALETT:      2–4 färger eller "fritt"
    TEMAFRAS:    kortets röst ("Mössan av — trädet i.") eller "föreslå"
    HÄLSNING:    ja/nej (personlig rad utöver temafrasen)
    SPECIAL:     valfritt ("dynamiska fält som betyg i betygskatalog" à la resa-stämplarna)

## Flödet

1. **Brief** — du skriver sex rader ovan.
2. **Kort 4:5** — Claude bygger, du dömer: behåll / justera / döda.
3. **Bevis A4** — samma identitet, officiella skelettet in, du dömer igen.
4. **Split** — Claude delar i statisk bakgrund (2480×3508 jpg) + fält i `faltkartor-teman.json`.
5. **Push + prompt** — assets till `public/certs` + `public/kort`, facit till `docs/cert-exempel`,
   en Lovable-prompt lägger raden i `greeting_themes`. Motorn behöver aldrig röras.

## Järnreglerna

- Max två typsnittsröster: en för känslan, en för beviset.
- Sex dynamiska fält, alltid: namn, antal, plats, koordinater, datum, id.
- Dynamiska rader centreras eller ankras via fältkartan — aldrig fast vänsterkant.
- Kontrast mäts per zon; versaler får spärr, gemener aldrig; emojis = tofu i tryck.
- Slutgrind: strukturverifiering (bokstavs-runs = glyfantal) + kontrastmätning.

## Fältkartans format (per fält)

    x, y (baslinje), size, color, font, anchor (start/middle/end),
    weight, letterSpacing, italic, template ("{v} TRÄD")

Koordinatrymd 1240×1754 — renderaren skalar själv mot bakgrundens bredd.
