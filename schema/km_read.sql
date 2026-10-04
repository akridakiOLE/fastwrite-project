-- v113 · KM-READ-GIFT — «Δώρο 20 αναγνώσεων με τον Κώστα (AI)» (Brief 4/10/2026, έγκριση Stavros)
-- Μετρητής ΑΝΑ ΛΟΓΑΡΙΑΣΜΟ (όχι ανά συσκευή — αλλιώς επανεγκατάσταση = νέα 20).
-- ΚΑΜΙΑ εικόνα, κανένα ποσό, κανένα κείμενο τιμολογίου δεν γράφεται ΠΟΥΘΕΝΑ: μόνο μετρητές.
CREATE TABLE IF NOT EXISTS km_read_gift (
  folder_id    TEXT PRIMARY KEY,
  activated_at TEXT NOT NULL,          -- πότε πάτησε «Ενεργοποίηση» (= συγκατάθεση)
  consent      TEXT NOT NULL,          -- ποιο κείμενο συγκατάθεσης είδε (π.χ. 'v113-el')
  used         INTEGER NOT NULL DEFAULT 0,
  last_at      TEXT,
  win_at       TEXT,                   -- αρχή του τρέχοντος λεπτού (όριο ρυθμού)
  win_n        INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS km_read_daily (
  day       TEXT PRIMARY KEY,          -- YYYY-MM-DD (UTC)
  calls     INTEGER NOT NULL DEFAULT 0,
  ok        INTEGER NOT NULL DEFAULT 0,
  fail      INTEGER NOT NULL DEFAULT 0,
  in_tok    INTEGER NOT NULL DEFAULT 0,
  out_tok   INTEGER NOT NULL DEFAULT 0,
  usd_micro INTEGER NOT NULL DEFAULT 0
);
