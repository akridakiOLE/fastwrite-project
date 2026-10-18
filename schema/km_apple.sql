-- K3β · Ανάκληση token της Apple (18/10/2026) — Apple TN3194.
-- Κανένα email ή token σε καθαρό κείμενο.
CREATE TABLE IF NOT EXISTS km_apple_tokens (
  email_h    TEXT PRIMARY KEY,      -- sha256("apple|" + email)
  sub_h      TEXT,                  -- sha256("apple-sub|" + sub) — για τις ειδοποιήσεις της Apple
  rt_enc     TEXT NOT NULL,         -- AES-GCM(APPLE_TOKEN_KEY), iv||ct, AAD = email_h
  client_id  TEXT,                  -- με ποιο client_id εκδόθηκε (ανάκληση με το ΙΔΙΟ)
  folder_id  TEXT,                  -- NULL μέχρι να υπάρξει λογαριασμός
  created    TEXT NOT NULL,
  updated    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_km_apple_tokens_folder ON km_apple_tokens(folder_id);
CREATE INDEX IF NOT EXISTS idx_km_apple_tokens_sub ON km_apple_tokens(sub_h);
CREATE INDEX IF NOT EXISTS idx_km_apple_tokens_orphan ON km_apple_tokens(folder_id, updated);
-- Ουρά ανάκλησης: ό,τι πρέπει να ανακληθεί, ανεξάρτητα από νέες συνδέσεις του ίδιου email.
CREATE TABLE IF NOT EXISTS km_apple_revoke (
  id         TEXT PRIMARY KEY,      -- τυχαίο
  rt_enc     TEXT NOT NULL,
  aad        TEXT NOT NULL,         -- = id (ή email_h αν δεν ξανασφραγίστηκε)
  client_id  TEXT,
  sub_h      TEXT,                  -- ποιας εξουσιοδότησης (για διερεύνηση)
  reason     TEXT,                  -- delete | orphan
  created    TEXT NOT NULL,
  next_at    TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_km_apple_revoke_next ON km_apple_revoke(next_at);
