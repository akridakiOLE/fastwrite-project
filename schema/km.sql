-- Kostometro — μητρώο εγκαταστάσεων + σφραγισμένοι φάκελοι (Brief Α, Α350 §9.8 Η.1)
--
-- Τρέχει ΜΙΑ φορά, από τον υπολογιστή του Stavros:
--   npx wrangler d1 execute fastwrite-beta-downloads --remote --file=schema/km.sql
--
-- Ίδια D1 με το /gnomi (fastwrite-beta-downloads), ΞΕΧΩΡΙΣΤΟΙ πίνακες km_*.
-- Κανόνας Α400 §Γ: ποτέ DROP, μόνο ADD COLUMN σε πίνακα παραγωγής.
--
-- ΤΙ ΕΙΝΑΙ ΑΝΑΓΝΩΣΙΜΟ ΕΔΩ (Ζ.6 + Η.1): email · id εγκατάστασης · πηγή · ref ·
-- ημερομηνία · χώρα · κλειδί ναι/όχι · ενεργή συσκευή · μέγεθος/έκδοση φακέλου.
-- ΠΟΤΕ: φωτογραφία, ποσό, ΦΠΑ, προμηθευτής. Ο ίδιος ο φάκελος ζει στο R2 ως
-- κρυπτογραφημένο μπλοκ που ο server ΔΕΝ μπορεί να ανοίξει.
--
-- Ταυτότητα (Η.1): από τις 12 λέξεις η συσκευή παράγει folder_id (δημόσιο
-- αναγνωριστικό) και auth_token (κωδικός πρόσβασης). Εδώ κρατιέται ΜΟΝΟ το
-- SHA-256 του auth_token. Το κλειδί κρυπτογράφησης δεν φτάνει ποτέ εδώ.
-- Το email ΜΟΝΟ ΤΟΥ δεν αρκεί ποτέ για ανάκτηση (Γ.5).

CREATE TABLE IF NOT EXISTS km_accounts (
  folder_id        TEXT PRIMARY KEY,          -- 64 hex, από τις 12 λέξεις
  auth_hash        TEXT NOT NULL,             -- SHA-256(auth_token), 64 hex
  email            TEXT NOT NULL,
  created          TEXT NOT NULL,             -- ISO-8601 UTC
  country          TEXT,                      -- από Cloudflare, όχι IP
  source           TEXT,                      -- 'link' | 'store:play' | 'store:ms' | 'store:apple'
  ref              TEXT,                      -- κωδικός σύστασης (?ref=), αν υπήρξε
  has_key          INTEGER DEFAULT 0,         -- χρησιμοποιεί κλειδί Gemini: 1/0
  plan             TEXT,                      -- NULL = δωρεάν. Προβλέπεται για Pro, καμία λογική τώρα.
  active_device_id TEXT,                      -- η ΜΙΑ συσκευή που γράφει (Η.3)
  active_since     TEXT,
  folder_version   INTEGER NOT NULL DEFAULT 0,-- ανεβαίνει σε κάθε ανέβασμα
  folder_bytes     INTEGER NOT NULL DEFAULT 0,
  last_sync        TEXT,
  deleted          TEXT                       -- πότε ζητήθηκε διαγραφή (Γ.6). NULL = ζωντανός.
);

CREATE INDEX IF NOT EXISTS idx_km_accounts_email   ON km_accounts (email);
CREATE INDEX IF NOT EXISTS idx_km_accounts_created ON km_accounts (created);

CREATE TABLE IF NOT EXISTS km_devices (
  install_id  TEXT PRIMARY KEY,               -- id εγκατάστασης (τυχαίο, στη συσκευή)
  folder_id   TEXT NOT NULL,
  name        TEXT,                           -- π.χ. 'Galaxy A23' — το δίνει ο browser, όχι ο χρήστης
  created     TEXT NOT NULL,
  last_seen   TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_km_devices_folder ON km_devices (folder_id);
