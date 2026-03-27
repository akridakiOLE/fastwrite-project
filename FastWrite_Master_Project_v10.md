# FastWrite - AI Document Extractor
## Master Project File v10 | 24 Martiou 2026 | fastwrite.duckdns.org

| Modules | Tests | Auth | Server | Local Dev |
|---------|-------|------|--------|-----------|
| 10 Modules OK | 203/203 OK | JWT Active | Live - Hetzner CX23 | VS Code + Cowork |

---

## 1. Ypodomi & Stack

| Stoicheio | Leptomeria |
|-----------|------------|
| Server | Hetzner CX23 - Ubuntu |
| Domain | fastwrite.duckdns.org |
| SSL | Let's Encrypt (certbot) - ligei 6/6/2026 |
| Backend | Python / Flask / Gunicorn (2 workers, 127.0.0.1:8000) |
| Reverse Proxy | Nginx - proxy_pass se gunicorn |
| Database | SQLite WAL mode - /app/projects/data/app.db |
| Encryption | Fernet - API keys kryptografimena |
| Authentication | JWT (PyJWT) + bcrypt - httpOnly cookie fw_token 24h |
| AI SDK | google-genai - gemini-2.5-flash |
| Service | systemd fastwrite.service |
| Virtual Env | /app/projects/venv/ |
| GitHub | github.com/akridakiOLE/fastwrite-project (public, master) |
| Node.js | v24.13.1 (topiko) |
| Git | v2.53.0 (topiko) |

---

## 2. Modules - Katastasi

| # | Module | Archeio | Tests |
|---|--------|---------|-------|
| 1 | Database Manager | db_manager.py | 15/15 |
| 2 | Key Manager (BYOK) | key_manager.py | 19/19 |
| 3 | File Processor | file_processor.py | 13/13 |
| 4 | Schema Engine | schema_builder.py | 27/27 |
| 5 | AI Extractor | ai_extractor.py | 27/27 |
| 6 | Validation Engine | validator.py | 29/29 |
| 7 | Export & Search | exporter.py | 35/35 |
| 8 | Flask API Server | main_api.py | 38/38 |
| 9 | Batch Processor | batch_processor.py | OK |
| 10 | Frontend UI | static/index.html | OK |
| 10b | Template Builder | main_api.py (embedded) | OK |
| NEW | Auth Manager | auth_manager.py | OK |

---

## 3. Allages v10 (24/03/2026)

### 3.1 Topiko Periballon Anaptyxis (NEO)

Egkatastasi kai rythmisi VS Code me pliri syndesi sto GitHub kai Cowork mode.

| Stoicheio | Katastasi | Leptomeria |
|-----------|-----------|------------|
| VS Code | Egkatestimeno | Me olous toys aparaititious extensions |
| Git | v2.53.0 | Username: akridakiOLE, Email: platiaenastavros@gmail.com |
| GitHub Remote | Syndedemeno | origin -> github.com/akridakiOLE/fastwrite-project.git |
| Claude Code Extension | v2.1.81 | Anthropic verified - egkatestimeno sto VS Code |
| Claude in Chrome | Energo | Browser automation mesa apo Cowork |
| Cowork File Access | Energo | Amesi prosvasi sto C:\Users\User\fastwrite-project |

### 3.2 VS Code Extensions

| Extension | Skopos |
|-----------|--------|
| Claude Code (Anthropic) | AI coding assistant mesa sto VS Code |
| Prettier | Aftomato formatting kodika |
| ESLint | Entopismos sfalmaton JavaScript |
| Error Lens | Errors inline dipla sti grammi |
| GitLens | Git history, blame, diff |
| GitHub Pull Requests & Issues | PR management mesa apo VS Code |
| Live Server | Preview HTML/CSS/JS me auto-reload |
| Thunder Client | REST API testing |
| Auto Rename Tag | Aftomati allagi HTML tags |
| Path Intellisense | Autocomplete gia file paths |

### 3.3 Proigoumenes Allages (apo v9)

- GitHub Setup: Claude Chat (schediasmos) -> Claude Code (GitHub) -> git pull (server)
- Afairesi selidas Egkrisi (sidebar) - PARAMENEI: /ui/review/<id> standalone page
- Authentication System (JWT): auth_manager.py - PyJWT + bcrypt, Login page /ui/login

---

## 4. Roi Ergasias (v10)

