-- KM-PRO-V201 (18/10/2026) — Kostometro · ΠΡΟΠΛΗΡΩΜΕΝΟ ΥΠΟΛΟΙΠΟ ΣΕ ΧΡΗΜΑΤΑ (Brief «Τρία σκαλιά» εγκρίθηκε 18/10)
-- Αποφάσεις Stavros 18/10: το υπόλοιπο PRO.mini περνά στο PRO ΣΕ ΧΡΗΜΑΤΑ με την τιμή του PRO · ανάγνωση ΚΑΙ Κώστας
-- στη δοκιμή χρεώνονται από το υπόλοιπο (κόστος + 15 %) · ό,τι αγοράστηκε κρατά την τιμή της αγοράς (Brief §3).
-- Όλα «IF NOT EXISTS» — ξανατρέχουν χωρίς ζημιά (tools/pro/d1apply.mjs). Ποσά σε ΜΙΚΡΟ-ΕΥΡΩ (1 € = 1.000.000).

-- km_bal: ΕΝΑ ανά λογαριασμό. left_micro = Σ km_bal_lot.left_micro (κρατιέται στην ίδια δοσοληψία).
-- ver = τυχαίο κουπόνι που αλλάζει σε ΚΑΘΕ κίνηση: η χρέωση γράφει μόνο αν το ver δεν άλλαξε από τη στιγμή
-- που διάβασε (αισιόδοξος έλεγχος) — δύο συσκευές ταυτόχρονα δεν ξοδεύουν ποτέ τα ίδια χρήματα.
CREATE TABLE IF NOT EXISTS km_bal (
  folder_id   TEXT PRIMARY KEY,
  left_micro  INTEGER NOT NULL DEFAULT 0,
  ver         TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- km_bal_lot: ΜΙΑ γραμμή ανά αγορά. Οι τιμές ανάγνωσης κλειδώνουν ΕΔΩ, τη στιγμή της αγοράς:
--   rate_mini = € ανά ανάγνωση PRO.mini (σύνολα) · rate_pro = € ανά ανάγνωση PRO (γραμμές)
--   fx/markup = για τον Κώστα (χρέωση με το πραγματικό κόστος της συνομιλίας).
-- Το «PRO.mini → PRO σε χρήματα, με την τιμή του PRO» = τα ΙΔΙΑ χρήματα του lot, με το rate_pro του lot.
-- net_micro = ό,τι ΠΡΑΓΜΑΤΙΚΑ εισπράττουμε: χωρίς ΦΠΑ χώρας και χωρίς προμήθεια καταστήματος/Paddle.
-- folder_id NULL = πληρώθηκε στο web πριν υπάρξει λογαριασμός με αυτό το email → δένεται στην εγγραφή.
-- left_micro μπορεί να γίνει ΑΡΝΗΤΙΚΟ μόνο από επιστροφή χρημάτων (ξοδεύτηκε πριν γυρίσει) ή από διαφορά
-- κόστους Κώστα· τότε το σύνολο του λογαριασμού είναι χρέος και η επόμενη αγορά το καλύπτει πρώτα.
-- status: ok · review (πληρώθηκε, αλλά λείπει στοιχείο για τον υπολογισμό — ο admin το ορίζει) · refunded.
CREATE TABLE IF NOT EXISTS km_bal_lot (
  lot_id       TEXT PRIMARY KEY,
  folder_id    TEXT,
  email        TEXT,
  customer     TEXT,                      -- Paddle ctm_… (για αγορά web χωρίς email ακόμα: το email έρχεται με το customer.*)
  source       TEXT NOT NULL,             -- apple | google | paddle | admin
  ext_id       TEXT NOT NULL UNIQUE,      -- apple:<transactionId> · google:<orderId> · paddle:<txn_…> · admin:<τυχαίο>
  env          TEXT NOT NULL,             -- prod | sandbox
  product      TEXT,
  country      TEXT,                      -- ISO-2
  currency     TEXT,
  gross_minor  INTEGER,                   -- τι πλήρωσε ο πελάτης, λεπτά του νομίσματος (με ΦΠΑ)
  tax_minor    INTEGER,
  fee_pct      REAL,
  net_micro    INTEGER NOT NULL,
  net0_micro   INTEGER,                   -- το ΑΡΧΙΚΟ καθαρό (οι μερικές επιστροφές υπολογίζονται πάνω σε αυτό)
  left_micro   INTEGER NOT NULL,
  rate_mini    INTEGER NOT NULL,
  rate_pro     INTEGER NOT NULL,
  fx_usd_eur   REAL NOT NULL,
  markup_pct   REAL NOT NULL,
  status       TEXT NOT NULL,
  note         TEXT,
  tok          TEXT,                      -- κουπόνι της τελευταίας αλλαγής κατάστασης (δέσιμο / επιστροφή): η κίνηση στο km_bal γράφεται ΜΟΝΟ αν το κουπόνι είναι δικό της
  created_at   TEXT NOT NULL,
  refunded_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_km_bal_lot_folder ON km_bal_lot (folder_id, created_at);
CREATE INDEX IF NOT EXISTS idx_km_bal_lot_email ON km_bal_lot (email);
CREATE INDEX IF NOT EXISTS idx_km_bal_lot_customer ON km_bal_lot (customer);
CREATE INDEX IF NOT EXISTS idx_km_bal_lot_status ON km_bal_lot (status);

-- km_bal_tx: ΚΑΘΕ κίνηση, μία γραμμή ανά lot που άγγιξε. op_id ομαδοποιεί μία πράξη (π.χ. μία ανάγνωση
-- που πήρε το τέλος του ενός lot και την αρχή του επόμενου) — έτσι η αποτυχημένη ανάγνωση ΕΠΙΣΤΡΕΦΕΙ ακριβώς
-- στα ίδια lots. Ποτέ φωτογραφία, ποτέ κείμενο συνομιλίας: μόνο ποσό, είδος, πότε.
CREATE TABLE IF NOT EXISTS km_bal_tx (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id       TEXT NOT NULL,
  folder_id   TEXT NOT NULL,
  lot_id      TEXT NOT NULL,
  kind        TEXT NOT NULL,              -- buy | mini | pro | agent | release | refund | adjust
  micro       INTEGER NOT NULL,           -- + πίστωση · − χρέωση
  at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_km_bal_tx_folder ON km_bal_tx (folder_id, id);
CREATE INDEX IF NOT EXISTS idx_km_bal_tx_op ON km_bal_tx (op_id);
CREATE INDEX IF NOT EXISTS idx_km_bal_tx_at ON km_bal_tx (folder_id, at);

-- km_pro_trial: ΔΟΚΙΜΗ PRO 14 ΗΜΕΡΩΝ — μία φορά ανά email (hash, όχι το email: δεν χρειάζεται να το ξέρουμε
-- για να το αναγνωρίσουμε). Μένει μετά τη διαγραφή του λογαριασμού, αλλιώς «διαγραφή → νέα δοκιμή».
CREATE TABLE IF NOT EXISTS km_pro_trial (
  email_h     TEXT PRIMARY KEY,
  folder_id   TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  until       TEXT NOT NULL
);

-- km_pro_agent: ο Κώστας στο PRO, ανά λογαριασμό και μήνα — κόστος (μετρημένο ανά κλήση) και ταβάνι
-- των συνδρομητών (Α320 30/9: ~3 €/μήνα, επιβεβαιώθηκε 18/10 · ρύθμιση PRO_AGENT_MONTHLY_EUR).
CREATE TABLE IF NOT EXISTS km_pro_agent (
  folder_id   TEXT NOT NULL,
  month       TEXT NOT NULL,
  turns       INTEGER NOT NULL DEFAULT 0,
  usd_micro   INTEGER NOT NULL DEFAULT 0,
  eur_micro   INTEGER NOT NULL DEFAULT 0,
  us_eur_micro INTEGER NOT NULL DEFAULT 0, -- ΜΟΝΟ όσα πληρώσαμε εμείς (συνδρομή) — σε αυτό ελέγχεται το ταβάνι
  paid_by     TEXT,                       -- us | balance (τελευταίο)
  PRIMARY KEY (folder_id, month)
);

-- km_bal_hold: ΚΡΑΤΗΣΕΙΣ σε εξέλιξη (ανάγνωση / Κώστας). Γράφεται στη ΔΟΣΟΛΗΨΙΑ της κράτησης, σβήνει όταν η πράξη
-- κλείσει (χρέωση ή επιστροφή). Ό,τι μείνει πάνω από 15′ (Worker κόπηκε, σφάλμα D1) → το ωριαίο cron το ΕΠΙΣΤΡΕΦΕΙ:
-- κράτηση χωρίς αποτέλεσμα δεν γίνεται ποτέ χρέωση (Brief §3).
CREATE TABLE IF NOT EXISTS km_bal_hold (
  op_id       TEXT PRIMARY KEY,
  folder_id   TEXT NOT NULL,
  at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_km_bal_hold_at ON km_bal_hold (at);

-- km_iap_kv: μικρή κατάσταση των καταστημάτων (π.χ. ως πότε ελέγχθηκαν οι ακυρωμένες αγορές της Google).
CREATE TABLE IF NOT EXISTS km_iap_kv (
  k           TEXT PRIMARY KEY,
  v           TEXT,
  updated_at  TEXT NOT NULL
);
