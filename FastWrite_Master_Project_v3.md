# 📄 FastWrite — Master Project File v3
**AI Document Extractor | 8 Μαρτίου 2026 | fastwrite.duckdns.org**

---

## ✅ Φάση 1: ΟΛΟΚΛΗΡΩΘΗΚΕ — 203/203 Tests Passed

| # | Module | Αρχείο | Λειτουργία | Tests |
|---|--------|--------|------------|-------|
| 1 | Database Manager | `db_manager.py` | SQLite WAL, CRUD εγγράφων | ✅ 15/15 |
| 2 | Key Manager (BYOK) | `key_manager.py` | Fernet — Gemini/OpenAI/Claude/Mistral | ✅ 19/19 |
| 3 | File Processor | `file_processor.py` | PDF→PNG, PIL normalization | ✅ 13/13 |
| 4 | Schema Engine | `schema_builder.py` | JSON Schema, Structured Outputs | ✅ 27/27 |
| 5 | AI Extractor | `ai_extractor.py` | Multi-provider, ExtractionResult | ✅ 27/27 |
| 6 | Validation Engine | `validator.py` | Λογιστικοί κανόνες, ±0.02€ | ✅ 29/29 |
| 7 | Export & Search | `exporter.py` | CSV/XLSX/JSON, φίλτρα | ✅ 35/35 |
| 8 | Flask API Server | `main_api.py` | 17+ endpoints, gunicorn, systemd | ✅ 38/38 |

---

## ✅ Φάση 2: ΟΛΟΚΛΗΡΩΘΗΚΕ — SSL + Gemini + End-to-End Test

| Βήμα | Αποτέλεσμα |
|------|------------|
| SSL Certificate (certbot) | ✅ https://fastwrite.duckdns.org — λήγει 6/6/2026, auto-renewal |
| Gemini API Key | ✅ gemini_ready: true |
| Extract Endpoint | ✅ POST /api/extract/{doc_id} |
| End-to-End Test | ✅ Πρώτη επιτυχής εξαγωγή τιμολογίου |

### Διορθώσεις που έγιναν στη Φάση 2:
- `schema_bld.get_schema()` → `db.get_template()` + `schema_bld.build_from_list()`
- `processor.process()` επιστρέφει `ProcessedFile` — χρησιμοποιείται `.pages`
- `db.update_document()` → `db.update_document_status()`
- `result.data` → `result.extracted_data`
- `schema.pop("additionalProperties", None)` — Gemini δεν δέχεται αυτό το πεδίο

---

## ✅ Φάση 3: ΟΛΟΚΛΗΡΩΘΗΚΕ — Module 9 Batch + Δοκιμές

| Module | Αρχείο | Λειτουργία |
|--------|--------|------------|
| 9 | `batch_processor.py` | AI Segmentation + Parallel Extraction |

### Endpoints Batch:
```
POST /api/batch                    → Upload PDF, επιστρέφει job_id
GET  /api/batch/{job_id}/status    → Κατάσταση επεξεργασίας
GET  /api/batch                    → Λίστα όλων των jobs
```

### Αρχιτεκτονική Batch:
```
PDF (0-200 τιμολόγια)
    ↓ FileProcessor → N PNG εικόνες
    ↓ Pass 1 — AI Segmentation (batches 10 σελίδων)
    ↓ Pass 2 — Parallel Extraction (ThreadPoolExecutor, workers=4)
    ✅ N ξεχωριστές εγγραφές στη βάση
```

### Παράμετροι:
```python
BATCH_SIZE            = 10   # σελίδες ανά AI segmentation call
MAX_WORKERS           = 4    # παράλληλα threads
MAX_PAGES_PER_INVOICE = 10   # όριο ασφαλείας
```

### Δοκιμές που έγιναν:
- ✅ `test_searchable.pdf` (3 σελίδες → 1 τιμολόγιο)
- ✅ `en_invoice_1000.pdf` (4 σελίδες → 3 τιμολόγια, το ένα 2-σέλιδο)

