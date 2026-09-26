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

-- v93 · KM-SUP-ARRIVED (26/9/2026, πρόταση Stavros) — κάθε αριθμός με ώρα έκδοσης
-- και ώρα ΑΦΙΞΗΣ στο support@. Η εφαρμογή δείχνει «Συνέχεια σε…» ΜΟΝΟ για
-- όσους έφτασαν. Όσοι δεν έφτασαν σε 24 ώρες σβήνονται (ωριαίο ρολόι).
-- Όσοι έφτασαν: 24 μήνες, ή μαζί με τον λογαριασμό.
-- ΜΟΝΟ αριθμός + ώρες. Κανένα θέμα, κανένα κείμενο, καμία διεύθυνση.
CREATE TABLE IF NOT EXISTS km_support_tickets (
  code       TEXT PRIMARY KEY,
  scope      TEXT NOT NULL,
  issued_at  TEXT NOT NULL,
  arrived_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_km_support_tickets_scope ON km_support_tickets(scope);
CREATE INDEX IF NOT EXISTS ix_km_support_tickets_pending ON km_support_tickets(arrived_at, issued_at);
