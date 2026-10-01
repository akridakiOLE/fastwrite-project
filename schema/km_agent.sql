-- KM-AGENT (29/9/2026) · Βοηθός Kostometro, Φάση 1 — Brief_Agent_Syndesi_29-09-2026 Μέρος Β.
-- Συνεδρία = μία συζήτηση ανά συσκευή. dev = sha256(install_id + μυστικό), όπως στο km_funnel —
-- ποτέ ωμό install_id. email γράφεται ΜΟΝΟ αν ο χρήστης ζητήσει άνθρωπο (αίτημα KM-E).
-- Τήρηση (kmAgentPrune, ημερήσιο cron): 90 ημέρες χωρίς αίτημα · 24 μήνες με αίτημα (όπως το support).
-- Εικόνες ΔΕΝ αποθηκεύονται ποτέ — στο κείμενο μένει μόνο «[εικόνα]».
CREATE TABLE IF NOT EXISTS km_agent_sessions (
  id         TEXT PRIMARY KEY,
  dev        TEXT NOT NULL,
  src        TEXT,
  lang       TEXT,
  email      TEXT,
  ticket     TEXT,
  consent_at TEXT NOT NULL,
  started    TEXT NOT NULL,
  last_at    TEXT NOT NULL,
  turns      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_km_agent_sessions_dev ON km_agent_sessions(dev, last_at);
CREATE INDEX IF NOT EXISTS idx_km_agent_sessions_last ON km_agent_sessions(last_at);

CREATE TABLE IF NOT EXISTS km_agent_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role       TEXT NOT NULL,
  body       TEXT NOT NULL,
  at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_km_agent_messages_sess ON km_agent_messages(session_id, id);
CREATE INDEX IF NOT EXISTS idx_km_agent_messages_at ON km_agent_messages(role, at);

-- Κόστος ανά ημέρα (UTC), σε μικρο-δολάρια: tokens × τιμή ανά εκατομμύριο = μικρο-$.
CREATE TABLE IF NOT EXISTS km_agent_daily (
  day        TEXT PRIMARY KEY,
  calls      INTEGER NOT NULL DEFAULT 0,
  in_tok     INTEGER NOT NULL DEFAULT 0,
  out_tok    INTEGER NOT NULL DEFAULT 0,
  cache_tok  INTEGER NOT NULL DEFAULT 0,
  usd_micro  INTEGER NOT NULL DEFAULT 0
);

-- v102 (30/9/2026) · ΟΡΙΟ ΖΩΗΣ ΑΝΑ ΣΥΣΚΕΥΗ: ο βοηθός είναι μόνο για την εγκατάσταση — 30 μηνύματα χρήστη
-- ανά συσκευή, για πάντα. ΔΕΝ σβήνεται με τις συζητήσεις (90 ημέρες) — αλλιώς το όριο ξαναγεμίζει.
-- Τήρηση: 24 μήνες από το τελευταίο μήνυμα (kmAgentPrune). dev = hash, όπως παντού.
CREATE TABLE IF NOT EXISTS km_agent_devices (
  dev       TEXT PRIMARY KEY,
  msgs      INTEGER NOT NULL DEFAULT 0,
  first_at  TEXT NOT NULL,
  last_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_km_agent_devices_last ON km_agent_devices(last_at);

-- v106 (1/10/2026) · ΡΑΝΤΕΒΟΥ ΕΠΑΝΑΣΥΝΔΕΣΗΣ — Πολιτική §Α8 (v2.2, έγκριση Stavros 1/10/2026).
-- Γράφεται ΜΟΝΟ αφού ο χρήστης πει ρητά «ναι» στον Κώστα (εργαλείο schedule_followup). ΕΝΑ email τη
-- μέρα due_at (ωριαίο cron), στο email του ΛΟΓΑΡΙΑΣΜΟΥ (km_accounts) — δεν αντιγράφεται εδώ.
-- Ο σύνδεσμος κρατιέται ΜΟΝΟ ως hash (token_hash) και λήγει σε 14 ημέρες. consent_text = τι απάντησε.
-- Τήρηση: 24 μήνες από τη δημιουργία (kmAgentPrune) — ως απόδειξη της συγκατάθεσης.
CREATE TABLE IF NOT EXISTS km_agent_followups (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id    TEXT NOT NULL,
  dev          TEXT NOT NULL,
  created      TEXT NOT NULL,
  due_at       TEXT NOT NULL,
  consent_text TEXT,
  sent_at      TEXT,
  sent_ok      INTEGER,
  token_hash   TEXT,
  token_exp    TEXT,
  used_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_km_agent_followups_due ON km_agent_followups(sent_at, due_at);
CREATE INDEX IF NOT EXISTS idx_km_agent_followups_folder ON km_agent_followups(folder_id, created);
CREATE INDEX IF NOT EXISTS idx_km_agent_followups_token ON km_agent_followups(token_hash);

-- v106 · ΑΔΕΙΑ ΕΠΑΝΑΝΟΙΓΜΑΤΟΣ: μία συζήτηση (έως AGENT_GRANT_MSGS μηνύματα, AGENT_GRANT_HOURS ώρες) σε
-- συσκευή που έχει τελειώσει την εγκατάσταση. Από το email του ραντεβού (via='mail') ή από την
-- Υποστήριξη (via='support', έως AGENT_REOPEN_MONTH τον μήνα ανά λογαριασμό). folder_id NULL = άνοιξε
-- από browser χωρίς λογαριασμό (π.χ. Safari στο iPhone) με το token του email.
CREATE TABLE IF NOT EXISTS km_agent_grants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dev         TEXT NOT NULL,
  folder_id   TEXT,
  via         TEXT NOT NULL,
  granted_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  msgs_left   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_km_agent_grants_dev ON km_agent_grants(dev, expires_at);
CREATE INDEX IF NOT EXISTS idx_km_agent_grants_folder ON km_agent_grants(folder_id, granted_at);
