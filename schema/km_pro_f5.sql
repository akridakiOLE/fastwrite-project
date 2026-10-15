-- KM-PRO-F5 (15/10/2026) — Kostometro PRO · Φάση 5 (χωρίς λογαριασμό Paddle)
-- Όλα «IF NOT EXISTS» — ξανατρέχουν χωρίς ζημιά (tools/pro/d1apply.mjs).

-- km_pro_quota: ΜΕΤΡΗΤΗΣ ΑΝΑΓΝΩΣΕΩΝ του Κώστα ανά λογαριασμό (φάκελο) και μήνα (UTC 'YYYY-MM').
-- Μετράει ΜΟΝΟ πετυχημένες αναγνώσεις (με γραμμές). Η θέση κρατιέται ΑΤΟΜΙΚΑ πριν την κλήση
-- (UPSERT … WHERE reads < όριο) και επιστρέφεται αν η ανάγνωση αποτύχει — δύο ταυτόχρονες
-- αναγνώσεις δεν περνούν ποτέ το όριο.
CREATE TABLE IF NOT EXISTS km_pro_quota (
  folder_id   TEXT NOT NULL,
  month       TEXT NOT NULL,
  reads       INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (folder_id, month)
);
CREATE INDEX IF NOT EXISTS idx_km_pro_quota_month ON km_pro_quota (month);
CREATE INDEX IF NOT EXISTS idx_km_pro_usage_month ON km_pro_usage (month);

-- km_pro_limits: όριο ΑΝΑ λογαριασμό που υπερισχύει της γενικής ρύθμισης (PRO_MONTHLY_READS / _USD).
-- NULL = ισχύει η γενική. Το γράφει μόνο ο admin (π.χ. δεύτερο σημείο, δοκιμή).
CREATE TABLE IF NOT EXISTS km_pro_limits (
  folder_id   TEXT PRIMARY KEY,
  reads_limit INTEGER,
  usd_limit   REAL,
  note        TEXT,
  updated_at  TEXT NOT NULL
);

-- km_pro_sub: συνδρομές από τον πάροχο πληρωμών (Paddle Billing, merchant of record).
-- folder_id NULL = πληρώθηκε πριν υπάρξει λογαριασμός με αυτό το email → «αναμονή»· δένεται
-- στην εγγραφή / στο πρώτο pro/status με το ίδιο email.
-- occurred_at = του ΤΕΛΕΥΤΑΙΟΥ γεγονότος που εφαρμόστηκε (η Paddle δεν εγγυάται σειρά).
CREATE TABLE IF NOT EXISTS km_pro_sub (
  sub_id          TEXT PRIMARY KEY,
  provider        TEXT NOT NULL,
  customer_id     TEXT,
  email           TEXT,
  folder_id       TEXT,
  status          TEXT NOT NULL,
  period_end      TEXT,
  sched_action    TEXT,
  sched_at        TEXT,
  price_id        TEXT,
  occurred_at     TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_km_pro_sub_folder ON km_pro_sub (folder_id);
CREATE INDEX IF NOT EXISTS idx_km_pro_sub_email ON km_pro_sub (email);
CREATE INDEX IF NOT EXISTS idx_km_pro_sub_customer ON km_pro_sub (customer_id);

-- km_pro_customer: email πελάτη του παρόχου (το γεγονός συνδρομής έχει μόνο customer_id).
CREATE TABLE IF NOT EXISTS km_pro_customer (
  customer_id  TEXT PRIMARY KEY,
  email        TEXT,
  occurred_at  TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_km_pro_customer_email ON km_pro_customer (email);

-- km_pro_events: κάθε γεγονός μία φορά (η Paddle στέλνει «τουλάχιστον μία φορά»). ΚΑΜΙΑ αποθήκευση
-- του σώματος — μόνο id, τύπος, πότε, αποτέλεσμα.
CREATE TABLE IF NOT EXISTS km_pro_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  occurred_at  TEXT,
  received_at  TEXT NOT NULL,
  outcome      TEXT NOT NULL,
  sub_id       TEXT
);
CREATE INDEX IF NOT EXISTS idx_km_pro_events_received ON km_pro_events (received_at);
