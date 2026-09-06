-- Kostometro — Η.13 · Η ΝΕΑ ΒΑΣΗ Κ (Brief Γ, Α350 §9.8 Η.13, 6/9/2026)
--
-- Τρέχει ΜΙΑ φορά, ΜΕΤΑ το km.sql, από τον υπολογιστή του Stavros:
--   npx wrangler d1 execute fastwrite-beta-downloads --remote --file=schema/km_h13.sql
-- Τοπικά (δοκιμές):
--   npx wrangler d1 execute fastwrite-beta-downloads --local --file=schema/km.sql
--   npx wrangler d1 execute fastwrite-beta-downloads --local --file=schema/km_h13.sql
--
-- Κανόνας Α400 §Γ: ποτέ DROP, μόνο ADD. Το km_devices ΜΕΝΕΙ όπως είναι.
-- ⚠ Τα δύο ALTER δεν ξανατρέχουν: δεύτερη εκτέλεση βγάζει «duplicate column»
--    — αυτό είναι το σημάδι ότι έχει ήδη τρέξει, όχι σφάλμα.
--
-- ΤΙ ΑΛΛΑΖΕΙ:
--   km_locks        — οι «κλειδαριές» του Κ. Κάθε φάκελος έχει ένα τυχαίο
--                     κλειδί δεδομένων Κ που ο server ΔΕΝ ξέρει. Εδώ ζει το Κ
--                     ΚΛΕΙΔΩΜΕΝΟ (wrapped_k, 60 bytes ως 120 hex) με κλειδί
--                     που βγαίνει από τις 12 λέξεις (kind='words'), αργότερα
--                     από το κλειδί ανάκτησης δύο μισών (kind='recovery') ή
--                     από πρόσκληση PRO (kind='invite'). Αλλαγή λέξεων = νέα
--                     γραμμή με το ίδιο Κ, η παλιά σβήνει. Μηδέν ξανακρυπτογράφηση.
--   km_device_links — (install_id, folder_id) ως κλειδί, ώστε μία συσκευή που
--                     πέρασε από πολλούς λογαριασμούς να ΚΡΑΤΑΕΙ το ιστορικό
--                     (εύρημα 5/9: το km_devices το έσβηνε). Κρατάει και τα
--                     «Ν ανέβαστα» ανά συσκευή — αυτό ρωτάει η νέα συσκευή
--                     ΠΡΙΝ γίνει ενεργή (Free = πορτοφόλι, Α320 6/9).
--   km_devices      — ADD unsynced / unsynced_at, για τον κώδικα που διαβάζει
--                     ακόμα από εκεί.

CREATE TABLE IF NOT EXISTS km_locks (
  lock_id    TEXT PRIMARY KEY,               -- 64 hex, δημόσιο· από τις λέξεις (HKDF «lock») ή τυχαίο
  folder_id  TEXT NOT NULL,
  kind       TEXT NOT NULL,                  -- 'words' | 'recovery' | 'invite'
  auth_hash  TEXT NOT NULL,                  -- SHA-256(auth_token της κλειδαριάς), 64 hex
  wrapped_k  TEXT NOT NULL,                  -- 120 hex: IV(12) + AES-GCM(Κ 32 + tag 16)
  created    TEXT NOT NULL,                  -- ISO-8601 UTC
  created_by TEXT,                           -- install_id της συσκευής που την έφτιαξε
  label      TEXT                            -- προαιρετικό, χωρίς μυστικά
);

CREATE INDEX IF NOT EXISTS idx_km_locks_folder ON km_locks (folder_id);

CREATE TABLE IF NOT EXISTS km_device_links (
  install_id  TEXT NOT NULL,
  folder_id   TEXT NOT NULL,
  name        TEXT,
  created     TEXT NOT NULL,
  last_seen   TEXT,
  user_agent  TEXT,
  unsynced    INTEGER NOT NULL DEFAULT 0,    -- τοπικές αλλαγές που δεν ανέβηκαν (το λέει η συσκευή)
  unsynced_at TEXT,                          -- πότε το είπε τελευταία φορά
  PRIMARY KEY (install_id, folder_id)
);

CREATE INDEX IF NOT EXISTS idx_km_device_links_folder ON km_device_links (folder_id);

ALTER TABLE km_devices ADD COLUMN unsynced INTEGER NOT NULL DEFAULT 0;
ALTER TABLE km_devices ADD COLUMN unsynced_at TEXT;
