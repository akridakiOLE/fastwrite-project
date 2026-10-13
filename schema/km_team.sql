-- KM-PRO-F3 (13/10/2026) — Kostometro PRO · Φάση 3: η ομάδα (Boss / admin / user)
-- Ο server κρατά ΜΟΝΟ: ποιος είναι στην ομάδα, διακόπτες, δημόσια κλειδιά, ίχνος, και
-- σφραγισμένα κομμάτια που ΔΕΝ μπορεί να ανοίξει (δελτίο, προτάσεις). Τίποτα από τιμές.
CREATE TABLE IF NOT EXISTS km_team (
  folder_id   TEXT PRIMARY KEY,
  boss_pub    TEXT NOT NULL,              -- δημόσιο κλειδί P-256 του Boss (raw, base64)
  slip_ver    INTEGER NOT NULL DEFAULT 0, -- έκδοση του δελτίου τιμών
  hist_ver    INTEGER NOT NULL DEFAULT 0, -- έκδοση του ιστορικού (manager με διακόπτη)
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS km_members (
  member_id   TEXT PRIMARY KEY,           -- 32 hex, τυχαίο
  folder_id   TEXT NOT NULL,
  role        TEXT NOT NULL,              -- 'admin' | 'user'
  name        TEXT NOT NULL,
  status      TEXT NOT NULL,              -- 'invited' | 'joined' | 'active' | 'revoked'
  on_duty     INTEGER NOT NULL DEFAULT 1, -- διακόπτης βάρδιας
  until       TEXT,                       -- προαιρετική λήξη (ISO)
  hist        INTEGER NOT NULL DEFAULT 0, -- manager: πρόσβαση σε ιστορικό (μόνο ο Boss)
  manage      INTEGER NOT NULL DEFAULT 0, -- manager: διαχείριση υπαλλήλων (μόνο ο Boss, ανακλητό)
  invite_hash TEXT,                       -- sha256 του κωδικού πρόσκλησης (μία χρήση)
  invite_exp  TEXT,
  auth_hash   TEXT,                       -- sha256 του κωδικού της συσκευής του μέλους
  pub         TEXT,                       -- δημόσιο κλειδί P-256 του μέλους
  wrap_s      TEXT,                       -- το S του δελτίου, κλειδωμένο προς το pub
  s_ver       INTEGER,
  wrap_h      TEXT,                       -- το H του ιστορικού, ΜΟΝΟ manager με διακόπτη
  h_ver       INTEGER,
  device      TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS km_members_folder ON km_members (folder_id);
CREATE UNIQUE INDEX IF NOT EXISTS km_members_invite ON km_members (invite_hash);
CREATE TABLE IF NOT EXISTS km_proposals (
  id          TEXT PRIMARY KEY,           -- 32 hex, από τη συσκευή του μέλους
  folder_id   TEXT NOT NULL,
  member_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  status      TEXT NOT NULL,              -- 'upload' | 'pending' | 'taken' | 'approved' | 'rejected'
  meta        TEXT NOT NULL,              -- σφραγισμένα προς τον Boss (base64) — σβήνεται με το 'taken'
  pages       INTEGER NOT NULL,
  decided_at  TEXT
);
CREATE INDEX IF NOT EXISTS km_proposals_folder ON km_proposals (folder_id, status, created_at);
CREATE INDEX IF NOT EXISTS km_proposals_member ON km_proposals (member_id, created_at);
CREATE TABLE IF NOT EXISTS km_team_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id   TEXT NOT NULL,
  at          TEXT NOT NULL,
  actor       TEXT NOT NULL,              -- 'boss' | 'm:<member_id>'
  kind        TEXT NOT NULL,              -- setup|invite|join|activate|member|revoke|propose|approve|reject
  member_id   TEXT,
  detail      TEXT
);
CREATE INDEX IF NOT EXISTS km_team_log_folder ON km_team_log (folder_id, id);
