-- KM-PRO-F1 (12/10/2026) — Kostometro PRO · Φάση 1
-- km_pro: ποιος λογαριασμός είναι PRO. Στη Φ5 τη γράφει το webhook του παρόχου
-- πληρωμών (MoR)· ως τότε μόνο ο Stavros (admin/pro/grant), ΜΟΝΟ στο staging.
CREATE TABLE IF NOT EXISTS km_pro (
  folder_id   TEXT PRIMARY KEY,
  plan        TEXT NOT NULL,              -- 'pro'
  status      TEXT NOT NULL,              -- 'active' | 'cancelled' | 'test'
  started_at  TEXT NOT NULL,
  until       TEXT,                       -- NULL = χωρίς λήξη
  source      TEXT NOT NULL,              -- 'admin' | 'mor'
  updated_at  TEXT NOT NULL
);
-- km_pro_usage: κόστος ανάγνωσης ανά λογαριασμό ανά μήνα (χρέωση με τηλεμετρία,
-- απόφαση 4/10: το PRO διαβάζει χωρίς κλειδί πελάτη· το κόστος μετράει ως έξοδο της συνδρομής).
CREATE TABLE IF NOT EXISTS km_pro_usage (
  folder_id   TEXT NOT NULL,
  month       TEXT NOT NULL,              -- 'YYYY-MM'
  calls       INTEGER NOT NULL DEFAULT 0,
  ok          INTEGER NOT NULL DEFAULT 0,
  fail        INTEGER NOT NULL DEFAULT 0,
  lines       INTEGER NOT NULL DEFAULT 0,
  in_tok      INTEGER NOT NULL DEFAULT 0,
  out_tok     INTEGER NOT NULL DEFAULT 0,
  usd_micro   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (folder_id, month)
);
