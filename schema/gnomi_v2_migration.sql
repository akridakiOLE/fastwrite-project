-- FastWrite — μετάβαση ερωτηματολογίου v1 -> v2 (15/8/2026)
--
-- Τρέχει ΜΙΑ φορά, ΠΡΙΝ από το deploy του νέου worker:
--   npx wrangler d1 execute fastwrite-beta-downloads --remote --file=schema/gnomi_v2_migration.sql
--
-- ⚠ ΜΗ ΚΑΤΑΣΤΡΟΦΙΚΗ. Δεν διαγράφεται καμία στήλη και κανένα row.
-- Το v2 ξαναχρησιμοποιεί τις q1/q2/q3 με νέο νόημα· η στήλη v ξεχωρίζει
-- ποιες απαντήσεις ανήκουν σε ποια έκδοση, ώστε να μην μπερδευτούν ποτέ.

ALTER TABLE gnomi_responses ADD COLUMN v INTEGER;
