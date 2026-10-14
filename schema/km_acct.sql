-- KM-PRO-F4 (14/10/2026) — Kostometro PRO · Φάση 4: FastWrite «γραμματοκιβώτιο» (ο λογιστής)
-- Ο server κρατά ΜΟΝΟ: ποιος υπολογιστής λογιστή είναι συνδεδεμένος (δημόσιο κλειδί, κλειδωμένο A),
-- σφραγισμένα γράμματα που ΔΕΝ μπορεί να ανοίξει, και διορθώσεις σφραγισμένες προς τον Boss.
-- Κανένα ποσό, καμία γραμμή, κανένα όνομα προμηθευτή σε καθαρό κείμενο.
CREATE TABLE IF NOT EXISTS km_acct (
  acct_id     TEXT PRIMARY KEY,           -- 32 hex, τυχαίο
  folder_id   TEXT NOT NULL,
  name        TEXT NOT NULL,              -- πώς τον λέει ο Boss («Λογιστήριο Χριστοφή»)
  status      TEXT NOT NULL,              -- 'invited' | 'joined' | 'active' | 'revoked'
  invite_hash TEXT,                       -- sha256 του κωδικού πρόσκλησης (μία χρήση, 48 ώρες)
  invite_exp  TEXT,
  auth_hash   TEXT,                       -- sha256 του κωδικού του υπολογιστή
  pub         TEXT,                       -- δημόσιο κλειδί P-256 του υπολογιστή FastWrite
  wrap_a      TEXT,                       -- τα κλειδιά A (όλες οι εκδόσεις), κλειδωμένα προς το pub
  a_ver       INTEGER,
  device      TEXT,                       -- «FastWrite · Windows»
  office      TEXT,                       -- πώς λέει τον εαυτό του ο λογιστής
  last_pull   TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS km_acct_folder ON km_acct (folder_id);
CREATE UNIQUE INDEX IF NOT EXISTS km_acct_invite ON km_acct (invite_hash);
-- Το γραμματοκιβώτιο: ένα σφραγισμένο γράμμα ανά τιμολόγιο (η νεότερη έκδοση αντικαθιστά την παλιά).
-- id = αύξων αριθμός: το FastWrite ζητά «ό,τι μετά το Ν», σε σελίδες.
CREATE TABLE IF NOT EXISTS km_acct_mail (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id   TEXT NOT NULL,
  rid         TEXT NOT NULL,              -- id τιμολογίου στο κινητό · '_book' = η επιχείρηση · 'i_…' = ένας κωδικός του βιβλίου
  kind        TEXT NOT NULL,              -- 'inv' | 'del' | 'book' | 'item'
  a_ver       INTEGER NOT NULL,
  bytes       INTEGER NOT NULL,
  at          TEXT NOT NULL,
  obj         TEXT NOT NULL,              -- τυχαίο όνομα του σφραγισμένου αντικειμένου στο R2 (γράφεται ΠΡΙΝ τη γραμμή)
  fp          TEXT                        -- δακτυλικό του περιεχομένου (από τη συσκευή του Boss) — να μη ξαναστέλνεται ό,τι υπάρχει
);
CREATE INDEX IF NOT EXISTS km_acct_mail_seq ON km_acct_mail (folder_id, id);
CREATE INDEX IF NOT EXISTS km_acct_mail_rid ON km_acct_mail (folder_id, rid);
-- Διορθώσεις του λογιστή: σφραγισμένες ΠΡΟΣ τον Boss (ο server δεν τις ανοίγει).
-- Ισχύουν αμέσως στο FastWrite· η συσκευή του Boss τις περνά στον φάκελο χωρίς πάτημα (Α320 9/10).
CREATE TABLE IF NOT EXISTS km_acct_fix (
  id          TEXT PRIMARY KEY,           -- 32 hex, από το FastWrite
  folder_id   TEXT NOT NULL,
  acct_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  status      TEXT NOT NULL,              -- 'pending' | 'applied' | 'undone' | 'rejected'
  meta        TEXT NOT NULL,              -- σφραγισμένη προς τον Boss — σβήνεται με το 'applied'
  decided_at  TEXT
);
CREATE INDEX IF NOT EXISTS km_acct_fix_folder ON km_acct_fix (folder_id, status, created_at);
CREATE INDEX IF NOT EXISTS km_acct_fix_acct ON km_acct_fix (acct_id, created_at);
