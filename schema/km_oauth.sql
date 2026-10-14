-- KM-OAUTH (29/9/2026) · Σύνδεση με Google / Microsoft — Brief_Agent_Syndesi_29-09-2026 Μέρος Α
-- Μία γραμμή ανά ΠΑΤΗΜΑ «Συνέχεια με …». Ζει έως 10′ (λήξη) και σβήνεται:
--   · τη στιγμή της επιστροφής (DELETE … RETURNING — μία χρήση, καμία επανάληψη)
--   · ή στο επόμενο πάτημα οποιουδήποτε, αν είναι πάνω από 1 ώρα παλιά.
-- ΔΕΝ κρατιέται email, όνομα ή IP. ip_h = hash ημέρας (όπως στο km_email_codes), μόνο για όριο ρυθμού.
CREATE TABLE IF NOT EXISTS km_oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  verifier   TEXT NOT NULL,
  nonce      TEXT NOT NULL,
  ip_h       TEXT,
  created    TEXT NOT NULL,
  app_ch     TEXT            -- K3 (14/10/2026): hash του μυστικού της εφαρμογής καταστήματος· NULL = browser
);
CREATE INDEX IF NOT EXISTS idx_km_oauth_states_created ON km_oauth_states(created);
CREATE INDEX IF NOT EXISTS idx_km_oauth_states_ip ON km_oauth_states(ip_h, created);

-- K3 (14/10/2026) · εφαρμογή καταστήματος: κωδικός επιστροφής μιας χρήσης (2′).
-- Στο σχήμα tech.fastwrite.kostometro:// πάει ΜΟΝΟ το h· το αποτέλεσμα βγαίνει με POST {h, v}.
CREATE TABLE IF NOT EXISTS km_oauth_handoff (
  h_hash  TEXT PRIMARY KEY,
  app_ch  TEXT NOT NULL,
  frag    TEXT NOT NULL,
  created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_km_oauth_handoff_created ON km_oauth_handoff(created);
