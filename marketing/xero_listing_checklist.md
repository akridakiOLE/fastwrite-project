# FastWrite — Xero App Store Listing Checklist

Σκοπός: όλα τα visual + text assets που χρειάζεται το Xero App Store listing, με τι ακριβώς να τραβήξουμε σε screenshots. Πηγές στο τέλος.

---

## 1. Visual assets που ζητά η Xero

| Asset | Απαίτηση Xero | Κατάσταση FastWrite |
|---|---|---|
| Logo | **SVG format** | ✅ έχουμε (`branding/fastwrite-lockup-*.svg` + `fastwrite-icon.svg`) — να γίνει outline για production |
| Logo background colour | Χρώμα swatch πίσω από το logo στο listing tile | Πρόταση: `#0E1116` (σκούρο) ή λευκό — δοκιμή και των δύο |
| Placeholder / cover image | 1η εικόνα που βλέπει ο χρήστης | = Screenshot #1 παρακάτω |
| Screenshots / images | **Έως 6** εικόνες | 0/6 — βλ. πλάνο §3 |
| Video (optional) | Video provider + Video ID | = το demo video (επόμενο asset) |

**Σύσταση spec για screenshots** (η Xero δεν δημοσιεύει αυστηρά pixel specs — το portal επιβάλλει όρια στο upload): PNG, landscape **16:10**, ~**1600×1000px** (min 1280×800), καθαρό σκούρο theme του app. Επιβεβαίωση ακριβών ορίων στην οθόνη upload του partner portal.

---

## 2. Text assets που ζητά η Xero

| Πεδίο | Όριο | Κατάσταση |
|---|---|---|
| Short description | 300 χαρακτήρες | pending draft |
| About | 3.000 χαρακτήρες | pending draft |
| Integration details | 3.000 χαρακτήρες | pending draft |
| Getting started | 3.000 χαρακτήρες | pending draft |

Η Xero θέλει να είναι ξεκάθαρο: τι κάνει το app, ποιες αγορές εξυπηρετεί (UK/IE/AU/NZ), και **τι data σπρώχνει/τραβά από το Xero** (εμείς: push DRAFT Bills, read contacts + chart of accounts).

---

## 3. Πλάνο 6 screenshots (το user story του FastWrite)

Τράβα τα με καθαρά demo δεδομένα (όχι πραγματικά τιμολόγια πελατών).

1. **Κεντρική οθόνη / dashboard** — η πρώτη εντύπωση. Καθαρό UI, branding ορατό. (= cover/placeholder image)
2. **Upload + AI extraction** — το έγγραφο από τη μία πλευρά, τα εξαγόμενα structured πεδία από την άλλη. Δείχνει τον πυρήνα της αξίας.
3. **Review & validation** — η οθόνη ελέγχου με validation highlights, ώστε να φαίνεται ότι ο χρήστης ελέγχει πριν στείλει.
4. **Xero Settings** — η κάρτα σύνδεσης με Xero σε κατάσταση "Connected" (πράσινο dot), με connect/disconnect/status.
5. **Push to Xero modal** — το preview πριν το push: line items, account code, κουμπί "Push as DRAFT". Τονίζει το DRAFT-only.
6. **Το αποτέλεσμα ΜΕΣΑ στο Xero** — το DRAFT Bill όπως εμφανίζεται στο Xero UI. **Η Xero το ζητά ρητά**: αν σπρώχνεις data, δείξε πώς φαίνονται μέσα στο Xero.

---

## 4. Xero brand compliance (να μην κοπεί στο review)

- Ακολούθησε τα Xero app partner brand guidelines για τη χρήση του ονόματος/λογότυπου Xero (π.χ. "connected app", όχι υπονοούμενη υποστήριξη/endorsement).
- Συμβατό με το ToS §6.3 disclaimer που γράψαμε ("not affiliated with / endorsed by Xero").
- Μην τοποθετείς το λογότυπο της Xero μέσα στο δικό σου logo.

---

## 5. Επόμενα βήματα (σειρά)

1. Τράβηγμα 6 screenshots κατά §3 (χρειάζεται running app + Xero Demo org).
2. Draft των 4 text πεδίων (§2) — μπορώ να τα γράψω.
3. Demo video (separate asset).
4. Outline του logo σε paths + PNG exports (Φάση Ε, λίγο πριν submission).

---

## Πηγές

- Xero App Store listing — https://developer.xero.com/documentation/xero-app-store/app-partner-guides/app-listing/
- Certification checkpoints — https://developer.xero.com/documentation/xero-app-store/app-partner-guides/certification-checkpoints/
- App partner brand guidelines (PDF) — https://developer.xero.com/static/otherfiles/xero-app-partner-brand-guidelines.pdf
- App partner support documentation guidelines — https://developer.xero.com/partner/partner-resources/app-partner-support-documentation-guidelines
