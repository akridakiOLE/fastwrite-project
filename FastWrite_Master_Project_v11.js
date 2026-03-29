const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
        ShadingType, PageNumber, PageBreak } = require('docx');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };
const thickBorder = { style: BorderStyle.SINGLE, size: 2, color: "2E75B6" };
const thickBorders = { top: thickBorder, bottom: thickBorder, left: thickBorder, right: thickBorder };

function headerCell(text, width) {
  return new TableCell({
    borders: thickBorders, width: { size: width, type: WidthType.DXA },
    shading: { fill: "2E75B6", type: ShadingType.CLEAR },
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", font: "Arial", size: 20 })] })]
  });
}

function cell(text, width, opts = {}) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: opts.shade ? { fill: "F2F7FB", type: ShadingType.CLEAR } : undefined,
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, font: "Arial", size: 20, bold: opts.bold || false, color: opts.color || "000000" })] })]
  });
}

function makeTable(headers, rows, widths) {
  const totalW = widths.reduce((a,b) => a+b, 0);
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ children: headers.map((h, i) => headerCell(h, widths[i])) }),
      ...rows.map((row, ri) => new TableRow({
        children: row.map((c, ci) => {
          if (typeof c === 'object') return cell(c.text, widths[ci], { shade: ri % 2 === 1, bold: c.bold, color: c.color });
          return cell(c, widths[ci], { shade: ri % 2 === 1 });
        })
      }))
    ]
  });
}

