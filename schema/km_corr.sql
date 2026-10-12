-- v129 · KM-MAIL-LOG (12/10/2026, Stavros) — «Αλληλογραφία» στον Πίνακα.
-- Ό,τι γράφεται από/προς support@ και stavros@ (Gmail του admin@), όπως το βλέπει το Apps Script.
-- ΜΟΝΟ μεταδεδομένα + 200 χαρακτήρες αρχής. Διαγραφή μετά από 24 μήνες (RETENTION.mail_months).
CREATE TABLE IF NOT EXISTS km_corr (
  msg_id    TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  mailbox   TEXT NOT NULL,
  dir       TEXT NOT NULL,
  peer      TEXT NOT NULL,
  peer_name TEXT,
  subject   TEXT,
  at        TEXT NOT NULL,
  snippet   TEXT
);
CREATE INDEX IF NOT EXISTS ix_km_corr_peer ON km_corr(peer, at);
CREATE INDEX IF NOT EXISTS ix_km_corr_at ON km_corr(at);
