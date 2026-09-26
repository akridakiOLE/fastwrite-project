-- v92 · KM-SUP-CASE (26/9/2026) — μετρητές αριθμών αιτήματος υποστήριξης.
-- scope = folder_id (64 hex) → KM-<κωδικός affiliate>-<n>, από την εφαρμογή.
-- scope = 'E'                 → KM-E-<nnnnnn>, από την αυτόματη απάντηση του support@
--                               για email που γράφτηκαν ΕΞΩ από την εφαρμογή.
-- ΜΟΝΟ αριθμοί. Κανένα θέμα, κανένα κείμενο, καμία διεύθυνση email.
-- Η γραμμή του λογαριασμού σβήνεται μαζί με τον λογαριασμό (wipeFolder).
CREATE TABLE IF NOT EXISTS km_support_seq (
  scope TEXT PRIMARY KEY,
  n     INTEGER NOT NULL
);
