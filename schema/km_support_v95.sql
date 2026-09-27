-- v95 · KM-SUP-THREAD (27/9/2026, brief «Αιτήματα μέσω server», έγκριση Stavros 27/9)
-- Από τη v95 ο server κρατάει ΚΑΙ το κείμενο των αιτημάτων — ολόκληρο το ιστορικό
-- (Ερώτηση/Απάντηση), την κατάσταση (open/answered/closed) και ποιος το έκλεισε.
-- Γραμμή στην Πολιτική v2 + DPIA ΠΡΙΝ τη δημοσίευση του /legal/.
--
-- km_support_cases: ένα αίτημα = ένας αριθμός.
--   scope = folder_id (από την εφαρμογή) ή 'E' (email εκτός εφαρμογής).
--   email = ΜΟΝΟ για 'E' (πού απαντάμε). Για λογαριασμούς η διεύθυνση διαβάζεται
--           κάθε φορά από το km_accounts — δεν αντιγράφεται εδώ.
--   status: open (περιμένει εμάς) · answered (απαντήσαμε) · closed.
--   closed_by: user · agent · auto (7 ημέρες μετά τη δική μας απάντηση χωρίς νέο μήνυμα).
--   seen_out_at: πότε ο χρήστης είδε τις απαντήσεις (κουκκίδα «νέα απάντηση»).
-- Τήρηση: 24 μήνες από το κλείσιμο · σβήνονται μαζί με τον λογαριασμό.
CREATE TABLE IF NOT EXISTS km_support_cases (
  code        TEXT PRIMARY KEY,
  scope       TEXT NOT NULL,
  topic       TEXT,
  email       TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL,
  last_in_at  TEXT,
  last_out_at TEXT,
  closed_at   TEXT,
  closed_by   TEXT,
  seen_out_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_km_support_cases_scope ON km_support_cases(scope, created_at);
CREATE INDEX IF NOT EXISTS ix_km_support_cases_status ON km_support_cases(status, last_out_at);
CREATE INDEX IF NOT EXISTS ix_km_support_cases_closed ON km_support_cases(closed_at);

-- Κάθε μήνυμα: dir in (πελάτης) / out (εμείς) · source app / email. Κείμενο ≤ 8.000 χαρ.
CREATE TABLE IF NOT EXISTS km_support_messages (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  code   TEXT NOT NULL,
  dir    TEXT NOT NULL,
  source TEXT NOT NULL,
  body   TEXT NOT NULL,
  at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_km_support_messages_code ON km_support_messages(code, id);
CREATE INDEX IF NOT EXISTS ix_km_support_messages_at ON km_support_messages(dir, at);