| Vima | Ergaleio | Energeia |
|------|----------|----------|
| 1 | Claude Cowork | Schediasmos, architektoniki, apofaseis + amesi epexergasia archeion |
| 2 | Topiko VS Code | O xristis vlepei tis allages amesa sto VS Code |
| 3 | GitHub | Claude kanei push allagon sto repo (i topika mesa apo Cowork) |
| 4 | Server (SSH) | git fetch + merge + push + restart |
| 5 | Browser (Chrome) | Claude elegchei to apotelesma mesa apo Claude in Chrome |

### NEO Workflow (Cowork Mode):
1. O xristis zitaei allagi sto Cowork
2. To Claude diavazei/epexergazetai ta archeia topika (C:\Users\User\fastwrite-project)
3. O xristis vlepei tis allages amesa sto VS Code
4. To Claude kanei commit & push sto GitHub
5. Sto server: git pull + restart
6. To Claude elegchei to apotelesma ston Chrome

### Deploy Entoles
```
git fetch origin && git merge origin/claude/<BRANCH> && git push origin master && git reset --hard origin/master && sudo systemctl restart fastwrite && journalctl -u fastwrite -n 15 --no-pager
```

---

## 5. Live Endpoints

| Method | Endpoint | Leitourgia |
|--------|----------|------------|
| GET | /ui/login | Login page (public) |
| GET | /ui | Frontend SPA (requires auth) |
| GET | /ui/review/<id> | Review Page PNG + canvas (requires auth) |
| GET | /ui/template-builder/<id> | Template Builder (requires auth) |
| POST | /api/auth/login | Login - epistrefei JWT cookie |
| POST | /api/auth/logout | Logout - diagrafei cookie |
| GET | /api/auth/me | Current user info |
| GET | /api/stats | Statistika egrafon |
| POST | /api/upload | Upload egrafou |
| GET | /api/documents | Lista egrafon |
| GET | /api/documents/<id> | Lipsi egrafou |
| DELETE | /api/documents/<id> | Diagrafi egrafou |
| GET | /api/documents/<id>/file | Serve archeio |
| GET | /api/documents/<id>/original-pdf | Serve original PDF |
| GET | /api/documents/<id>/line-positions | y-theseis grammon (pdfplumber) |
| GET | /api/documents/<id>/batch-siblings | Sibling docs batch |
| POST | /api/extract/<id> | AI Extraction |
| POST | /api/batch | Batch upload |
| GET | /api/batch/<job_id>/status | Batch status |
| POST | /api/templates | Dimiourgia template |
| GET | /api/templates | Lista templates |
| POST | /api/export/csv | Export CSV |
| POST | /api/export/xlsx | Export XLSX |
| GET | /api/search | Anazitisi |

---

## 6. Domi Archeion GitHub (master)

| Archeio | Katastasi v10 | Simeiosi |
|---------|---------------|----------|
| main_api.py | ENIMEROOMENO (v9) | Flask API + Template Builder + Review Page HTML |
| static/index.html | ENIMEROOMENO (v9) | Choris Egkrisi sidebar, me logout button |
| auth_manager.py | NEO (v9) | JWT + bcrypt authentication |
| db_manager.py | ENIMEROOMENO (v9) | users table + 5 nees methodoi |
| ai_extractor.py | OS ECHEI (v7) | google.genai SDK |
| batch_processor.py | OS ECHEI (v7) | Auto Match, Skip Completed |
| schema_builder.py | OS ECHEI | - |
| key_manager.py | OS ECHEI | - |
| file_processor.py | OS ECHEI | - |
| validator.py | OS ECHEI | - |
| exporter.py | OS ECHEI | - |
| .gitignore | NEO (v9) | Exairei venv/, data/, secrets/, uploads/ ktl |

---

## 7. Dynatotites Claude Cowork (NEO v10)

To Claude mesa apo to Cowork mode mporei na kanei ta exis:

| Dynatotita | Perigrafi | Katastasi |
|------------|-----------|-----------|
| Topika Archeia | Diavasi, epexergasia, dimiourgia archeion sto C:\Users\User\fastwrite-project | ENERGO |
| Chrome Browser | Ploigisi, elegchos selidon, screenshots, form filling | ENERGO |
| GitHub | Push/pull, commits, PRs sto akridakiOLE/fastwrite-project | ENERGO |
| Google Drive | Anagnosi Google Docs (Master Project files) | ENERGO |
| Web Search | Anazitisi pliroforion sto internet | ENERGO |
| Dimiourgia Archeion | DOCX, XLSX, PPTX, PDF, HTML, code files | ENERGO |
| Scheduled Tasks | Programmatismenes ergasies (kathimerines, evdomadiees) | DIATHESIMO |
| MCP Connectors | Syndesi me Slack, Asana, Jira kai alla | DIATHESIMO |