### Σημαντική διόρθωση:
- Pre-registration εγγράφων πριν το parallel extraction για αποφυγή race condition

---

## ✅ Φάση 4 (Μερική): Frontend UI — Module 10

| Module | Αρχείο | Κατάσταση |
|--------|--------|-----------|
| 10A | `static/index.html` | ✅ Δημιουργήθηκε |

### UI Ενότητες:
- **Dashboard** — Στατιστικά, τελευταία έγγραφα
- **Upload & Extract** — Single PDF + Batch με drag & drop
- **Έγγραφα** — Λίστα, αναζήτηση, φίλτρα, CSV/XLSX export
- **Batch Processing** — Παρακολούθηση jobs με progress bar
- **Templates** — Δημιουργία/διαχείριση προτύπων εξαγωγής
- **Ρυθμίσεις** — API Keys, πληροφορίες συστήματος

### Flask UI Endpoint:
```python
@app.get("/ui")
@app.get("/ui/")
def serve_ui():
    return send_file("/app/projects/static/index.html")
```

### URL: https://fastwrite.duckdns.org/ui

---

## 🌐 Live Endpoints — 8/3/2026

```
GET  /                          → {"status":"running","version":"1.0.0"}
GET  /health                    → {"status":"healthy","database":"ok"}
GET  /ui                        → Frontend UI
POST /api/keys/save             → Αποθήκευση API key
GET  /api/keys/status           → Κατάσταση keys
DELETE /api/keys/{service}      → Διαγραφή key
POST /api/templates             → Δημιουργία template
GET  /api/templates             → Λίστα templates
GET  /api/templates/{name}      → Λήψη template
DELETE /api/templates/{name}    → Διαγραφή template
POST /api/upload                → Upload εγγράφου
GET  /api/documents             → Λίστα εγγράφων
GET  /api/documents/{id}        → Λήψη εγγράφου
DELETE /api/documents/{id}      → Διαγραφή εγγράφου
POST /api/extract/{id}          → AI Extraction
POST /api/batch                 → Batch upload
GET  /api/batch/{job_id}/status → Batch status
GET  /api/batch                 → Λίστα batch jobs
POST /api/export/csv            → Export CSV
POST /api/export/xlsx           → Export XLSX
GET  /api/search                → Αναζήτηση
GET  /api/stats                 → Στατιστικά
```

---

## 🔀 Multi-Provider AI

| Provider | Service Key | Κατάσταση |
|----------|-------------|-----------|
| 🤖 Gemini 2.5 Flash | `gemini` | ✅ Ενεργό |
| 🧠 GPT-4o | `openai` | 📋 Έτοιμο (χρειάζεται key) |
| ⚡ Claude 3.5 | `claude` | 📋 Έτοιμο (χρειάζεται key) |
| 💨 Mistral | `mistral` | 📋 Έτοιμο (χρειάζεται key) |

---

## 🗂️ Δομή Αρχείων Server

```
/app/projects/
├── main_api.py          # Flask API (Module 8) + Extract + Batch endpoints
├── db_manager.py        # Module 1 — SQLite
├── key_manager.py       # Module 2 — Fernet encryption
├── file_processor.py    # Module 3 — PDF→PNG
├── schema_builder.py    # Module 4 — JSON Schema
├── ai_extractor.py      # Module 5 — Gemini AI
├── validator.py         # Module 6 — Λογιστικοί κανόνες
├── exporter.py          # Module 7 — CSV/XLSX/JSON
├── batch_processor.py   # Module 9 — Batch Processing
├── static/
│   └── index.html       # Module 10 — Frontend UI
├── data/
│   └── app.db           # SQLite βάση
├── uploads/             # Ανεβασμένα αρχεία
├── processed/           # PNG εικόνες από PDF
├── exports/             # Εξαγωγές CSV/XLSX
└── secrets/             # Κρυπτογραφημένα API keys
```

