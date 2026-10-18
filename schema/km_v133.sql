-- v133 (18/10/2026) · Πολιτική v2.6.
-- ΚΩΔ-6 · διαγραφή χωρίς την εφαρμογή: κωδικοί σε ΔΙΚΟ τους πίνακα — δεν ανοίγουν σύνδεση, δεμένοι σε ΕΝΑΝ λογαριασμό.
CREATE TABLE IF NOT EXISTS km_delreq_codes (
  email_h   TEXT PRIMARY KEY,   -- sha256("delreq|" + email + "|" + μυστικό)
  folder_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,      -- sha256("delreq:" + email + ":" + code)
  created   TEXT NOT NULL,
  expires   TEXT NOT NULL,      -- 7 ημέρες · σβήνεται από τον καθημερινό καθαρισμό
  attempts  INTEGER NOT NULL DEFAULT 0
);
-- Ειδοποίηση αλλαγής Πολιτικής: σε ποιον έφυγε — ποτέ δεύτερη φορά, ούτε με δύο ταυτόχρονες εκτελέσεις.
CREATE TABLE IF NOT EXISTS km_notice_sent (
  kind     TEXT NOT NULL,
  email_h  TEXT NOT NULL,        -- sha256("notice|" + email + "|" + μυστικό) — χωρίς email
  at       TEXT NOT NULL,
  ok       INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  claim    TEXT,                 -- «το έχει μια εκτέλεση» (λήγει σε 15′)
  PRIMARY KEY (kind, email_h)
);
