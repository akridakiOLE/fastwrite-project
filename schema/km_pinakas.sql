-- ΠΙΝΑΚΑΣ ΕΛΕΓΧΟΥ — index για φίλτρα και κλίμακα (16/9/2026)
--
-- Αιτία: ο πίνακας φιλτράρει με ημερομηνία, πηγή, σύσταση, χώρα και email,
-- και σελιδοποιεί. Στα 1000+ μέλη κάθε τέτοιο ερώτημα χωρίς index είναι
-- πλήρης σάρωση του km_accounts. Σχεδιάζουμε για το ΜΕΓΑΛΟ, όχι για σήμερα.
--
-- Υπάρχουν ήδη: idx_km_accounts_email, idx_km_accounts_created,
--               idx_km_accounts_delete_due, idx_km_device_links_folder.
-- ΠΟΤΕ DROP. Μόνο προσθήκη. Τρέχει πολλές φορές χωρίς ζημιά.

-- Η ραχοκοκαλιά: σχεδόν κάθε ερώτημα του πίνακα είναι
-- «ζωντανοί, με σειρά εγγραφής». Σύνθετο index, όχι δύο ξεχωριστά.
CREATE INDEX IF NOT EXISTS idx_km_accounts_live_created ON km_accounts (deleted, created);

-- Ομαδοποιήσεις και φίλτρα (α) από πού · (γ) ποιος σύστησε · χώρα · πλάνο
CREATE INDEX IF NOT EXISTS idx_km_accounts_source   ON km_accounts (source);
CREATE INDEX IF NOT EXISTS idx_km_accounts_ref      ON km_accounts (ref);
CREATE INDEX IF NOT EXISTS idx_km_accounts_country  ON km_accounts (country);
CREATE INDEX IF NOT EXISTS idx_km_accounts_plan     ON km_accounts (plan);

-- «ενεργοί τις τελευταίες Ν ημέρες»
CREATE INDEX IF NOT EXISTS idx_km_accounts_lastsync ON km_accounts (last_sync);

-- συσκευές: ο πίνακας μετράει «πόσες συσκευές ανά λογαριασμό» και
-- «πόσες είδαμε τις τελευταίες 7 ημέρες»
CREATE INDEX IF NOT EXISTS idx_km_device_links_seen ON km_device_links (last_seen);