---

## 🛠️ Εντολές Server

```bash
systemctl start fastwrite      # Εκκίνηση
systemctl stop fastwrite       # Διακοπή
systemctl restart fastwrite    # Επανεκκίνηση
systemctl status fastwrite     # Κατάσταση
journalctl -u fastwrite -f     # Live logs
tail -f /var/log/fastwrite/error.log   # Error logs
```

---

## 🗺️ Roadmap — Επόμενες Φάσεις

| Φάση | Module | Τίτλος | Κατάσταση |
|------|--------|--------|-----------|
| 4 | 10 | Frontend UI (πλήρης) | 🔜 ΣΕ ΕΞΕΛΙΞΗ |
| 5 | 11A | Ακαδημία (βοηθητικά βίντεο/οδηγοί) | 📋 ΕΠΟΜΕΝΟ |
| 5 | 11B | Τμήμα Υποστήριξης (AI Agent) | 📋 ΕΠΟΜΕΝΟ |
| 5 | 11C | Ερωτήσεις & Απαντήσεις | 📋 ΕΠΟΜΕΝΟ |
| 6 | 12A | myDATA / ΑΑΔΕ Integration | 📋 ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΟ |
| 6 | 12B | ERP Integration | 📋 ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΟ |

### Module 11B — Τμήμα Υποστήριξης (AI Agent):
- Δημιουργία ticket + αποστολή ερώτησης
- AI Agent για αυτόματη απάντηση
- **Τώρα**: Gemini API key
- **Αργότερα**: Δυνατότητα εναλλαγής σε Claude API key
- Διαχείριση από admin panel

---

## 📋 Field Types — Οδηγός

| Τύπος | Χρήση | Παράδειγμα |
|-------|-------|-----------|
| `string` | Κείμενο, ΑΦΜ, αριθμοί τιμολογίου, ονόματα | "INV-2025-001", "AAA Ltd" |
| `number` | Ποσά με δεκαδικά | 869.96, 79.09 |
| `integer` | Ακέραιοι αριθμοί, ποσότητες | 5, 100 |
| `date` | Ημερομηνίες ISO 8601 | "2025-10-05" |
| `boolean` | Ναι/Όχι | true, false |

---

## 🔑 Σημαντικές Σημειώσεις

1. **API Keys**: Αποθηκεύονται κρυπτογραφημένα με Fernet στο `/app/projects/secrets/`. Παραμένουν μόνιμα — δεν χρειάζεται επανεισαγωγή.
2. **additionalProperties**: Το Gemini API δεν δέχεται αυτό το πεδίο στο JSON Schema — αφαιρείται πάντα με `schema.pop("additionalProperties", None)`.
3. **Batch Race Condition**: Τα documents πρέπει να καταχωρούνται ΠΡΙΝ το parallel extraction.
4. **UI Endpoint**: Το Flask σερβίρει το `index.html` — δεν χρειάζεται ξεχωριστό nginx config.

---

## ☁️ Google Drive Backup — Σχέδιο

### Τι θα περιέχει:
- Όλα τα `.py` αρχεία του project
- `index.html` (Frontend)
- `FastWrite_Master_Project_v3.md`
- Αυτόματη ενημέρωση με κάθε νέα έκδοση

### Πώς θα λειτουργεί:
1. Αρχεία στο Google Drive (shared folder)
2. Σε κάθε νέα συνομιλία: "Διάβασε τα αρχεία από το Drive"
3. Claude διαβάζει κώδικα → γράφει σωστά από την πρώτη φορά
4. Μηδέν τύφλα, μηδέν χάος

### Επόμενο βήμα:
Στη νέα συνομιλία: κοινοποίησε το Google Drive folder και ενεργοποίησε το Google Drive connector στο Claude.
