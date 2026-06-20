# FastWrite — Xero Competitor Legal Audit

**Ημερομηνία:** 11 Ιουνίου 2026
**Σκοπός:** Σύγκριση των Privacy Policy / Terms of Service ανταγωνιστικών invoice-extraction apps στο Xero, ως benchmark για τα νομικά κείμενα του FastWrite πριν το Xero Marketplace submission.
**Ανταγωνιστές που ελέγχθηκαν:** Datamolino (πλήρες κείμενο), Dext (market leader), Lightyear.

---

## Βασικό εύρημα

Όλοι οι ανταγωνιστές είναι **υψηλότερου νομικού ρίσκου** από το FastWrite — και παρ' όλα αυτά αρκούνται σε απλά, τυποποιημένα κείμενα (χωρίς εμφανή «premium» νομική επιμέλεια).

- Datamolino, Dext, Lightyear **αποθηκεύουν** τα δεδομένα του χρήστη σε servers (π.χ. AWS) και είναι **Data Controllers**.
- Το FastWrite κρατά τα πάντα **local + BYOK** — δεν βλέπει ούτε τιμολόγια, ούτε extracted data, ούτε API keys.

**Συμπέρασμα:** Το νομικό βάρος του FastWrite είναι **μικρότερο**, όχι μεγαλύτερο. Η στρατηγική (own-country jurisdiction, αυτο-σύνταξη + light review αντί ακριβού δικηγόρου) επιβεβαιώνεται.

---

## Σύγκριση κρίσιμων ρητρών

| Ρήτρα | Datamolino | Dext | Lightyear | FastWrite (draft) |
|---|---|---|---|---|
| Accuracy disclaimer | «Δεν είμαστε λογιστική υπηρεσία· δεν εγγυόμαστε ακρίβεια· ο χρήστης ελέγχει πριν χρησιμοποιήσει» | Δεν ευθύνεται για ποιότητα/ακρίβεια data | «as is», no warranty of accuracy | ✅ Ίδιο (Risk #1) |
| AS-IS warranty | Πλήρες caps-lock disclaimer (merchantability, fitness) | Ναι | Ναι | ✅ Ίδιο |
| Liability cap | Μεγαλύτερο των €20 ή 3 μηνών fees | Cap + αποκλεισμός indirect damages | «max extent permitted by law» | €100 ή 12μ fees |
| Governing law | Σλοβακία, αποκλειστικά σλοβάκικα δικαστήρια | UK | — | ✅ Κύπρος / Λευκωσία (ίδια λογική) |
| Data residency | Εκτός χώρας με safeguards (AWS) | Servers | Servers | Δεν αποθηκεύει (πλεονέκτημα) |
| Controller / Processor | Data Controller | Controller + DPA | Controller | Σχεδόν τίποτα (διαφορετικό) |
| Ηλικία / B2B | Όχι κάτω των 18· B2B | B2B | — | ✅ Ίδιο |
| Ξεχωριστό DPA | Ναι (Data Processing Agreement) | Ναι (Data Processor Agreement) | — | Δεν χρειάζεται |

---

## Gap analysis — τι σημαίνει για τα κείμενα του FastWrite

**1. Επικύρωση, όχι αλλαγή.** Η δομή του FastWrite (own-country jurisdiction + AS-IS + accuracy disclaimer με «ο χρήστης ελέγχει» + B2B/18+) είναι ακριβώς ό,τι κάνει το Datamolino. Είναι standard — δεν απαιτείται δικηγόρος για να φτάσει σε αυτό το επίπεδο.

**2. Liability cap.** Το Datamolino βάζει floor μόλις €20. Το €100 του FastWrite είναι εντός λογικής. Σύσταση: «όποιο **μικρότερο**» (whichever is lower) — αφού το base tier είναι δωρεάν, γειώνει την ευθύνη στο ελάχιστο, όπως κάνει και το Datamolino με το «greater of €20».

**3. Δύο σημεία που το FastWrite έχει και οι ανταγωνιστές ΔΕΝ έχουν (ευκαιρία marketing + νομική ασπίδα):**
- Ρητή δήλωση: «we do not store your invoices or financial data — everything stays on your device». Αληθές, διαφοροποιεί, μειώνει το GDPR surface.
- BYOK disclaimer (ο χρήστης πληρώνει/ευθύνεται για το δικό του Google key). Κανείς ανταγωνιστής δεν το έχει γιατί δεν κάνουν BYOK.

**4. Κενό να καλυφθεί προληπτικά:** Το Datamolino έχει ξεχωριστό Data Processing Agreement (γιατί είναι controller). Το FastWrite δεν χρειάζεται DPA — αλλά καλό είναι να εξηγεί **γιατί**, με μία πρόταση: «FastWrite processes no customer financial data on its servers; data is processed locally under the user's own Gemini key». Προλαβαίνει την ερώτηση στο Xero certification review.

---

## Τελικό συμπέρασμα

Τίποτα στα κείμενα των ανταγωνιστών δεν είναι κάτι που το FastWrite δεν μπορεί να αναπαράγει μόνο του ή με light online review. Η αρχιτεκτονική local + BYOK βάζει το FastWrite σε **χαμηλότερο** ρίσκο από όλους τους ανταγωνιστές. Το πιο αδύναμο σημείο τους (data residency, controller obligations, DPA) είναι ακριβώς εκεί που το FastWrite είναι καθαρό.

---

## Πηγές

- Datamolino Terms of Service — https://www.datamolino.com/legal/terms-of-service/
- Datamolino Privacy — https://www.datamolino.com/legal/privacy/
- Dext Data Processor Agreement — https://dext.com/en/data-processor-agreement
- Lightyear Terms — https://lightyear.ai/terms-of-use
