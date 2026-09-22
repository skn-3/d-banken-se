# Centrera Mockfjärds-badgen på värdebeviset

## Genomförande
- Centrera Mockfjärds-badgen högst upp i webbversionens tomma yta ovanför guldlinjen och rubriken.
- Behåll den ljusa halvtransparenta plattan tight runt loggan och förstora toppmärket diskret.
- Uppdatera Mockfjärds-mallens PDF-fält med motsvarande centrerade position och storlek.
- Låt alla övriga delar behålla sina nuvarande positioner.

## Data
- Uppdatera den aktiva Mockfjärds-mallen i databasen.
- Uppdatera endast Mockfjärds-bevisens mallkopior så att PDF-renderingen använder samma badgeplacering, med partnerinformationen bevarad och utan mejlutskick.

## Verifiering
- Kontrollera webb och nedladdad PDF lokalt för `SK-2026-285BBE` och `SK-2026-ACEBF9`.
- Publicera och kontrollera samma vyer live.
- Ändra inga andra mallar eller flöden.

## Tekniskt
- Webbändringen begränsas till Mockfjärds-grenen i certifikatkomponenten.
- PDF-positionen lagras i fältet `mockfjards_logo`; renderaren behöver bara ändras om befintlig centrering inte kan uttryckas i mallfältet.
