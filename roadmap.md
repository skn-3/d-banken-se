# Roadmap

## Mockfjärds premiumbevis (klart)
- [x] Mall, layout, brödtext, badge-platta och botteninfo i webb + PDF.
- [x] Alla 89 befintliga bevis ombyggda, publicerat och live-verifierat.

## Säkerhetshärdning (klart)
- [x] greeting_blocklist: admin-only läsning, validering via security definer-RPC.
- [x] point_events: icke-admin ser bara pågående kampanjer.
- [x] cert-assets: inventerad — tom och redan privat bucket, avsiktligt ingen publik åtkomst.

## Mockfjärds hämtningsflöde (klart)
- [x] inbound-mockfjards v2: anonyma händelser, idempotens, hämtningskod per ärende, spårbar händelselogg.
- [x] Anonymt bevis före hämtning (/v utan namnrad), inget mail före hämtning.
- [x] Publik hämtningssida /h/{kod} med samtyckesloggning och bevismail.
- [x] Uppdateringsmail vid ny händelse på hämtat ärende.
- [x] Återkallelselänk som avpersonaliserar bevis och köp.

## Juridik (klart)
- [x] Sidfot med bolagsnamn, org.nr 559370-9453, [ADRESS], integritetspolicy och återkallelselänk.
- [ ] Postadress saknas i kodbasen — ersätt platshållaren [ADRESS] när uppgiften finns.
- [x] Integritetspolicyn beskriver den nya direktinsamlingen.
