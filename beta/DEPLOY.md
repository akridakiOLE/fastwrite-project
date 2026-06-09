# FastWrite Private Beta — Deploy Guide

Στήνει το **`beta.fastwrite.tech`** (ξεχωριστό Cloudflare Worker, ΔΕΝ αγγίζει το
production `fastwrite.tech`). Σερβίρει τη landing page και ένα `/download` route
που καταγράφει κάθε download ανά tester (`?ref=`) σε D1 και μετά κάνει redirect
στο installer (.zip) που φιλοξενείται στα **GitHub Releases**.

> Τρέξε τις `wrangler` εντολές μέσα από τον φάκελο `beta/`:
> ```
> cd C:\Users\User\fastwrite-project\beta
> ```

---

## 0. Προαπαιτούμενα (έγινε)

```powershell
npx wrangler login        # logged in ως stavrosfkallenos@gmail.com
```

---

## 1. Installer .zip (έγινε)

```powershell
cd C:\Users\User\fastwrite-project
powershell -command "Compress-Archive -Path dist\FastWrite -DestinationPath FastWrite-Windows.zip -Force"
```
Επαληθεύτηκε: integrity OK, δομή `FastWrite/` + `FastWrite.exe` + `_internal/`.

---

## 2. GitHub Release (host του .exe — χωρίς κάρτα)

1. Πήγαινε: **https://github.com/akridakiOLE/fastwrite-project/releases/new**
2. **Choose a tag** → γράψε **ακριβώς** `beta-v1` → *Create new tag on publish*.
3. **Release title:** `FastWrite Windows (private beta)`.
4. **Attach binaries** → σύρε/ανέβασε το `C:\Users\User\fastwrite-project\FastWrite-Windows.zip`
   (περίμενε να φτάσει 100% το upload — ~80MB).
5. (Προαιρετικό) τσέκαρε **Set as a pre-release**.
6. Πάτα **Publish release**.

Έτσι το αρχείο γίνεται διαθέσιμο στο σταθερό URL:
```
https://github.com/akridakiOLE/fastwrite-project/releases/download/beta-v1/FastWrite-Windows.zip
```
> Αυτό το URL είναι ήδη μέσα στο `src/worker.js`. Αν αλλάξεις tag ή όνομα αρχείου,
> άλλαξε και το `DOWNLOAD_URL` εκεί.
>
> Νέο build αργότερα: ανέβασε νέο asset (νέο tag) και ενημέρωσε το `DOWNLOAD_URL`.

---

## 3. D1 database + schema

```powershell
cd C:\Users\User\fastwrite-project\beta
npx wrangler d1 create fastwrite-beta-downloads
```
Τυπώνει ένα `database_id`. **Αντίγραψέ το** στο `beta/wrangler.toml`
(γραμμή `database_id = "PASTE_D1_DATABASE_ID_HERE"`). Μετά:
```powershell
npx wrangler d1 execute fastwrite-beta-downloads --remote --file=schema.sql
```

---

## 4. Deploy

```powershell
npx wrangler deploy
```
Στο πρώτο deploy ο wrangler δημιουργεί αυτόματα το DNS record για το
`beta.fastwrite.tech` (custom domain, SSL αυτόματα).

---

## 5. Test (με αυτή τη σειρά)

1. Άνοιξε το `...workers.dev` URL που τυπώνει το deploy → δες τη landing.
2. Πάτα **Download** → πρέπει να σε στείλει στο GitHub και να κατέβει το `.zip`.
3. Δοκίμασε με ref: `...workers.dev/?ref=test` → Download → καταγράφεται.
4. Μετά δοκίμασε **`https://beta.fastwrite.tech`** (1-2 λεπτά για το SSL αρχικά).

---

## 6. Links ανά tester

```
https://beta.fastwrite.tech/?ref=acme-bookkeeping
https://beta.fastwrite.tech/?ref=smith-accounting
```
Το `?ref=` περνά αυτόματα στο `/download` και καταγράφεται.

---

## 7. Δες ποιος κατέβασε (download funnel)

```powershell
cd C:\Users\User\fastwrite-project\beta
npx wrangler d1 execute fastwrite-beta-downloads --remote --command="SELECT ref, COUNT(*) AS downloads, MAX(ts) AS last_download FROM downloads GROUP BY ref ORDER BY downloads DESC;"
```
> **GDPR:** καταγράφουμε `ref + timestamp + country (coarse) + user-agent` — **ΟΧΙ raw IP**.
> Όταν περάσει το privacy policy από τον δικηγόρο, βεβαιώσου ότι αναφέρει το download logging.

---

## 8. Production site — διόρθωση Germany→Finland (ΞΕΧΩΡΙΣΤΟ deploy)

Διορθώθηκαν 3 σημεία σε `site/index.html` + `site/legal/privacy.html`
(Germany → Helsinki, Finland). Για να βγει live:
```powershell
cd C:\Users\User\fastwrite-project
npx wrangler deploy          # production Worker (name = fastwrite-project), μόνο κείμενο
```

---

## Git

Το `FastWrite-Windows.zip` είναι ήδη στο `.gitignore` (δεν μπαίνει στο repo —
ζει στα GitHub Releases). Commit: `beta/` + διορθώσεις `site/` + τα recovered
`.md`. Branch: `master`.
