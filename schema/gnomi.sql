-- FastWrite — /gnomi ερωτηματολόγιο. Πίνακες στη D1.
--
-- Τρέχει ΜΙΑ φορά:
--   npx wrangler d1 execute fastwrite-beta-downloads --remote --file=schema/gnomi.sql
--
-- ΔΕΝ αποθηκεύεται IP. Μόνο χώρα (Cloudflare) και user-agent — ίδια λογική με
-- τον πίνακα downloads του beta worker.

-- Κάθε βήμα του χωνιού, ένα row.
--   ev: 'view'    = η σελίδα φόρτωσε στον browser (JS έτρεξε)
--       't5'/'t15'= έμεινε 5 / 15 δευτερόλεπτα
--       'start'   = ΑΠΑΝΤΗΣΕ την 1η ερώτηση (όχι πάτημα κουμπιού)
--       'q'       = έφτασε στην οθόνη q  (1-3 ερωτήσεις, 4 = τελευταία οθόνη)
--       'abandon' = έφυγε χωρίς να στείλει, στην οθόνη q
--       'submit'  = έστειλε, εντός κοινού
--       'out'     = δήλωσε ότι δεν παραλαμβάνει εμπόρευμα — ΔΕΝ μετράει
--                   ως συμπληρωμένο ερωτηματολόγιο
CREATE TABLE IF NOT EXISTS gnomi_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sid         TEXT,            -- τυχαίο id συνεδρίας (όχι ταυτότητα προσώπου)
  ev          TEXT NOT NULL,
  q           INTEGER,         -- αριθμός ερώτησης, όπου έχει νόημα
  src         TEXT,            -- 'fb' | 'ref' | 'direct'
  ts          TEXT NOT NULL,   -- ISO-8601 UTC
  country     TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_gnomi_events_ts  ON gnomi_events (ts);
CREATE INDEX IF NOT EXISTS idx_gnomi_events_ev  ON gnomi_events (ev);
CREATE INDEX IF NOT EXISTS idx_gnomi_events_sid ON gnomi_events (sid);

-- Οι απαντήσεις.
CREATE TABLE IF NOT EXISTS gnomi_responses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sid         TEXT,
  ts          TEXT NOT NULL,
  src         TEXT,
  country     TEXT,
  user_agent  TEXT,
  v           INTEGER,         -- έκδοση ερωτηματολογίου. 2 = 15/8/2026, τρεις ερωτήσεις
  -- ⚠ v2 (15/8/2026): οι στήλες q1/q2/q3 ΞΑΝΑΧΡΗΣΙΜΟΠΟΙΗΘΗΚΑΝ με νέο νόημα.
  --   q1 = σε χρέωσε προμηθευτής ακριβότερα, χωρίς να στο πει;
  --   q2 = το βλέπεις τη στιγμή της παραλαβής;
  --   q3 = πώς θα έβρισκες τεμάχια ανά κωδικό μέσα στη χρονιά;
  -- Οι q1_other/q4/q5/q6 ανήκουν στην v1 και μένουν NULL. ΔΕΝ διαγράφονται:
  -- καμία καταστροφική μετάβαση σε πίνακα παραγωγής.
  q1          TEXT,
  q1_other    TEXT,            -- v1 μόνο
  q2          TEXT,
  q3          TEXT,
  q4          INTEGER,         -- v1 μόνο
  q5          INTEGER,         -- v1 μόνο
  q6          TEXT,            -- v1 μόνο
  email       TEXT,
  comment     TEXT
);

CREATE INDEX IF NOT EXISTS idx_gnomi_responses_ts ON gnomi_responses (ts);