---

## 8. Roadmap

| # | Feature | Perigrafi | Proteraiotita |
|---|---------|-----------|---------------|
| 1 | 2FA / OTP | TOTP (Google Authenticator) | Ypsili |
| 2 | User Management | Admin panel: lista users, invite, deactivate | Ypsili |
| 3 | Feature #3 | Template per Supplier - left panel batch list | Ameso |
| 4 | Keyboard Nav | Arrow keys + PDF highlight sync sto Review | Ameso |
| 5 | Preview Fix | Preview-before-Batch workflow | Ameso |
| 6 | Payment Integration | LemonSqueezy / Paddle | Mesoprothesmo |
| 7 | Pricing Tiers | Freemium / Trial / Pro / Enterprise | Mesoprothesmo |
| 8 | Multilingual UI | i18next - EN/GR | Argotera |
| 9 | Multi-provider AI | Gemini/OpenAI/Claude/Mistral | Argotera |
| 10 | myDATA / AADE | Aftomati ypovoli timologion | Makroprothesma |
| 11 | ERP Integration | Syndesi me logistika systimata | Makroprothesma |

---

## 9. Technikes Simeioseis

### 9.1 Krisima Patterns
- JWT cookie: httpOnly=True, samesite=Lax, secure=False (HTTP), max_age=86400, path=/
- Frontend API calls: credentials: include se kathe fetch()
- Gemini API: schema.pop('additionalProperties', None) panta prin to send
- db_manager.py: pure Python - OCHI embedded HTML
- File transfers Termius: unreliable gia megala archeia - chrisi heredoc

### 9.2 Standard Restart Sequence
```
python3 -m py_compile [file] && echo OK
sudo systemctl restart fastwrite
journalctl -u fastwrite -n 20 --no-pager
```

### 9.3 Dimiourgia neou user
```
cd /app/projects && source venv/bin/activate && python3 - << 'PYEOF'
from db_manager import DatabaseManager
from auth_manager import hash_password
db = DatabaseManager(db_path='/app/projects/data/app.db')
db.create_user('username', hash_password('password'), role='user')
PYEOF
```

---

## 10. Entoles Server

| Entoli | Perigrafi |
|--------|-----------|
| sudo systemctl restart fastwrite | Epanekinisi |
| journalctl -u fastwrite -n 20 --no-pager | Logs |
| git fetch origin && git merge origin/claude/<BRANCH> && git push origin master | Merge Claude Code branch |
| git reset --hard origin/master | Sync server me GitHub |
| git add -A && git commit -m '...' && git push origin master | Push allagon sto GitHub |
| git branch -r | Lista remote branches |
| git push origin --delete <branch> | Diagrafi branch |
| source venv/bin/activate | Energopoiisi venv |
| python3 -m py_compile main_api.py && echo OK | Syntax check |

---

## 11. Odigies Neas Synedrias (ENIMEROOMENO v10)

**Grapse: "Diavase to FastWrite_Master_Project_v10.md apo ton topiko fakelo"**

| KANONAS | Perigrafi |
|---------|-----------|
| Master Doc FIRST | PANTA diavaze to Master Project PRIN xekiniseis opoiadipote allagi |
| GitHub first | Panta sync server -> GitHub prin doseis odigies sto Claude Code |
| Verify lines | wc -l main_api.py static/index.html prin kai meta allages |
| Claude Code scope | Panta MIN agizeis tipota ektos autou pou anaferetai rita |
| Credentials | Kathe fetch() chreizetai credentials: include |
| Secrets | POTE secrets/ sto GitHub - einai sto .gitignore |
| Cowork Access | To Claude echei amesi prosvasi sta topika archeia kai ston Chrome |
| VS Code Sync | Oi allages fainontai amesa sto VS Code tou xristi |

### Stoicheia Xristi

| Stoicheio | Timi |
|-----------|------|
| Onoma | STAVROS |
| GitHub Username | akridakiOLE |
| GitHub Email | platiaenastavros@gmail.com |
| Claude Email | stavrosfkallenos@gmail.com |
| Claude Plan | Max |
| OS | Windows |
| Local Project Path | C:\Users\User\fastwrite-project |
| Git Version | v2.53.0 |
| Node.js Version | v24.13.1 |

---

*FastWrite Master Project v10 - 24/03/2026 - Empisteftiko*