function h1(text) { return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 200 }, children: [new TextRun({ text, bold: true, font: "Arial", size: 28, color: "2E75B6" })] }); }
function h2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 160 }, children: [new TextRun({ text, bold: true, font: "Arial", size: 24, color: "2E75B6" })] }); }
function h3(text) { return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 120 }, children: [new TextRun({ text, bold: true, font: "Arial", size: 22, color: "444444" })] }); }
function p(text) { return new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text, font: "Arial", size: 20 })] }); }
function pBold(text) { return new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text, font: "Arial", size: 20, bold: true })] }); }
function gap() { return new Paragraph({ spacing: { after: 80 }, children: [] }); }

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, font: "Arial", color: "2E75B6" }, paragraph: { spacing: { before: 300, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, font: "Arial", color: "2E75B6" }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 22, bold: true, font: "Arial", color: "444444" }, paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 } }
    },
    headers: {
      default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "FastWrite Master Project v11 | 28/03/2026 | Empisteftiko", font: "Arial", size: 16, color: "888888" })] })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Page ", font: "Arial", size: 16, color: "888888" }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "888888" })] })] })
    },
    children: [
      // TITLE
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "FastWrite", bold: true, font: "Arial", size: 44, color: "2E75B6" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "AI Document Extractor", font: "Arial", size: 28, color: "444444" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "Master Project File v11  |  28 Martiou 2026  |  fastwrite.duckdns.org", font: "Arial", size: 20, color: "666666" })] }),

      // Status bar
      makeTable(
        ["Modules", "Tests", "Auth", "Server", "Local Dev"],
        [["11 Modules OK", "203/203 OK", "JWT Active", "Live - Hetzner CX23", "VS Code + Cowork"]],
        [1970, 1970, 1970, 1970, 1960]
      ),
      gap(),

      // 1. INFRASTRUCTURE
      h1("1. Ypodomi & Stack"),
      makeTable(
        ["Stoicheio", "Leptomeria"],
        [
          ["Server", "Hetzner CX23 - Ubuntu"],
          ["Domain", "fastwrite.duckdns.org"],
          ["SSL", "Let's Encrypt (certbot) - ligei 6/6/2026"],
          ["Backend", "Python / Flask / Gunicorn (2 workers, 127.0.0.1:8000)"],
          ["Reverse Proxy", "Nginx - proxy_pass se gunicorn"],
          ["Database", "SQLite WAL mode - /app/projects/data/app.db"],
          ["Encryption", "Fernet - API keys kryptografimena"],
          ["Authentication", "JWT (PyJWT) + bcrypt - httpOnly cookie fw_token 24h"],
          ["AI SDK", "google-genai - gemini-2.5-flash"],
          ["Service", "systemd fastwrite.service"],
          ["Virtual Env", "/app/projects/venv/"],
          ["GitHub", "github.com/akridakiOLE/fastwrite-project (public, master)"],
          ["Node.js", "v24.13.1 (topiko)"],
          ["Git", "v2.53.0 (topiko)"],
        ],
        [3000, 6840]
      ),
      gap(),

      // 2. MODULES
      h1("2. Modules - Katastasi"),
      makeTable(
        ["#", "Module", "Archeio", "Tests"],
        [
          ["1", "Database Manager", "db_manager.py", "15/15"],
          ["2", "Key Manager (BYOK)", "key_manager.py", "19/19"],
          ["3", "File Processor", "file_processor.py", "13/13"],
          ["4", "Schema Engine", "schema_builder.py", "27/27"],
          ["5", "AI Extractor", "ai_extractor.py", "27/27"],
          ["6", "Validation Engine", "validator.py", "29/29"],
          ["7", "Export & Search", "exporter.py", "35/35"],
          ["8", "Flask API Server", "main_api.py", "38/38"],
          ["9", "Batch Processor", "batch_processor.py", "OK"],
          ["10", "Frontend UI", "static/index.html", "OK"],
          ["10b", "Template Builder", "main_api.py (embedded)", "OK"],
          ["11", "Auth Manager", "auth_manager.py", "OK"],
        ],
        [600, 2800, 3600, 2840]
      ),
      gap(),

      // 3. CHANGES V11
      h1("3. Allages v11 (28/03/2026)"),
      p("Synedria Cowork - epektasi leitourgikon UI, Activity History, kai repeat navigation."),
      gap(),

      h2("3.1 Review Page - Veltioseis"),
      makeTable(
        ["Allagi", "Leptomeria"],
        [
          ["Koumpi Archi", "Prosthiki koumpiou [Archi] sto review page gia metavasi sto proto timologio tou batch"],
          ["Koumpi Epistrofi", "To [Epistrofi] pigainei tora sto Upload & Extract (/ui#upload) anti gia history.back()"],
          ["Pliris Navigation", "Archi | Proig | Epomeno | Epistrofi - pliri ploigisi metaxy timologion"],
        ],
        [2500, 7340]
      ),
      gap(),

      h2("3.2 Batch Processing - Allages"),
      makeTable(
        ["Allagi", "Leptomeria"],
        [
          ["Afairesi pre-check blocking", "To [Enarxi Batch] xekinaei amesa choris blocking modal"],
          ["Pre-check integration", "To batch trexei pre-check automata prin tin exagogi (segmentation + supplier detection)"],
          ["Analysis modal meta batch", "Emfanisi modal me analytika apotelesmata meta tin oloklirosi batch"],
          ["Sostos ypologismos", "Chrisi tou API field no_approval anti gia total - needsAppr"],
          ["Grammi Synolika", "Prostethike grammi Synolika eggrafa archeiou se ola ta modals"],
          ["Pre-check data gia batch", "Ola ta noumera sto batch completion modal provainoun apo pre-check (akriveia)"],
        ],
        [3000, 6840]
      ),
      gap(),

      h2("3.3 Activity History (NEO)"),
      p("Antikatatastasi tou Single Upload section me persistent Activity History panel."),
      gap(),
      makeTable(
        ["Stoicheio", "Leptomeria"],
        [
          ["activity_log table", "Neos pinakas sti SQLite: id, filename, file_path, action, total_invoices, without_template, needs_approval, no_approval, result_json, created_at"],
          ["Activity API", "POST /api/activity (save), GET /api/activity (list), GET /api/activity/<id> (detail)"],
          ["History Panel", "Aristero panel sti selida Upload & Extract me lista drastitiotaton"],
          ["Katagogi", "Kathe pre-check kai batch apothikevontai automata sto istoriko"],
          ["Radio epilogi", "Radio button se kathe entry - epilogi enos archeiou apo to istoriko"],
          ["Results Modal", "Koumpi 📊 se kathe entry gia emfanisi analytikon apotelesmaton"],
          ["Arithmisi", "Afxon arithmos (#1, #2, ...) kai foteroi imerominia"],
          ["file_path", "Apothikevsi server path gia epanachrisimopoiisi archeiou"],
          ["doc_ids", "Apothikevsi doc_ids sto result_json gia amesi ploigisi"],
        ],
        [2500, 7340]
      ),
      gap(),

      h2("3.4 Repeat Navigation (NEO)"),
      p("Dynatotita metavasis se Template Builder i Review selida apo to istoriko CHORIS epanalipsi API calls."),
      gap(),
      makeTable(
        ["Stoicheio", "Leptomeria"],
        [
          ["Checkbox Epexergasia", "Checkbox dipla apo [Epexergasia & Dimiourgia Template] - emfanizetai gia OLES tis drastitiotites"],
          ["Checkbox Batch", "Checkbox dipla apo [Enarxi Batch] - emfanizetai MONO gia batch entries (pou echouv extracted data)"],
          ["Amoivaia apoklisi", "MONO ena checkbox mporei na einai tsekkarismeno (onRepeatCheckChange)"],
          ["Checkbox OFF", "I mpara ekteli kanonka ti diadikasia (pre-check i batch)"],
          ["Checkbox ON", "I mpara metaferi sti selida Template Builder i Review choris API call"],
          ["Evresi documents", "findDocsForActivity: 1) doc_ids apo result_json, 2) original_filename match, 3) batch activities me idio filename"],
          ["Template Builder", "Metavasi sto /ui/template-builder/<first_doc_id>"],
          ["Review/Ekrisi", "Metavasi sto /ui/review/<first_pending_review_or_first_doc_id>"],
        ],
        [2800, 7040]
      ),
      gap(),

      h2("3.5 UI Allages"),
      makeTable(
        ["Allagi", "Leptomeria"],
        [
          ["Afairesi Single Upload", "To section Memonmeno Eggrafo afairethike"],
          ["Afairesi Batch page", "I selida Batch Processing afairethike apo to sidebar"],
          ["Activity History panel", "Aristero panel me scroll, isto ipsos me to dexio panel"],
          ["Template Fallback label", "To dropdown template legetai tora Template Fallback (gia Auto Match)"],
          ["Xoris Fallback option", "Epilogi Xoris Fallback (mono Auto Match) sto template dropdown"],
        ],
        [3000, 6840]
      ),
      gap(),

      // 3.6 Previous changes reminder
      h2("3.6 Proigoumenes Allages (apo v9-v10)"),
      p("GitHub Setup: Claude Chat (schediasmos) -> Claude Code (GitHub) -> git pull (server)"),
      p("Afairesi selidas Egkrisi (sidebar) - PARAMENEI: /ui/review/<id> standalone page"),
      p("Authentication System (JWT): auth_manager.py - PyJWT + bcrypt, Login page /ui/login"),
      p("VS Code + Cowork topiko periballon anaptyxis"),
      gap(),

      // 4. WORKFLOW
      h1("4. Roi Ergasias (v11)"),
      makeTable(
        ["Vima", "Ergaleio", "Energeia"],
        [
          ["1", "Claude Cowork", "Schediasmos, architektoniki, apofaseis + amesi epexergasia archeion"],
          ["2", "Topiko VS Code", "O xristis vlepei tis allages amesa sto VS Code"],
          ["3", "GitHub", "Claude kanei push allagon sto repo (i topika mesa apo Cowork)"],
          ["4", "Server (SSH)", "git fetch + merge + push + restart"],
          ["5", "Browser (Chrome)", "Claude elegchei to apotelesma mesa apo Claude in Chrome"],
        ],
        [1200, 2500, 6140]
      ),
      gap(),
      pBold("NEO Workflow (Cowork Mode):"),
      p("1. O xristis zitaei allagi sto Cowork"),
      p("2. To Claude diavazei/epexergazetai ta archeia topika (C:\\Users\\User\\fastwrite-project)"),
      p("3. O xristis vlepei tis allages amesa sto VS Code"),
      p("4. To Claude kanei commit & push sto GitHub"),
      p("5. Sto server: git pull + restart"),
      p("6. To Claude elegchei to apotelesma ston Chrome"),
      gap(),
      pBold("Deploy Entoles:"),
      p("git fetch origin && git merge origin/claude/<BRANCH> && git push origin master && git reset --hard origin/master && sudo systemctl restart fastwrite && journalctl -u fastwrite -n 15 --no-pager"),
      gap(),

      // 5. ENDPOINTS
      h1("5. Live Endpoints"),
      makeTable(
        ["Method", "Endpoint", "Leitourgia"],
        [
          ["GET", "/ui/login", "Login page (public)"],
          ["GET", "/ui", "Frontend SPA (requires auth)"],
          ["GET", "/ui/review/<id>", "Review Page PNG + canvas (requires auth)"],
          ["GET", "/ui/template-builder/<id>", "Template Builder (requires auth)"],
          ["POST", "/api/auth/login", "Login - epistrefei JWT cookie"],
          ["POST", "/api/auth/logout", "Logout - diagrafei cookie"],
          ["GET", "/api/auth/me", "Current user info"],
          ["GET", "/api/stats", "Statistika egrafon"],
          ["POST", "/api/upload", "Upload egrafou"],
          ["GET", "/api/documents", "Lista egrafon"],
          ["GET", "/api/documents/<id>", "Lipsi egrafou"],
          ["DELETE", "/api/documents/<id>", "Diagrafi egrafou"],
          ["POST", "/api/documents/cleanup-pending", "Katharismos pending docs"],
          ["POST", "/api/documents/<id>/approve", "Egkrisi egrafou"],
          ["POST", "/api/documents/<id>/reject", "Aporripsi egrafou"],
          ["PATCH", "/api/documents/<id>/data", "Enimerosi data egrafou"],
          ["GET", "/api/documents/<id>/file", "Serve archeio"],
          ["GET", "/api/documents/<id>/original-pdf", "Serve original PDF"],
          ["GET", "/api/documents/<id>/line-positions", "y-theseis grammon (pdfplumber)"],
          ["GET", "/api/documents/<id>/batch-siblings", "Sibling docs batch"],
          ["POST", "/api/extract/<id>", "AI Extraction"],
          ["POST", "/api/batch", "Batch upload (dechtai file i file_path)"],
          ["POST", "/api/batch/pre-check", "Pre-check analysis (dechtai file i file_path)"],
          ["GET", "/api/batch/<job_id>/status", "Batch status (periechei doc_ids)"],
          [{text: "POST", bold: true, color: "2E75B6"}, {text: "/api/activity", bold: true, color: "2E75B6"}, {text: "NEO v11 - Save activity log entry", bold: false, color: "2E75B6"}],
          [{text: "GET", bold: true, color: "2E75B6"}, {text: "/api/activity", bold: true, color: "2E75B6"}, {text: "NEO v11 - Lista activity entries", bold: false, color: "2E75B6"}],
          [{text: "GET", bold: true, color: "2E75B6"}, {text: "/api/activity/<id>", bold: true, color: "2E75B6"}, {text: "NEO v11 - Single activity detail", bold: false, color: "2E75B6"}],
          ["POST", "/api/templates", "Dimiourgia template"],
          ["GET", "/api/templates", "Lista templates"],
          ["POST", "/api/export/csv", "Export CSV"],
          ["POST", "/api/export/xlsx", "Export XLSX"],
          ["GET", "/api/search", "Anazitisi"],
        ],
        [1100, 3500, 5240]
      ),
      gap(),

      // 6. FILE STRUCTURE
      h1("6. Domi Archeion GitHub (master)"),
      makeTable(
        ["Archeio", "Katastasi v11", "Simeiosi"],
        [
          ["main_api.py", "ENIMEROOMENO (v11)", "Flask API + Template Builder + Review Page + Activity API + file_path support"],
          ["static/index.html", "ENIMEROOMENO (v11)", "Activity History, Repeat Navigation, choris Single Upload, choris Batch page"],
          ["auth_manager.py", "OS ECHEI (v9)", "JWT + bcrypt authentication"],
          ["db_manager.py", "ENIMEROOMENO (v11)", "activity_log table + file_path column + insert/list/get activity methods"],
          ["ai_extractor.py", "OS ECHEI (v7)", "google.genai SDK"],
          ["batch_processor.py", "OS ECHEI (v7)", "Auto Match, Skip Completed"],
          ["schema_builder.py", "OS ECHEI", "-"],
          ["key_manager.py", "OS ECHEI", "-"],
          ["file_processor.py", "OS ECHEI", "-"],
          ["validator.py", "OS ECHEI", "-"],
          ["exporter.py", "OS ECHEI", "-"],
          [".gitignore", "OS ECHEI (v9)", "Exairei venv/, data/, secrets/, uploads/ ktl"],
        ],
        [2600, 2600, 4640]
      ),
      gap(),

      // 7. DATABASE SCHEMA CHANGES
      h1("7. Database - Neos Pinakas (v11)"),
      h2("7.1 activity_log Table"),
      makeTable(
        ["Column", "Type", "Perigrafi"],
        [
          ["id", "INTEGER PK AUTOINCREMENT", "Primary key"],
          ["filename", "TEXT NOT NULL", "Onoma archeiou PDF"],
          ["file_path", "TEXT", "Server path gia epanachrisimopoiisi (NEO v11)"],
          ["action", "TEXT NOT NULL", "pre-check i batch"],
          ["total_invoices", "INTEGER DEFAULT 0", "Synolika timologia"],
          ["without_template", "INTEGER DEFAULT 0", "Timologia choris template"],
          ["needs_approval", "INTEGER DEFAULT 0", "Timologia pou chreiazontai egkrisi"],
          ["no_approval", "INTEGER DEFAULT 0", "Timologia choris egkrisi"],
          ["result_json", "TEXT", "JSON me analytika apotelesmata + doc_ids gia batch"],
          ["created_at", "TEXT NOT NULL", "ISO timestamp dimiourgias"],
        ],
        [2400, 3200, 4240]
      ),
      gap(),
      h2("7.2 db_manager.py Methods (NEA v11)"),
      makeTable(
        ["Method", "Perigrafi"],
        [
          ["insert_activity(filename, action, ...)", "Eisagogi neas katachirisis sto activity_log"],
          ["list_activities(limit=50)", "Lista prosfaton katachirision"],
          ["get_activity(activity_id)", "Lipsi mias katachirisis me id"],
        ],
        [4000, 5840]
      ),
      gap(),

      // 8. COWORK CAPABILITIES
      h1("8. Dynatotites Claude Cowork"),
      makeTable(
        ["Dynatotita", "Perigrafi", "Katastasi"],
        [
          ["Topika Archeia", "Diavasi, epexergasia, dimiourgia archeion sto C:\\Users\\User\\fastwrite-project", "ENERGO"],
          ["Chrome Browser", "Ploigisi, elegchos selidon, screenshots, form filling", "ENERGO"],
          ["GitHub", "Push/pull, commits, PRs sto akridakiOLE/fastwrite-project", "ENERGO"],
          ["Google Drive", "Anagnosi/egrafi Google Docs (Master Project files)", "ENERGO"],
          ["Web Search", "Anazitisi pliroforion sto internet", "ENERGO"],
          ["Dimiourgia Archeion", "DOCX, XLSX, PPTX, PDF, HTML, code files", "ENERGO"],
          ["Scheduled Tasks", "Programmatismenes ergasies (kathimerines, evdomadiees)", "DIATHESIMO"],
          ["MCP Connectors", "Syndesi me Slack, Asana, Jira kai alla", "DIATHESIMO"],
        ],
        [2400, 5200, 2240]
      ),
      gap(),

      // 9. ROADMAP
      h1("9. Roadmap"),
      makeTable(
        ["#", "Feature", "Perigrafi", "Proteraiotita"],
        [
          ["1", "Repeat Navigation FIX", "Veltioseis sta checkboxes kai sti logiki metavasis (ekremmei)", "Ameso"],
          ["2", "2FA / OTP", "TOTP (Google Authenticator)", "Ypsili"],
          ["3", "User Management", "Admin panel: lista users, invite, deactivate", "Ypsili"],
          ["4", "Keyboard Nav", "Arrow keys + PDF highlight sync sto Review", "Ameso"],
          ["5", "Payment Integration", "LemonSqueezy / Paddle", "Mesoprothesmo"],
          ["6", "Pricing Tiers", "Freemium / Trial / Pro / Enterprise", "Mesoprothesmo"],
          ["7", "Multilingual UI", "i18next - EN/GR", "Argotera"],
          ["8", "Multi-provider AI", "Gemini/OpenAI/Claude/Mistral", "Argotera"],
          ["9", "myDATA / AADE", "Aftomati ypovoli timologion", "Makroprothesma"],
          ["10", "ERP Integration", "Syndesi me logistika systimata", "Makroprothesma"],
        ],
        [600, 2600, 4000, 2640]
      ),
      gap(),

      // 10. TECHNICAL NOTES
      h1("10. Technikes Simeioseis"),
      h2("10.1 Krisima Patterns"),
      p("JWT cookie: httpOnly=True, samesite=Lax, secure=False (HTTP), max_age=86400, path=/"),
      p("Frontend API calls: credentials: include se kathe fetch()"),
      p("Gemini API: schema.pop('additionalProperties', None) panta prin to send"),
      p("db_manager.py: pure Python - OCHI embedded HTML"),
      p("File transfers Termius: unreliable gia megala archeia - chrisi heredoc"),
      p("Activity log: result_json periechei doc_ids gia batch entries (v11)"),
      p("Repeat navigation: findDocsForActivity elegchei result_json -> original_filename -> batch activities"),
      p("Pre-check + Batch endpoints: dechedontai file_path form parameter gia epanachrisimopoiisi archeiou"),
      gap(),

      h2("10.2 Standard Restart Sequence"),
      p("python3 -m py_compile [file] && echo OK"),
      p("sudo systemctl restart fastwrite"),
      p("journalctl -u fastwrite -n 20 --no-pager"),
      gap(),

      h2("10.3 Dimiourgia neou user"),
      p("cd /app/projects && source venv/bin/activate && python3 - << 'PYEOF'"),
      p("from db_manager import DatabaseManager"),
      p("from auth_manager import hash_password"),
      p("db = DatabaseManager(db_path='/app/projects/data/app.db')"),
      p("db.create_user('username', hash_password('password'), role='user')"),
      p("PYEOF"),
      gap(),

      // 11. SERVER COMMANDS
      h1("11. Entoles Server"),
      makeTable(
        ["Entoli", "Perigrafi"],
        [
          ["sudo systemctl restart fastwrite", "Epanekinisi"],
          ["journalctl -u fastwrite -n 20 --no-pager", "Logs"],
          ["git fetch origin && git merge origin/claude/<BRANCH> && git push origin master", "Merge Claude Code branch"],
          ["git reset --hard origin/master", "Sync server me GitHub"],
          ["git add -A && git commit -m '...' && git push origin master", "Push allagon sto GitHub"],
          ["git branch -r", "Lista remote branches"],
          ["git push origin --delete <branch>", "Diagrafi branch"],
          ["source venv/bin/activate", "Energopoiisi venv"],
          ["python3 -m py_compile main_api.py && echo OK", "Syntax check"],
        ],
        [6000, 3840]
      ),
      gap(),

      // 12. EKREMMOTITES V11
      h1("12. Ekremmotites / Simeia pros veltioosi (v11)"),
      p("Ta parakatho simeia ekremmoun apo ti synedria 28/03/2026:"),
      gap(),
      makeTable(
        ["#", "Thema", "Perigrafi", "Katastasi"],
        [
          ["1", "Repeat checkbox logic", "Otan epilego pre-check entry kai tsekaro batch checkbox, prepei na min emfanizetai (idi ylopoiimeno) - elegchos oti leitourgei sosta", "Elegchos"],
          ["2", "Template Builder navigation", "Leitourgei gia batch entries, elegchos gia pre-check entries (prepei na vrei docs me idio original_filename)", "Elegchos"],
          ["3", "Review navigation", "Leitourgei - metaferei ston proto pending_review i ston proto doc", "OK"],
          ["4", "Activity History scroll", "To aristero panel echei scroll, to dexio oxi - elegchos UX", "OK"],
          ["5", "doc_ids apothikevsi", "Ta nea batch entries apothikeoun doc_ids - ta palia ochi (fallback mesw original_filename)", "OK"],
        ],
        [400, 2600, 5200, 1640]
      ),
      gap(),

      // 13. SESSION NOTES
      h1("13. Odigies Neas Synedrias (ENIMEROOMENO v11)"),
      pBold("Grapse: 'Diavase to FastWrite_Master_Project_v11 apo to Google Drive'"),
      gap(),
      makeTable(
        ["KANONAS", "Perigrafi"],
        [
          ["Master Doc FIRST", "PANTA diavaze to Master Project PRIN xekiniseis opoiadipote allagi"],
          ["GitHub first", "Panta sync server -> GitHub prin doseis odigies sto Claude Code"],
          ["Verify lines", "wc -l main_api.py static/index.html prin kai meta allages"],
          ["Claude Code scope", "Panta MIN agizeis tipota ektos autou pou anaferetai rita"],
          ["Credentials", "Kathe fetch() chreizetai credentials: include"],
          ["Secrets", "POTE secrets/ sto GitHub - einai sto .gitignore"],
          ["Cowork Access", "To Claude echei amesi prosvasi sta topika archeia kai ston Chrome"],
          ["VS Code Sync", "Oi allages fainontai amesa sto VS Code tou xristi"],
          ["Activity Log", "NEO: oi drastitiotites apothikeontai stin activity_log - elegxe ta doc_ids"],
          ["Mikra vimata", "Diorthoseis se mikra vimata CHORIS na diagrafeis apo ton ypoloipo kodika"],
        ],
        [2600, 7240]
      ),
      gap(),

      h2("Stoicheia Xristi"),
      makeTable(
        ["Stoicheio", "Timi"],
        [
          ["Onoma", "STAVROS"],
          ["GitHub Username", "akridakiOLE"],
          ["GitHub Email", "platiaenastavros@gmail.com"],
          ["Claude Email", "stavrosfkallenos@gmail.com"],
          ["Claude Plan", "Max"],
          ["OS", "Windows"],
          ["Local Project Path", "C:\\Users\\User\\fastwrite-project"],
          ["Git Version", "v2.53.0"],
          ["Node.js Version", "v24.13.1"],
        ],
        [3000, 6840]
      ),
      gap(),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: "FastWrite Master Project v11 - 28/03/2026 - Empisteftiko", font: "Arial", size: 18, color: "888888", italics: true })] }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/sessions/laughing-trusting-goldberg/mnt/fastwrite-project/FastWrite_Master_Project_v11.docx", buffer);
  console.log("OK - FastWrite_Master_Project_v11.docx created");
});
