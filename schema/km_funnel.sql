-- v97 · KM-FUNNEL (27/9/2026) — ΧΩΝΙ ΕΓΓΡΑΦΗΣ, ανά προέλευση (?src=).
-- Γιατί: μετά τη διανομή στους 93 leads, 0 εγγραφές σε 7 ώρες — και ΚΑΜΙΑ μέτρηση για το
-- αν δεν πάτησε κανείς ή αν πάτησαν και σταμάτησαν σε κάποιο βήμα (κωδικός, λέξεις, κλειδί).
-- Μία γραμμή ανά ΣΥΣΚΕΥΗ ανά ΒΗΜΑ (PK) — άρα κάθε αριθμός = μοναδικές συσκευές, όχι πατήματα.
-- ΚΑΝΕΝΑ email, ΚΑΜΙΑ IP. Η συσκευή γράφεται ως sha256(install_id + μυστικό), όχι ωμή.
-- Τήρηση: 24 μήνες (όπως η γνώμη).
CREATE TABLE IF NOT EXISTS km_funnel (
  dev      TEXT NOT NULL,   -- sha256(install_id + KM_ADMIN_KEY), 64 hex
  step     TEXT NOT NULL,   -- open · email · code · account · key · key_skip
  src      TEXT NOT NULL,   -- direct · leads · fasi3 · ref · fb_cy …
  at       TEXT NOT NULL,   -- ISO-8601 UTC, πρώτη φορά
  PRIMARY KEY (dev, step)
);
CREATE INDEX IF NOT EXISTS ix_km_funnel_at ON km_funnel(at, src, step);
