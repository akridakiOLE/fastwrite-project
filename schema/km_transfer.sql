-- ═══════════════════════════════════════════════════════════════════════════
-- km_transfers — ΜΕΤΑΦΟΡΑ ΛΟΓΑΡΙΑΣΜΟΥ ΜΕ QR (v120 · Brief Γ, απόφαση Stavros 6/10/2026)
--
-- Η Συσκευή Α κλειδώνει (AES-GCM) τα στοιχεία του λογαριασμού με ένα τυχαίο
-- κλειδί Τ που ζει ΜΟΝΟ μέσα στο QR (μετά το # — δεν φτάνει ποτέ σε εμάς).
-- Εδώ φυλάμε ΜΟΝΟ το κλειδωμένο πακέτο, για 10 λεπτά, μία χρήση.
-- Δεν μπορούμε να το ανοίξουμε. Η Συσκευή Β το παίρνει ΜΟΝΟ με απόδειξη
-- του email του λογαριασμού (κωδικός ή Google/Microsoft).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS km_transfers (
  tid_hash    TEXT PRIMARY KEY,   -- sha256 του αναγνωριστικού· το καθαρό ζει μόνο στο QR
  folder_id   TEXT NOT NULL,
  blob        TEXT NOT NULL,      -- κλειδωμένο πακέτο (base64url), δεν ανοίγει στον server
  from_device TEXT NOT NULL,
  created     TEXT NOT NULL,
  expires     TEXT NOT NULL,
  taken       TEXT                -- πότε το πήρε η Β · NULL = εκκρεμεί
);
CREATE INDEX IF NOT EXISTS idx_km_transfers_folder ON km_transfers (folder_id, created);
