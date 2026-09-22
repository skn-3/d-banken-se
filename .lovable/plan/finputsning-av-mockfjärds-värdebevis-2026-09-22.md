# Finputsning av Mockfjärds-värdebevis

## Genomförande
- Flytta webbversionens botteninformation till den ljusa ytan direkt under brödtexten, centrerad under en guldlinje och i samma ordning som PDF-versionen.
- Smalna av brödtexten till cirka 440 px i webben och 640 canvas-px i PDF, med upp till fyra fullständiga rader utan ellips.
- Ge Mockfjärds-badgen en diskret ljus, halvtransparent rundad platta i båda versionerna.
- Ta bort den övre SmartKlimat-stämpeln och placera ett tydligt centrerat SmartKlimat-sigill under botteninformationen, fortfarande inom den ljusa ytan.

## Data
- Uppdatera Mockfjärds-mallens fältplaceringar för PDF-layouten.
- Bygg om `template_snapshot` för alla bevis från `source='mockfjards'`, med befintligt `partner`-objekt bevarat och utan mejlutskick.

## Verifiering
- Kontrollera webbsidan och den nedladdade PDF-filen lokalt för `SK-2026-ACEBF9`.
- Publicera och kontrollera samma två vyer live med skärmdumpar.
- Ändra inga andra mallar eller flöden.