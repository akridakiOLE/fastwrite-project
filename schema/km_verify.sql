-- ═══════════════════════════════════════════════════════════════════════════
-- Brief ΣΤ (24/9/2026) — ΕΝΑ EMAIL = ΕΝΑΣ ΛΟΓΑΡΙΑΣΜΟΣ · ΚΩΔΙΚΟΣ 6 ΨΗΦΙΩΝ
--
-- ΤΟ ΕΥΡΗΜΑ: το register έκανε INSERT χωρίς κανέναν έλεγχο στο email
-- (panos@interia.pl ×3, 23–24/9). Εγκρίθηκε από τον Stavros 24/9: ένα email,
-- ένας λογαριασμός, με επιβεβαίωση του email πριν την εγγραφή.
--
-- ⚠ Το μοναδικό index μπαίνει ΜΟΝΟ αφού μετρήθηκαν 0 διπλά (24/9 18:58).
--    Αν ποτέ βρεθεί διπλό, το CREATE αποτυγχάνει ΔΥΝΑΤΑ — δεν σβήνει τίποτα.
-- ⚠ Ο κωδικός και το token ΔΕΝ αποθηκεύονται ποτέ καθαρά: μόνο SHA-256.
-- ⚠ ΚΑΜΙΑ IP: μόνο SHA-256(IP + ημέρα + μυστικό), για όριο ρυθμού, και
--    σβήνεται μαζί με τη γραμμή μετά από 24 ώρες.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS km_email_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  created    TEXT NOT NULL,
  expires    TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  ip_h       TEXT
);
CREATE INDEX IF NOT EXISTS idx_km_email_codes_email ON km_email_codes (email, created);
CREATE INDEX IF NOT EXISTS idx_km_email_codes_ip ON km_email_codes (ip_h, created);

CREATE TABLE IF NOT EXISTS km_email_tokens (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  created    TEXT NOT NULL,
  expires    TEXT NOT NULL,
  used       TEXT
);
CREATE INDEX IF NOT EXISTS idx_km_email_tokens_email ON km_email_tokens (email);

CREATE UNIQUE INDEX IF NOT EXISTS uq_km_accounts_email_live
  ON km_accounts (email) WHERE deleted IS NULL AND email <> '';
