# Premiumdesign för Mockfjärds bevismail

## Genomförande
- Bygg om bevis- och uppdateringsmailen med tabellbaserad, inline-stylad premiumlayout: ljus bakgrund, vitt kort med tunn guldram, centrerat guldsigill, Georgia-rubriker och ett akvarellbaserat mini-bevis.
- Använd absoluta länkar från `https://app.smartklimat.org` för guldsigillet, akvarellbilden och värdebeviset.
- Inför korrekt singular/plural i ämnesrad, rubrik och brödtext för både första bevismailet och uppdateringsmailet.
- Dölj postadressraden när den gemensamma adresskonstanten fortfarande är `[ADRESS]`.
- Spegla samma HTML, texter och regler i Mockfjärds-funktionen som hanterar omsändningar och senare trädökningar.

## Verifiering
- Rendera ett bevismail för 1 träd och ett uppdateringsmail från 1 till 8 träd till lokala HTML-filer.
- Öppna båda i en mail-liknande Playwright-vy och kontrollera skärmdumpar visuellt.
- Kör ett komplett tillfälligt hämtningsflöde med en `@example.com`-adress, verifiera dry-run i den nya sändvägen och rensa testärendet.
- Kör typkontroll och kontrollera att förhandsbygget är felfritt.
- Driftsätt Mockfjärds-funktionen, publicera appen och kontrollera live att hämtningssidan fortfarande fungerar.
- Skicka om SK-2026-285BBE till den redan angivna adressen via `send_claim_mail` och bekräfta leverantörens mail-id i loggen.

## Avgränsning
- Inga andra mailmallar, sidor, certifikat, köp eller data ändras.
- Den befintliga postadressplatshållaren behålls internt men visas aldrig för mottagare.
