-- K3 (14/10/2026) · μετάβαση παραγωγής για την είσοδο από την εφαρμογή καταστήματος.
-- Τρέχει ΠΡΙΝ το deploy της v131 (κανόνας 15/8). Ιδεμποτικό: «duplicate column» = έχει ήδη τρέξει.
ALTER TABLE km_oauth_states ADD COLUMN app_ch TEXT;
CREATE TABLE IF NOT EXISTS km_oauth_handoff (h_hash TEXT PRIMARY KEY, app_ch TEXT NOT NULL, frag TEXT NOT NULL, created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_km_oauth_handoff_created ON km_oauth_handoff(created);
