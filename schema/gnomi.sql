-- FastWrite — /gnomi ερωτηματολόγιο. Πίνακες στη D1.
--
-- Τρέχει ΜΙΑ φορά:
--   npx wrangler d1 execute fastwrite-beta-downloads --remote --file=schema/gnomi.sql
--
-- ΔΕΝ αποθηκεύεται IP. Μόνο χώρα (Cloudflare) και user-agent — ίδια λογική με
-- τον πίνακα downloads του beta worker.

-- Κάθε βήμα του χωνιού, ένα row.
--   ev: 'arrive'  = ο server σέρβιρε τη σελίδα   (ground truth, χωρίς JS)
--       'view'    = η σελίδα φόρτωσε στον browser (JS έτρεξε)
--       'start'   = πάτησε «Ξεκίνα»
--       'q'       = έφτασε στην ερώτηση q
--       'abandon' = έφυγε χωρίς να στείλει, στην ερώτηση q
--       'submit'  = έστειλε
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
  q1          TEXT,            -- τι σε περιγράφει καλύτερα
  q1_other    TEXT,
  q2          TEXT,            -- παραστατικά/μήνα
  q3          TEXT,            -- ώρες/μήνα
  q4          INTEGER,         -- 1-5
  q5          INTEGER,         -- 1-5
  q6          TEXT,            -- πώς περνάνε σήμερα
  email       TEXT,
  comment     TEXT
);

CREATE INDEX IF NOT EXISTS idx_gnomi_responses_ts ON gnomi_responses (ts);
