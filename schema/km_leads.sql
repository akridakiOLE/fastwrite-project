-- ΛΙΣΤΑ LEADS (26/9/2026) — η πρώτη διανομή του Kostometro στους leads της φόρμας Facebook.
-- Νομική βάση: συγκατάθεση 6(1)(α) (Πολιτική Γ3, 13/9) — γι' αυτό κάθε email έχει σύνδεσμο
-- διαγραφής με ΔΙΚΟ ΤΟΥ token, και ο διαγραμμένος ΔΕΝ ξαναμπαίνει ποτέ με νέα εισαγωγή.
-- Η απάντηση της φόρμας (ερώτηση για αυξήσεις τιμών) ΔΕΝ αποθηκεύεται: δεν χρειάζεται για την αποστολή.
CREATE TABLE IF NOT EXISTS km_leads (
  email       TEXT PRIMARY KEY,
  name        TEXT,
  source      TEXT NOT NULL DEFAULT 'fb-form',
  consent_at  TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  unsub_at    TEXT,
  stay_at     TEXT
);
CREATE INDEX IF NOT EXISTS ix_km_leads_unsub ON km_leads(unsub_at);
CREATE INDEX IF NOT EXISTS ix_km_leads_consent ON km_leads(consent_at);
-- Μία γραμμή ανά (email, εκστρατεία): το ίδιο email δεν φεύγει ποτέ δεύτερη φορά
-- στην ίδια εκστρατεία, όσες φορές κι αν ξανατρέξει η αποστολή.
CREATE TABLE IF NOT EXISTS km_lead_sends (
  email    TEXT NOT NULL,
  campaign TEXT NOT NULL,
  at       TEXT NOT NULL,
  ok       INTEGER NOT NULL,
  err      TEXT,
  msg_id   TEXT,
  PRIMARY KEY (email, campaign)
);
