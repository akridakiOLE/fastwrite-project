# FastWrite Desktop — Phase 1 PoC

## Στόχος

Επιβεβαίωση ότι όλη η FastWrite ροή (upload → extract → review → approve) δουλεύει
σε **native desktop παράθυρο** (pywebview), χρησιμοποιώντας το ίδιο Flask backend
που τρέχει στο production web app.

**Σε αυτή τη φάση** χρειάζεται Python στο dev μηχάνημα.
**Στο Phase 4** το PyInstaller θα δημιουργήσει standalone `.exe` — ο τελικός χρήστης
**δεν θα χρειάζεται Python**.

---

## Πρώτη εγκατάσταση (μία φορά)

### 1. Άνοιξε CMD στο root του project

```cmd
cd C:\Users\User\fastwrite-project
```

### 2. Δημιούργησε virtual environment

```cmd
python -m venv venv
```

### 3. Ενεργοποίησε το venv και εγκατέστησε τις dependencies

```cmd
venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements-desktop.txt
```

(Η εγκατάσταση παίρνει 3-5 λεπτά, κατεβάζει ~200MB.)

### 4. Πρόσθεσε Gemini API key

Δημιούργησε αρχείο `%APPDATA%\FastWrite\secrets\gemini.key` με το API key σου ως
περιεχόμενο (1 γραμμή, χωρίς newline στο τέλος).

Από CMD:
```cmd
mkdir "%APPDATA%\FastWrite\secrets" 2>nul
echo TO_API_KEY_SOU_EDW > "%APPDATA%\FastWrite\secrets\gemini.key"
```

(Αντικατέστησε `TO_API_KEY_SOU_EDW` με το πραγματικό key από
https://aistudio.google.com/apikey)

---

## Τρέξιμο

```cmd
cd C:\Users\User\fastwrite-project
venv\Scripts\activate
python desktop\main.py
```

Αναμενόμενα:
- Logs στο terminal δείχνουν "Starting Flask backend..." και "Άνοιγμα native παραθύρου..."
- Ανοίγει native παράθυρο 1400x900 με τη FastWrite UI
- Πρώτη φορά: register νέο user, μετά login

---

## Πού αποθηκεύονται τα δεδομένα

| Φάκελος | Περιεχόμενο |
|---|---|
| `%APPDATA%\FastWrite\data\app.db` | SQLite βάση (users, docs, schemas) |
| `%APPDATA%\FastWrite\secrets\gemini.key` | Gemini API key |
| `%APPDATA%\FastWrite\uploads\` | Ανεβασμένα PDFs |
| `%APPDATA%\FastWrite\processed\` | Επεξεργασμένα PNG previews |
| `%APPDATA%\FastWrite\exports\` | Εξαγωγές (Excel, JSON) |

Για να ξεκινήσεις από την αρχή, σβήσε ολόκληρο τον φάκελο `%APPDATA%\FastWrite\`.

---

## Troubleshooting

**Πρόβλημα:** `'python' is not recognized`
→ Η Python δεν είναι στο PATH. Reinstall με checked το "Add to PATH".

**Πρόβλημα:** `pywebview` δεν εμφανίζει παράθυρο
→ Στα Windows το pywebview χρησιμοποιεί Edge WebView2 (συνήθως εγκατεστημένο).
   Αν λείπει: https://developer.microsoft.com/microsoft-edge/webview2/

**Πρόβλημα:** `ModuleNotFoundError: No module named 'main_api'`
→ Τρέξε από το **project root** (`C:\Users\User\fastwrite-project`), όχι από το `desktop\`.
