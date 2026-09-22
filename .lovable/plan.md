# Premiumdesign för Mockfjärds-värdebevis

## Omfattning
- Lägg in den godkända akvarellbakgrunden som `public/certs/bg-mockfjards.jpg` och använd befintliga Mockfjärds- och SmartKlimat-märken.
- Skapa en aktiv `cert_templates`-mall med slug `mockfjards`, namn `Mockfjärds`, A4-format och exakt placerade dynamiska samt statiska fält.
- Ge Mockfjärds en egen webbvisning och PDF-väg så båda använder samma bakgrund, typografi, grönt/guld, avdelare och botteninformation.
- Låt övriga värdebevis och mallar fortsätta använda sina nuvarande renderare oförändrat.

## Koppling och befintliga bevis
- Slå upp Mockfjärds-mallens id i `inbound-mockfjards` och sätt `certificate_template_id` innan nya köp skapas.
- Behåll partnerobjektet exakt som idag när nya snapshots skapas.
- Uppdatera alla befintliga Mockfjärds-köp och certifikat via SQL: mall-id och en ny snapshot från mallen, med befintligt `partner`-objekt bevarat.
- Uppdateringen skickar inga mejl.

## Teknisk detalj
- Mallen lagrar helsidesbilden i `bg_url`, A4-canvas i `canvas` och alla text-/logoelement i `falt`.
- Den publika certifikatresponsen behöver bära mallens slug, separat från eventuellt hälsningstema, så PDF-knappen säkert väljer `mockfjards` utan att ändra övriga teman.
- Bildfilens faktiska innehåll konverteras till JPEG eftersom källadressen levererade PNG-data trots `.jpg`-namnet.

## Verifiering
- Kontrollera databasraden, kopplingen och att alla befintliga Mockfjärds-certifikat fått nya snapshots med partnerdata kvar.
- Testa live-sidan `SK-2026-ACEBF9` visuellt i desktopformat och ta skärmdump.
- Klicka på “Ladda ner värdebevis (PDF)”, öppna/rendera PDF-filen och kontrollera A4-resultatet visuellt.
- Publicera först när lokala kontroller och bygget är gröna, och verifiera därefter samma flöde på `app.smartklimat.org`.
