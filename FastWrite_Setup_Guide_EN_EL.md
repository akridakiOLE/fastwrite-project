# FastWrite — Setup Guide / Οδηγός Εγκατάστασης

**AI Invoice & Bill Extraction for Xero** · Windows

---

## 🇬🇧 English

### Requirements
- A Windows PC
- A **Xero account** (you connect your own — see Step 3)
- A **Google Gemini API key** (free to create — see Step 2)

### Install & first launch
1. **Download** FastWrite from the link we sent you (a `.zip` file).
2. **Right-click the `.zip` → Extract All…**, then open the extracted **`FastWrite`** folder and **double-click `FastWrite.exe`**.
   *(Run it from the extracted folder — not from inside the zip.)*
3. If Windows shows a blue **"Windows protected your PC"** screen, click **More info → Run anyway**. This appears only because the app is not yet code-signed; it is safe to run.

### First-time setup (3 steps)

**Step 1 — Create your FastWrite account**
1. On first launch you'll see a **login** screen. Click **Register**.
2. Choose a **username** and **password** and submit.
3. This account is stored **only on your computer** — it is not a website login. You get a **free trial of 100 documents**; no license key is needed.

> Each user creates their own local account on their own PC.

**Step 2 — Add your Gemini API key (BYOK)**
1. Go to **Google AI Studio**: https://aistudio.google.com
2. Sign in with a Google account and click **Get API key → Create API key**.
3. **Copy** the key.
4. In FastWrite, open **Settings** and paste it into the **Gemini API key** field, then **Save**.

> You bring your own key (BYOK). You pay Google directly for AI usage. The key is stored **encrypted on your computer** — it never leaves your machine to us.

**Step 3 — Connect your Xero account**
1. You need an **existing Xero account**. If you don't have one, create a free account / start a trial / use the free **Demo Company** at https://www.xero.com first.
2. In FastWrite **Settings**, click **Connect to Xero**.
3. You'll be redirected to **Xero** — log in and choose the **organisation** to connect.
4. **Review and authorize** the permissions FastWrite requests.
5. You're returned to FastWrite, now connected. You can **Disconnect** anytime from Settings.

> "Connect to Xero" uses secure **OAuth 2.0**. It does **not** create a Xero account — it links FastWrite to *your* existing Xero organisation. No secret keys are stored in the app.

### That's it
Upload an invoice or bill → FastWrite extracts the data with AI → review → push to Xero.

---

## 🇬🇷 Ελληνικά

### Προϋποθέσεις
- Υπολογιστής με **Windows**
- Ένας **λογαριασμός Xero** (συνδέεις τον δικό σου — δες Βήμα 3)
- Ένα **Google Gemini API key** (δωρεάν δημιουργία — δες Βήμα 2)

### Εγκατάσταση & πρώτο άνοιγμα
1. **Κατέβασε** το FastWrite από το link που σου στείλαμε (αρχείο `.zip`).
2. **Δεξί κλικ στο `.zip` → Extract All… (Εξαγωγή όλων)**, μετά άνοιξε τον φάκελο **`FastWrite`** που βγήκε και κάνε **διπλό κλικ στο `FastWrite.exe`**.
   *(Τρέξ' το από τον εξαγμένο φάκελο — όχι μέσα από το zip.)*
3. Αν εμφανιστεί μπλε παράθυρο **«Windows protected your PC»**, πάτα **More info → Run anyway**. Εμφανίζεται μόνο επειδή η εφαρμογή δεν είναι ακόμα code-signed· είναι ασφαλές να την τρέξεις.

### Πρώτη ρύθμιση (3 βήματα)

**Βήμα 1 — Φτιάξε λογαριασμό FastWrite**
1. Στο πρώτο άνοιγμα θα δεις οθόνη **login**. Πάτα **Εγγραφή (Register)**.
2. Διάλεξε **username** και **password** και υπόβαλε.
3. Ο λογαριασμός αποθηκεύεται **μόνο στον υπολογιστή σου** — δεν είναι login ιστοσελίδας. Παίρνεις **δωρεάν trial 100 εγγράφων**· δεν χρειάζεται κλειδί άδειας (license).

> Ο κάθε χρήστης φτιάχνει τον δικό του τοπικό λογαριασμό στον δικό του υπολογιστή.

**Βήμα 2 — Βάλε το δικό σου Gemini API key (BYOK)**
1. Πήγαινε στο **Google AI Studio**: https://aistudio.google.com
2. Κάνε login με λογαριασμό Google και πάτα **Get API key → Create API key**.
3. **Αντίγραψε** το key.
4. Στο FastWrite, άνοιξε τις **Ρυθμίσεις**, επικόλλησέ το στο πεδίο **Gemini API key** και πάτα **Αποθήκευση**.

> Φέρνεις το δικό σου key (BYOK). Πληρώνεις εσύ τη Google για τη χρήση του AI. Το key αποθηκεύεται **κρυπτογραφημένο στον υπολογιστή σου** — δεν φεύγει ποτέ προς εμάς.

**Βήμα 3 — Σύνδεσε τον λογαριασμό σου στο Xero**
1. Χρειάζεσαι **υπάρχοντα λογαριασμό Xero**. Αν δεν έχεις, φτιάξε δωρεάν λογαριασμό / ξεκίνα trial / χρησιμοποίησε τη δωρεάν **Demo Company** στο https://www.xero.com πρώτα.
2. Στις **Ρυθμίσεις** του FastWrite, πάτα **Connect to Xero**.
3. Θα μεταφερθείς στο **Xero** — κάνε login και διάλεξε το **organisation** που θες να συνδέσεις.
4. **Έλεγξε και εξουσιοδότησε** τα δικαιώματα που ζητά το FastWrite.
5. Επιστρέφεις στο FastWrite, πλέον συνδεδεμένος. Μπορείς να κάνεις **Disconnect** όποτε θες από τις Ρυθμίσεις.

> Το «Connect to Xero» χρησιμοποιεί ασφαλές **OAuth 2.0**. **Δεν** δημιουργεί λογαριασμό Xero — συνδέει το FastWrite με το *δικό σου* υπάρχον Xero organisation. Κανένα μυστικό κλειδί δεν αποθηκεύεται στην εφαρμογή.

### Έτοιμος
Ανέβασε ένα τιμολόγιο → το FastWrite εξάγει τα δεδομένα με AI → έλεγξε → push στο Xero.

---

*FastWrite · fastwrite.tech · Windows-only (v1)*
