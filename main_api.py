"""
Module 8: Τοπικός Διακομιστής (Flask) & Σύνδεση με Frontend
Domain: fastwrite.duckdns.org
"""
import json
from pathlib import Path
from flask import Flask, jsonify, request, send_file
from db_manager     import DatabaseManager
from key_manager    import KeyManager
from file_processor import FileProcessor
from schema_builder import SchemaBuilder
from validator      import InvoiceValidator
from exporter       import DocumentExporter

BASE_DIR      = Path("/app/projects")
DB_PATH       = BASE_DIR / "data"    / "app.db"
SECRETS_DIR   = BASE_DIR / "secrets"
UPLOAD_DIR    = BASE_DIR / "uploads"
PROCESSED_DIR = BASE_DIR / "processed"
EXPORT_DIR    = BASE_DIR / "exports"
for _d in [UPLOAD_DIR, PROCESSED_DIR, EXPORT_DIR]:
    _d.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024

db         = DatabaseManager(db_path=str(DB_PATH))
key_mgr    = KeyManager(key_dir=SECRETS_DIR)
processor  = FileProcessor(output_dir=PROCESSED_DIR)
schema_bld = SchemaBuilder()
validator  = InvoiceValidator()
exporter   = DocumentExporter(export_dir=EXPORT_DIR)

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_ORIGINS = [
    "http://localhost:3000","http://localhost:5173","http://localhost:8080",
    "https://fastwrite.duckdns.org","http://fastwrite.duckdns.org",
]

@app.after_request
def add_cors(response):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Methods"]    = "GET,POST,DELETE,PATCH,OPTIONS"
    response.headers["Access-Control-Allow-Headers"]    = "Content-Type,Authorization"
    response.headers["Access-Control-Allow-Credentials"]= "true"
    return response

@app.route("/api/<path:p>", methods=["OPTIONS"])
@app.route("/<path:p>",     methods=["OPTIONS"])
def options_handler(p=""):
    return jsonify({}), 200

# ── Root & Health ─────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return jsonify({"app":"FastWrite API","version":"1.1.0",
                    "domain":"fastwrite.duckdns.org","docs":"/docs","status":"running"})

@app.get("/health")
def health_check():
    checks = {}
    try:
        db.list_documents(); checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"
    try:
        checks["gemini_key"] = "configured" if key_mgr.has_key("gemini") else "not_set"
    except Exception as e:
        checks["gemini_key"] = f"error: {e}"
    overall = "healthy" if all(v in ("ok","configured","not_set") for v in checks.values()) else "degraded"
    return jsonify({"status": overall, "checks": checks})

# ── Keys ──────────────────────────────────────────────────────────────────────
@app.post("/api/keys/save")
def save_api_key():
    data = request.get_json(force=True)
    try:
        key_mgr.save_key(data.get("service","gemini"), data.get("api_key",""))
        return jsonify({"success": True, "message": "Key αποθηκεύτηκε."})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@app.get("/api/keys/status")
def get_key_status():
    return jsonify({"configured_services": key_mgr.list_services(),
                    "gemini_ready": key_mgr.has_key("gemini")})

@app.delete("/api/keys/<service>")
def delete_api_key(service):
    try:
        key_mgr.delete_key(service)
        return jsonify({"success": True, "message": f"Key '{service}' διαγράφηκε."})
    except KeyError:
        return jsonify({"error": f"Δεν βρέθηκε key: '{service}'"}), 404

# ── Templates ─────────────────────────────────────────────────────────────────
@app.post("/api/templates")
def save_template():
    data = request.get_json(force=True)
    try:
        fields           = data.get("fields", [])
        require_review   = bool(data.get("require_review", False))
        supplier_pattern = data.get("supplier_pattern", "")
        schema = schema_bld.build_from_list(fields)
        db.save_template(data.get("name",""), fields,
                         require_review=require_review,
                         supplier_pattern=supplier_pattern)
        return jsonify({"success": True, "name": data.get("name"),
                        "require_review": require_review,
                        "supplier_pattern": supplier_pattern,
                        "json_schema": schema})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@app.get("/api/templates")
def list_templates():
    t = db.list_templates()
    return jsonify({"templates": t, "count": len(t)})

@app.get("/api/templates/<name>")           # BUGFIX: ήταν <n>
def get_template(name):
    tmpl = db.get_template(name)
    if not tmpl:
        return jsonify({"error": f"Template '{name}' δεν βρέθηκε."}), 404
    tmpl["json_schema"] = schema_bld.build_from_list(tmpl["fields"])
    return jsonify(tmpl)

@app.delete("/api/templates/<name>")        # BUGFIX: ήταν <n>
def delete_template(name):
    if not db.get_template(name):
        return jsonify({"error": f"Template '{name}' δεν βρέθηκε."}), 404
    db.delete_template(name)
    return jsonify({"success": True, "message": f"Template '{name}' διαγράφηκε."})

# ── Upload ────────────────────────────────────────────────────────────────────
@app.post("/api/upload")
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "Δεν βρέθηκε αρχείο."}), 400
    f      = request.files["file"]
    suffix = Path(f.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Μη αποδεκτός τύπος: '{suffix}'."}), 400
    schema_name = request.form.get("schema_name")
    dest = UPLOAD_DIR / f.filename
    f.save(str(dest))
    doc_id = db.insert_document(
        filename=f.filename,
        file_path=str(dest),
        schema_name=schema_name,
        original_filename=f.filename)
    return jsonify({"success":True,"doc_id":doc_id,"filename":f.filename,
                    "file_path":str(dest),"schema_name":schema_name,"status":"Pending"})

# ── Documents ─────────────────────────────────────────────────────────────────
@app.get("/api/documents")
def list_documents():
    docs = db.list_documents(status=request.args.get("status"))
    for d in docs:
        if d.get("result_json"):
            try: d["result_data"] = json.loads(d["result_json"])
            except: d["result_data"] = None
    return jsonify({"documents": docs, "count": len(docs)})

@app.get("/api/documents/<int:doc_id>")
def get_document(doc_id):
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    if doc.get("result_json"):
        try: doc["result_data"] = json.loads(doc["result_json"])
        except: doc["result_data"] = None
    return jsonify(doc)

@app.delete("/api/documents/<int:doc_id>")
def delete_document(doc_id):
    if not db.get_document(doc_id):
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    db.delete_document(doc_id)
    return jsonify({"success": True, "message": f"Έγγραφο #{doc_id} διαγράφηκε."})


@app.route("/api/documents/<int:doc_id>/data", methods=["PATCH"])
def update_document_data(doc_id):
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    new_data = request.get_json(force=True) or {}
    # Merge with existing data
    existing = {}
    if doc.get("result_json"):
        try: existing = json.loads(doc["result_json"])
        except: pass
    existing.update(new_data)
    db.update_document_status(doc_id, status=doc["status"], result_json=json.dumps(existing))
    return jsonify({"success": True, "doc_id": doc_id, "data": existing})


@app.get("/api/documents/<int:doc_id>/file")
def serve_document_file(doc_id):
    """Σερβίρει το original αρχείο (PDF/εικόνα) για preview στο UI."""
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    file_path = Path(doc["file_path"])
    if not file_path.exists():
        return jsonify({"error": "Αρχείο δεν βρέθηκε στο σύστημα."}), 404
    suffix = file_path.suffix.lower()
    mime_map = {
        ".pdf":  "application/pdf",
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    mimetype = mime_map.get(suffix, "application/octet-stream")
    return send_file(str(file_path), mimetype=mimetype)


@app.get("/api/documents/<int:doc_id>/batch-siblings")
def get_batch_siblings(doc_id):
    """Επιστρέφει όλα τα docs που ανήκουν στο ίδιο batch (ίδιο original_filename)."""
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": "Not found"}), 404
    # Χρησιμοποιούμε ΜΟΝΟ original_filename — όχι filename fallback
    original = doc.get("original_filename")
    if not original:
        return jsonify({"siblings": [dict(doc)], "original_filename": ""})
    all_docs = db.list_documents()
    siblings = [
        d for d in all_docs
        # Ταιριάζει ΜΟΝΟ αν έχει original_filename == original
        # ΚΑΙ το filename του ΔΕΝ είναι ίδιο με το original (αποκλείουμε failed/raw uploads)
        if d.get("original_filename") == original
        and d.get("filename") != original
    ]
    siblings.sort(key=lambda d: d["id"])
    return jsonify({"siblings": siblings, "original_filename": original})

@app.get("/api/documents/<int:doc_id>/line-positions")
def get_line_positions(doc_id):
    """Επιστρέφει τις y-θέσεις των γραμμών του πίνακα (ως % ύψους σελίδας)."""
    import re as _re
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": "Not found"}), 404
    
    original = doc.get("original_filename") or doc.get("filename") or ""
    pdf_path = Path("/app/projects/uploads") / original
    if not pdf_path.exists():
        return jsonify({"positions": []})
    
    # Get page number from file_path
    fp = doc.get("file_path", "")
    m = _re.search(r"page_(\d+)", fp)
    page_num = int(m.group(1)) if m else 1
    
    try:
        import pdfplumber
        positions = []
        with pdfplumber.open(str(pdf_path)) as pdf:
            if page_num > len(pdf.pages):
                return jsonify({"positions": []})
            page = pdf.pages[page_num - 1]
            page_h = page.height
            
            # Find the table with most rows (the line items table)
            tables = page.find_tables()
            best = None
            for t in tables:
                rows = t.extract()
                if best is None or len(rows) > len(best.extract()):
                    best = t
            
            if best:
                rows = best.rows
                for ri, row in enumerate(rows):
                    if ri == 0: continue  # skip header
                    if not row.cells or not row.cells[0]: continue
                    y_top = row.cells[0][1]
                    y_bot = row.cells[0][3]
                    positions.append({
                        "top_pct":    round(y_top / page_h, 4),
                        "bottom_pct": round(y_bot / page_h, 4)
                    })
        return jsonify({"positions": positions, "page": page_num})
    except Exception as e:
        return jsonify({"positions": [], "error": str(e)})

@app.get("/api/documents/<int:doc_id>/original-pdf")
def serve_original_pdf(doc_id):
    import re as _re
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": "Not found"}), 404
    original = doc.get("original_filename") or doc.get("filename") or ""
    pdf_path = Path("/app/projects/uploads") / original
    if not pdf_path.exists():
        return jsonify({"error": "PDF not found"}), 404
    return send_file(str(pdf_path), mimetype="application/pdf")

@app.get("/ui")
@app.get("/ui/")
def serve_ui():
    return send_file("/app/projects/static/index.html")

_TEMPLATE_BUILDER_HTML = r'''
<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Template Builder — FastWrite</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"/>
<style>
:root{
  --bg:#0a0c10;--bg2:#111318;--bg3:#181c24;--border:#1e2330;
  --accent:#00e5a0;--accent2:#0066ff;--warn:#ffb300;--danger:#ff4444;
  --text:#e8eaf0;--text2:#7c8299;--text3:#3d4259;
}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);height:100vh;overflow:hidden;display:flex;flex-direction:column;}

/* ── Topbar ── */
.topbar{padding:12px 24px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;height:56px;}
.logo{font-family:'Syne',sans-serif;font-weight:800;font-size:18px;color:var(--text);}
.logo span{color:var(--accent);}
.doc-label{font-family:'DM Mono',monospace;font-size:13px;color:var(--text2);}

/* ── Layout: PDF | Right ── */
.layout{display:grid;grid-template-columns:1fr 1fr;flex:1;overflow:hidden;min-height:0;}

/* ── PDF side ── */
.pdf-side{border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;}
.pdf-viewer-wrap{flex:1;position:relative;min-height:0;overflow:hidden;}
.pdf-viewer-wrap iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:#fff;}
.panel-bar{padding:10px 20px;background:var(--bg2);border-bottom:1px solid var(--border);font-family:'Syne',sans-serif;font-size:11px;font-weight:600;color:var(--text2);letter-spacing:1.5px;text-transform:uppercase;flex-shrink:0;}

/* ── Supplier panel ── */
.sup-panel{flex-shrink:0;display:flex;flex-direction:column;overflow:hidden;border-bottom:2px solid var(--border);max-height:280px;transition:max-height .25s ease;}
.sup-panel.collapsed{max-height:38px;}
.sup-header{padding:7px 14px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;cursor:pointer;user-select:none;}
.sup-header-title{font-family:'Syne',sans-serif;font-size:11px;font-weight:600;color:var(--accent);letter-spacing:1.5px;text-transform:uppercase;}
.sup-chevron{font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;}
.sup-modes{display:flex;gap:6px;padding:7px 12px;background:var(--bg3);border-bottom:1px solid var(--border);flex-shrink:0;align-items:center;}
.sup-search-wrap{padding:6px 12px;border-bottom:1px solid var(--border);flex-shrink:0;}
.sup-search{width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;font-family:'DM Mono',monospace;outline:none;}
.sup-search:focus{border-color:var(--accent);}
.sup-list{flex:1;overflow-y:auto;padding:6px 8px;}
.sup-item{display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:6px;margin-bottom:3px;border-left:3px solid transparent;}
.sup-item.no-tmpl{border-left-color:var(--warn);background:rgba(255,179,0,0.04);}
.sup-item.has-tmpl{border-left-color:rgba(0,229,160,0.4);background:rgba(0,229,160,0.03);}
.sup-item.needs-review{border-left-color:var(--accent2);background:rgba(0,102,255,0.05);}
.sup-name{font-family:'DM Mono',monospace;font-size:11px;color:var(--text);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sup-badge{font-size:9px;border-radius:4px;padding:1px 5px;white-space:nowrap;flex-shrink:0;}
.sup-badge-notmpl{background:rgba(255,179,0,0.15);color:var(--warn);border:1px solid rgba(255,179,0,0.3);}
.sup-badge-tmpl{background:rgba(0,229,160,0.10);color:var(--accent);border:1px solid rgba(0,229,160,0.25);}
.sup-badge-review{background:rgba(0,102,255,0.12);color:var(--accent2);border:1px solid rgba(0,102,255,0.3);}
.sup-copy-btn{background:none;border:1px solid var(--border);color:var(--text3);border-radius:4px;font-size:9px;padding:1px 6px;cursor:pointer;font-family:'DM Mono',monospace;flex-shrink:0;}
.sup-copy-btn:hover{border-color:var(--accent);color:var(--accent);}
.mode-btn{font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;font-family:'DM Mono',monospace;border:1px solid var(--border);background:var(--bg2);color:var(--text2);}
.mode-btn:hover{border-color:var(--text3);}
.mode-btn.active-warn{background:rgba(255,179,0,0.15);color:var(--warn);border-color:rgba(255,179,0,0.4);}
.mode-btn.active-blue{background:rgba(0,102,255,0.15);color:var(--accent2);border-color:rgba(0,102,255,0.4);}
.sup-stats{font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-left:auto;}
/* ── PDF viewer ── */
.pdf-viewer-wrap{flex:1;overflow:hidden;position:relative;}
.pdf-viewer-wrap iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:#fff;}
.pdf-bar{padding:7px 14px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.pdf-bar-label{font-family:'DM Mono',monospace;font-size:11px;color:var(--text2);}

/* ── Right column: editor top + list bottom ── */
.right-col{display:flex;flex-direction:column;overflow:hidden;min-height:0;}

/* Editor — top 55% */
.editor{flex:0 0 55%;overflow-y:auto;padding:20px;}

/* Template list — bottom 45%, always visible */
.tmpl-section{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;border-top:2px solid var(--border);}
.tmpl-section-header{padding:10px 16px;background:var(--bg2);border-bottom:1px solid var(--border);font-family:'Syne',sans-serif;font-size:11px;font-weight:600;color:var(--accent);letter-spacing:1.5px;text-transform:uppercase;flex-shrink:0;}
.tmpl-search-wrap{padding:10px 16px;border-bottom:1px solid var(--border);flex-shrink:0;}
.tmpl-list{flex:1;overflow-y:auto;padding:8px;}

/* ── Buttons ── */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;transition:all .15s;}
.btn-primary{background:var(--accent);color:#000;}
.btn-primary:hover{background:#00ffb3;transform:translateY(-1px);}
.btn-secondary{background:var(--bg3);color:var(--text);border:1px solid var(--border);}
.btn-secondary:hover{border-color:var(--text3);}
.btn-sm{padding:5px 12px;font-size:12px;}
.btn-green{background:rgba(0,229,160,0.12);color:var(--accent);border:1px solid rgba(0,229,160,0.3);font-size:12px;padding:4px 10px;border-radius:6px;cursor:pointer;font-family:'DM Sans',sans-serif;}
.btn-green:hover{background:rgba(0,229,160,0.22);}
.btn-blue{background:rgba(0,102,255,0.12);color:var(--accent2);border:1px solid rgba(0,102,255,0.3);font-size:12px;padding:4px 10px;border-radius:6px;cursor:pointer;font-family:'DM Sans',sans-serif;}
.btn-blue:hover{background:rgba(0,102,255,0.22);}

/* ── Form ── */
.form-group{margin-bottom:14px;}
.form-label{display:block;font-size:11px;color:var(--text2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.8px;font-family:'DM Mono',monospace;}
.form-input{width:100%;padding:9px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none;transition:border-color .15s;font-family:'DM Sans',sans-serif;}
.form-input:focus{border-color:var(--accent);}
.section-title{font-family:'Syne',sans-serif;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border);}

/* ── Field rows ── */
.field-row-wrap{margin-bottom:8px;}
.field-row{display:grid;grid-template-columns:1fr 140px auto;gap:8px;align-items:center;}
.field-remove{background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:4px 8px;border-radius:4px;}
.field-remove:hover{color:var(--danger);}
.array-subfields{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:8px;}
.array-subfields-title{font-size:11px;color:var(--text2);font-family:'DM Mono',monospace;margin-bottom:10px;text-transform:uppercase;letter-spacing:.8px;}
.subfield-row{display:grid;grid-template-columns:1fr 120px auto;gap:8px;align-items:center;margin-bottom:8px;}

/* ── Template list items ── */
.tmpl-item{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;margin-bottom:6px;transition:border-color .15s;}
.tmpl-item:hover{border-color:var(--border);background:var(--bg2);}
.tmpl-item.active{border-color:var(--accent);background:rgba(0,229,160,0.05);}
.tmpl-name{font-family:'DM Mono',monospace;font-size:13px;color:var(--text);font-weight:500;}
.tmpl-meta{display:flex;gap:6px;align-items:center;margin-top:3px;}
.badge{font-size:10px;border-radius:4px;padding:1px 6px;}
.badge-blue{background:rgba(0,102,255,0.12);color:var(--accent2);border:1px solid rgba(0,102,255,0.25);}
.badge-warn{background:rgba(255,179,0,0.12);color:var(--warn);border:1px solid rgba(255,179,0,0.25);}
.badge-gray{color:var(--text3);font-size:10px;}

/* ── Toast ── */
.toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:500;z-index:9999;animation:fadeUp .2s ease;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

/* ── Scrollbar ── */
::-webkit-scrollbar{width:5px;}
::-webkit-scrollbar-track{background:var(--bg);}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
</style>
</head>
<body>

<!-- Topbar -->
<div class="topbar">
  <div style="display:flex;align-items:center;gap:16px;">
    <div class="logo">Fast<span>Write</span></div>
    <div class="doc-label" id="doc-label">Template Builder</div>
  </div>
  <div style="display:flex;gap:8px;">
    <button class="btn btn-secondary btn-sm" onclick="goBack()">&larr; Επιστροφή στο Upload</button>
    <button class="btn btn-secondary btn-sm" onclick="window.close()">x Κλείσιμο</button>
    <button class="btn btn-primary" onclick="doSave()" id="save-btn">[Save] Αποθήκευση Template</button>
  </div>
</div>

<!-- Main layout -->
<div class="layout">

  <!-- PDF left -->
  <div class="pdf-side">

    <!-- ── Supplier panel ── -->
    <div class="sup-panel" id="sup-panel">
      <div class="sup-header" onclick="toggleSupPanel()">
        <span class="sup-header-title">[Suppliers] <span id="sup-batch-label" style="text-transform:none;font-weight:400;font-size:10px;color:var(--text2);">φόρτωση...</span></span>
        <span class="sup-chevron" id="sup-chevron">▲</span>
      </div>
      <div class="sup-modes">
        <button class="mode-btn active-warn" id="mode-notmpl" onclick="setMode('notmpl')">⚠ Χωρίς Template</button>
        <button class="mode-btn" id="mode-review" onclick="setMode('review')">✓ Τιμολόγια Έγκριση</button>
        <span class="sup-stats" id="sup-stats"></span>
      </div>
      <div class="sup-search-wrap">
        <input class="sup-search" id="sup-search" placeholder="Αναζήτηση supplier — επικόλλησε όνομα..." oninput="onSupSearch(this.value)"/>
      </div>
      <div class="sup-list" id="sup-list">
        <div style="color:var(--text2);font-size:12px;padding:10px;text-align:center;">Φόρτωση...</div>
      </div>
    </div>

    <!-- PDF bar -->
    <div class="pdf-bar">
      <span class="pdf-bar-label" id="pdf-bar-label">[PDF] Προεπισκόπηση</span>
      <a id="pdf-open-link" href="#" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none;font-family:'DM Mono',monospace;">↗ Νέο tab</a>
    </div>

    <!-- PDF / Image viewer -->
    <div class="pdf-viewer-wrap">
      <iframe id="pdf-iframe" src="" allowfullscreen style="display:none;"></iframe>
      <div id="pdf-img-wrap" style="overflow:auto;width:100%;height:100%;display:none;position:absolute;top:0;left:0;">
        <img id="pdf-img" src="" style="width:100%;display:block;" draggable="false"/>
      </div>
    </div>
  </div>

  <!-- Right column -->
  <div class="right-col">

    <!-- Editor top -->
    <div class="editor">
      <div class="section-title">[Edit] Πεδία Template</div>

      <div class="form-group">
        <label class="form-label">Όνομα Template</label>
        <input class="form-input" id="tmpl-name" placeholder="π.χ. invoice_dei, cosmote_receipt..."/>
      </div>
      <div class="form-group">
        <label class="form-label">[Co] Supplier Pattern <span style="color:var(--text3);font-weight:400;text-transform:none;">(λέξεις-κλειδιά auto-match, π.χ. ΔΕΗ, dei, cosmote)</span></label>
        <input class="form-input" id="tmpl-supplier" placeholder="π.χ. cosmote, ote — πολλαπλές με κόμμα"/>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg3);border-radius:8px;margin-bottom:16px;">
        <input type="checkbox" id="tmpl-review" style="width:16px;height:16px;accent-color:var(--warn);cursor:pointer"/>
        <div>
          <div style="font-size:13px;color:var(--text);font-weight:500;">[!] Απαιτείται Έγκριση</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px;">Τα έγγραφα θα περιμένουν έγκριση πριν ολοκληρωθούν</div>
        </div>
      </div>

      <div class="section-title">[Copy] Πεδία Εξαγωγής</div>
      <div id="tmpl-fields"></div>
      <button class="btn btn-secondary btn-sm" onclick="addField()" style="margin-bottom:8px;">+ Προσθήκη Πεδίου</button>
    </div>

    <!-- Template list bottom — always visible -->
    <div class="tmpl-section">
      <div class="tmpl-section-header">[Dir] Υπάρχοντα Templates — Φόρτωση / Αντιγραφή</div>
      <div class="tmpl-search-wrap">
        <input class="form-input" id="tmpl-search" placeholder="[Search] Αναζήτηση template..." oninput="filterTemplates(this.value)" style="font-size:13px;"/>
      </div>
      <div class="tmpl-list" id="tmpl-list">
        <div style="color:var(--text2);font-size:13px;padding:16px 8px;text-align:center;">Φόρτωση...</div>
      </div>
    </div>

  </div>
</div>

<script>
// ── Globals ───────────────────────────────────────────────────────────────────
const docId = new URLSearchParams(window.location.search).get('doc_id')
           || window.location.pathname.split('/').pop();
let allTemplates = [];

// ── Supplier panel globals ────────────────────────────────────────────────────
let allDocs      = [];
let currentMode  = 'notmpl';
let supCollapsed = false;

function toggleSupPanel() {
  supCollapsed = !supCollapsed;
  document.getElementById('sup-panel').classList.toggle('collapsed', supCollapsed);
  document.getElementById('sup-chevron').textContent = supCollapsed ? '▼' : '▲';
}

function setMode(mode) {
  currentMode = mode;
  document.getElementById('mode-notmpl').className = 'mode-btn' + (mode==='notmpl' ? ' active-warn' : '');
  document.getElementById('mode-review').className = 'mode-btn' + (mode==='review' ? ' active-blue' : '');
  document.getElementById('sup-search').value = '';
  const rw = document.getElementById('review-data-wrap');
  if (rw) rw.style.display = 'none';
  renderSupList(allDocs, '');
}

function getSupplierName(doc) {
  if (!doc.result_json) return null;
  try {
    const rd = JSON.parse(doc.result_json);
    return rd.supplier_name || rd.vendor_name || rd.company || rd.issuer || null;
  } catch(e) { return null; }
}

function getMatchedTemplate(doc, templates) {
  const supplier = (getSupplierName(doc) || '').toLowerCase().trim();
  if (!supplier) return null;
  for (const t of templates) {
    if (!t.supplier_pattern) continue;
    const patterns = t.supplier_pattern.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
    for (const p of patterns) {
      if (supplier.includes(p) || p.includes(supplier)) return t.name;
    }
  }
  return null;
}

async function loadDocList(templates) {
  try {
    const res = await apiFetch('GET', '/api/documents/' + docId + '/batch-siblings');
    allDocs = (res.siblings || []).map(d => ({
      ...d,
      _supplier: getSupplierName(d),
      _matched:  getMatchedTemplate(d, templates)
    }));
    const lbl = document.getElementById('sup-batch-label');
    if (lbl && res.original_filename) {
      const n = res.original_filename;
      lbl.textContent = n.length > 28 ? n.slice(0,26) + '...' : n;
    }
    renderSupList(allDocs, '');
    loadPdf(docId);
  } catch(e) {
    document.getElementById('sup-list').innerHTML =
      '<div style="color:var(--danger);font-size:12px;padding:8px;">Σφάλμα φόρτωσης</div>';
  }
}

function loadPdf(id) {
  const url = '/api/documents/' + id + '/file';
  document.getElementById('pdf-open-link').href = url;
  const doc = allDocs.find(d => String(d.id) === String(id));
  const name = doc ? (doc.filename || ('Έγγραφο #' + id)) : ('Έγγραφο #' + id);
  document.getElementById('pdf-bar-label').textContent = name;
  document.getElementById('doc-label').textContent = 'Template Builder  |  ' + name;

  const filePath = doc ? (doc.file_path || '') : '';
  const isPng = filePath.toLowerCase().endsWith('.png') || filePath.toLowerCase().endsWith('.jpg');

  const iframe  = document.getElementById('pdf-iframe');
  const imgWrap = document.getElementById('pdf-img-wrap');
  const img     = document.getElementById('pdf-img');

  if (isPng) {
    const pageMatch = filePath.match(/page_(\d+)/);
    const pageNum   = pageMatch ? parseInt(pageMatch[1]) : 1;
    const originalUrl = '/api/documents/' + id + '/original-pdf#page=' + pageNum;
    imgWrap.style.display = 'none';
    iframe.style.display  = 'block';
    iframe.src = originalUrl;
  } else {
    imgWrap.style.display = 'none';
    iframe.style.display  = 'block';
    iframe.src = url;
  }
}

function onSupSearch(q) {
  renderSupList(allDocs, q);
  if (q.trim()) {
    const ql = q.toLowerCase();
    const match = allDocs.find(d => (d._supplier||'').toLowerCase().includes(ql)
      || (d.filename||'').toLowerCase().includes(ql));
    if (match) {
      loadPdf(match.id);
      if (!match._matched) {
        document.getElementById('tmpl-supplier').value = match._supplier || '';
      }
    }
  }
}

function renderSupList(docs, q) {
  const el = document.getElementById('sup-list');
  const ql = (q||'').trim().toLowerCase();

  let filtered = [...docs];
  const seen = new Set();
  filtered = filtered.filter(d => {
    const key = (d._supplier || d.filename || String(d.id)).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (currentMode === 'notmpl') {
    filtered.sort((a,b) => (!a._matched ? 0 : 1) - (!b._matched ? 0 : 1));
  } else if (currentMode === 'review') {
    filtered.sort((a,b) => (b.status==='pending_review'?1:0) - (a.status==='pending_review'?1:0));
  }
  if (ql) filtered = filtered.filter(d =>
    (d._supplier||'').toLowerCase().includes(ql) || (d.filename||'').toLowerCase().includes(ql));

  const noTmpl = docs.filter(d => !d._matched).length;
  const needsRv = docs.filter(d => d.status === 'pending_review').length;
  document.getElementById('sup-stats').textContent = noTmpl + ' χωρίς · ' + needsRv + ' έγκριση';

  if (!filtered.length) {
    const msg = currentMode==='notmpl'
      ? (ql ? 'Δεν βρέθηκε' : '✓ Όλα έχουν template!')
      : (ql ? 'Δεν βρέθηκε' : '✓ Κανένα προς έγκριση');
    el.innerHTML = '<div style="color:var(--accent);font-size:12px;padding:10px;text-align:center;">' + msg + '</div>';
    return;
  }

  el.innerHTML = filtered.map(d => {
    const sup = d._supplier || d.filename || ('Doc #' + d.id);
    const supShort = sup.length > 30 ? sup.slice(0,28) + '…' : sup;
    const supEscaped = sup.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const badge = !d._matched
      ? '<span class="sup-badge sup-badge-notmpl">⚠ Χωρίς</span>'
      : d.status==='pending_review'
        ? '<span class="sup-badge sup-badge-review">⏳</span>'
        : '<span class="sup-badge sup-badge-tmpl">✓ '+d._matched+'</span>';
    const itemClass = !d._matched ? 'no-tmpl' : d.status==='pending_review' ? 'needs-review' : 'has-tmpl';
    const reviewBtn = d.status==='pending_review'
      ? '<a href="/ui/review/'+d.id+'" target="_blank" class="sup-copy-btn" style="color:var(--accent2);text-decoration:none;">⚖</a>'
      : '';
    return '<div class="sup-item ' + itemClass + '" id="si-'+d.id+'">'
         + '<span class="sup-name" title="'+sup+'">'+supShort+'</span>'
         + badge
         + '<button class="sup-copy-btn" onclick="copySupplier(\'' + supEscaped + '\')" title="Αντιγραφή">⎘</button>'
         + '<button class="sup-copy-btn" onclick="openDoc('+d.id+')" title="Άνοιγμα PDF" style="color:var(--accent2);">→</button>'
         + '<a href="/ui/review/'+d.id+'" target="_blank" class="sup-copy-btn" style="color:#00e5a0;text-decoration:none;" title="Άνοιγμα Έγκριση">⚖</a>'
         + '</div>';
  }).join('');
}

function copySupplier(name) {
  const inp = document.getElementById('sup-search');
  inp.value = name;
  renderSupList(allDocs, name);
  const ql = name.toLowerCase();
  const match = allDocs.find(d => (d._supplier||'').toLowerCase().includes(ql));
  if (match) loadPdf(match.id);
  navigator.clipboard.writeText(name).catch(()=>{});
  showToast('Αντιγράφηκε: ' + name, 'success');
}

function openDoc(id) {
  loadPdf(id);
  const doc = allDocs.find(d => d.id === id);
  if (doc && doc._supplier && !doc._matched) {
    document.getElementById('tmpl-supplier').value = doc._supplier;
  }
}


// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  // Default 3 empty fields
  addField(); addField(); addField();
  // Load templates first, then doc list
  await loadTemplates();
  await loadDocList(allTemplates);
})();

// ── Navigation ────────────────────────────────────────────────────────────────
function goBack() {
  // Αν άνοιξε σε νέο tab (opener υπάρχει) → κλείνει και επιστρέφει
  // Αν άνοιξε στο ίδιο tab → πηγαίνει στο Upload & Extract
  if (window.opener && !window.opener.closed) {
    // Ενεργοποίησε το Upload tab στο parent window
    try { window.opener.showPage('upload'); } catch(e) {}
    window.close();
  } else {
    window.location.href = '/ui#upload';
  }
}

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(method, url, body) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  return r.json();
}

// ── Templates list ────────────────────────────────────────────────────────────
async function loadTemplates(refreshDocList) {
  const el = document.getElementById('tmpl-list');
  try {
    const res = await apiFetch('GET', '/api/templates');
    allTemplates = res.templates || [];
    renderTemplates(allTemplates);
    // Re-evaluate doc list matches if requested (e.g. after saving a new template)
    if (refreshDocList && allDocs.length) {
      allDocs = allDocs.map(d => ({...d, _matched: getMatchedTemplate(d, allTemplates)}));
      const sorted = docListSorted
        ? [...allDocs].sort((a,b) => (!a._matched?0:1) - (!b._matched?0:1))
        : allDocs;
      renderDocList(sorted);
    }
  } catch(e) {
    el.innerHTML = '<div style="color:var(--danger);font-size:13px;padding:8px;">Σφάλμα: ' + e.message + '</div>';
  }
}

function filterTemplates(q) {
  const f = q.trim() === ''
    ? allTemplates
    : allTemplates.filter(t => t.name.toLowerCase().includes(q.toLowerCase())
        || (t.supplier_pattern||'').toLowerCase().includes(q.toLowerCase()));
  renderTemplates(f);
}

function renderTemplates(list) {
  const el = document.getElementById('tmpl-list');
  if (!list.length) {
    el.innerHTML = allTemplates.length
      ? '<div style="color:var(--text2);font-size:13px;padding:8px;">Δεν βρέθηκαν templates</div>'
      : '<div style="color:var(--text2);font-size:13px;padding:8px;">Δεν υπάρχουν templates ακόμα</div>';
    return;
  }
  el.innerHTML = list.map(t => {
    const spBadge = t.supplier_pattern
      ? '<span class="badge badge-blue">[Co] ' + t.supplier_pattern + '</span>' : '';
    const rvBadge = t.require_review
      ? '<span class="badge badge-warn">[!] review</span>' : '';
    const cnt = (t.fields||[]).length;
    const nameEsc = t.name.replace(/\\/g,'\\\\').replace(/`/g,'\\`');
    return `<div class="tmpl-item" id="ti-${t.name.replace(/[^a-zA-Z0-9]/g,'_')}">
      <div style="flex:1;min-width:0;">
        <div class="tmpl-name">${t.name}</div>
        <div class="tmpl-meta">
          ${spBadge}${rvBadge}
          <span class="badge-gray">${cnt} πεδία</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;">
        <button class="btn-green" onclick="loadTemplate('${nameEsc}')">[In] Φόρτωση</button>
        <button class="btn-blue"  onclick="copyTemplate('${nameEsc}')">[Copy] Αντιγραφή</button>
      </div>
    </div>`;
  }).join('');
}

// ── Load template into editor ─────────────────────────────────────────────────
async function loadTemplate(name) {
  const tmpl = await apiFetch('GET', '/api/templates/' + encodeURIComponent(name));
  if (!tmpl || tmpl.error) { showToast('Σφάλμα φόρτωσης', 'error'); return; }

  document.getElementById('tmpl-name').value     = tmpl.name;
  document.getElementById('tmpl-supplier').value  = tmpl.supplier_pattern || '';
  document.getElementById('tmpl-review').checked  = !!tmpl.require_review;
  document.getElementById('tmpl-fields').innerHTML = '';

  (tmpl.fields||[]).forEach(f => {
    addField();
    const wraps  = document.querySelectorAll('#tmpl-fields .field-row-wrap');
    const wrap   = wraps[wraps.length - 1];
    const inputs = wrap.querySelectorAll('.field-row input, .field-row select');
    inputs[0].value = f.name;
    inputs[1].value = f.type;
    if (f.type === 'array') {
      onFieldTypeChange(inputs[1]);
      if (f.items && f.items.length) {
        const subList = wrap.querySelector('.subfield-list');
        if (subList) {
          subList.innerHTML = '';
          f.items.forEach(item => {
            const d = document.createElement('div');
            d.innerHTML = defaultSubfieldRow(item.name, item.type);
            subList.appendChild(d.firstElementChild);
          });
        }
      }
    }
  });

  // Highlight active
  document.querySelectorAll('.tmpl-item').forEach(el => el.classList.remove('active'));
  const id = 'ti-' + name.replace(/[^a-zA-Z0-9]/g,'_');
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); el.scrollIntoView({block:'nearest'}); }

  showToast('Φορτώθηκε: ' + name, 'success');
}

// ── Copy template ─────────────────────────────────────────────────────────────
async function copyTemplate(name) {
  const tmpl = await apiFetch('GET', '/api/templates/' + encodeURIComponent(name));
  if (!tmpl || tmpl.error) return;

  let newName = name + '(1)', i = 1;
  while (allTemplates.find(x => x.name === newName)) { i++; newName = name + '(' + i + ')'; }

  document.getElementById('tmpl-name').value     = newName;
  document.getElementById('tmpl-name').readOnly   = false;
  document.getElementById('tmpl-supplier').value  = tmpl.supplier_pattern || '';
  document.getElementById('tmpl-review').checked  = !!tmpl.require_review;
  document.getElementById('tmpl-fields').innerHTML = '';

  (tmpl.fields||[]).forEach(f => {
    addField();
    const wraps  = document.querySelectorAll('#tmpl-fields .field-row-wrap');
    const wrap   = wraps[wraps.length - 1];
    const inputs = wrap.querySelectorAll('.field-row input, .field-row select');
    inputs[0].value = f.name;
    inputs[1].value = f.type;
    if (f.type === 'array') {
      onFieldTypeChange(inputs[1]);
      if (f.items && f.items.length) {
        const subList = wrap.querySelector('.subfield-list');
        if (subList) {
          subList.innerHTML = '';
          f.items.forEach(item => {
            const d = document.createElement('div');
            d.innerHTML = defaultSubfieldRow(item.name, item.type);
            subList.appendChild(d.firstElementChild);
          });
        }
      }
    }
  });
  showToast('Αντιγράφηκε ως: ' + newName, 'success');
}

// ── Field editor ──────────────────────────────────────────────────────────────
function addField() {
  const div = document.createElement('div');
  div.className = 'field-row';
  div.innerHTML = `
    <input class="form-input" placeholder="Όνομα πεδίου" style="font-size:13px"/>
    <select class="form-input" style="font-size:13px" onchange="onFieldTypeChange(this)">
      <option value="string">string</option>
      <option value="number">number</option>
      <option value="date">date</option>
      <option value="integer">integer</option>
      <option value="boolean">boolean</option>
      <option value="array">array (line items)</option>
    </select>
    <button class="field-remove" onclick="this.closest('.field-row-wrap').remove()">x</button>`;
  const wrap = document.createElement('div');
  wrap.className = 'field-row-wrap';
  wrap.appendChild(div);
  document.getElementById('tmpl-fields').appendChild(wrap);
}

function onFieldTypeChange(sel) {
  const wrap = sel.closest('.field-row-wrap');
  const existing = wrap.querySelector('.array-subfields');
  if (existing) existing.remove();
  if (sel.value === 'array') {
    const panel = document.createElement('div');
    panel.className = 'array-subfields';
    panel.innerHTML = `
      <div class="array-subfields-title">[Copy] Στήλες Line Items</div>
      <div class="subfield-list">
        ${defaultSubfieldRow('description','string')}
        ${defaultSubfieldRow('quantity','number')}
        ${defaultSubfieldRow('unit_price','number')}
        ${defaultSubfieldRow('total','number')}
      </div>
      <button type="button" onclick="addSubfield(this)" style="font-size:12px;color:var(--accent);background:none;border:none;cursor:pointer;margin-top:4px;">+ Προσθήκη στήλης</button>`;
    wrap.appendChild(panel);
  }
}

function defaultSubfieldRow(name, type) {
  const types = ['string','number','integer','date','boolean'];
  const opts = types.map(t=>`<option value="${t}" ${t===type?'selected':''}>${t}</option>`).join('');
  return `<div class="subfield-row">
    <input class="form-input" value="${name}" placeholder="Όνομα στήλης" style="font-size:12px"/>
    <select class="form-input" style="font-size:12px">${opts}</select>
    <button type="button" onclick="this.closest('.subfield-row').remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:4px">x</button>
  </div>`;
}

function addSubfield(btn) {
  const list = btn.previousElementSibling;
  const d = document.createElement('div');
  d.innerHTML = defaultSubfieldRow('', 'string');
  list.appendChild(d.firstElementChild);
}

// ── Save template ─────────────────────────────────────────────────────────────
async function doSave() {
  const name = document.getElementById('tmpl-name').value.trim();
  if (!name) { showToast('Εισήγαγε όνομα template', 'error'); return; }

  const wraps = document.querySelectorAll('#tmpl-fields .field-row-wrap');
  const fields = [];
  wraps.forEach(wrap => {
    const inputs = wrap.querySelectorAll('.field-row input, .field-row select');
    const n = inputs[0].value.trim();
    const t = inputs[1].value;
    if (!n) return;
    if (t === 'array') {
      const subRows = wrap.querySelectorAll('.subfield-row');
      const items = [];
      subRows.forEach(sr => {
        const si = sr.querySelectorAll('input, select');
        const sn = si[0].value.trim();
        if (sn) items.push({name: sn, type: si[1].value});
      });
      fields.push({name:n, type:'array', required:true, items: items.length ? items : [
        {name:'description',type:'string'},{name:'quantity',type:'number'},
        {name:'unit_price',type:'number'},{name:'total',type:'number'}
      ]});
    } else {
      fields.push({name:n, type:t, required:true});
    }
  });

  if (!fields.length) { showToast('Πρόσθεσε τουλάχιστον ένα πεδίο', 'error'); return; }

  const supplier_pattern = document.getElementById('tmpl-supplier').value.trim();
  const require_review   = document.getElementById('tmpl-review').checked;

  const btn = document.getElementById('save-btn');
  btn.disabled = true; btn.textContent = 'Αποθήκευση...';

  const res = await apiFetch('POST', '/api/templates', {name, fields, require_review, supplier_pattern});

  btn.disabled = false; btn.textContent = '[Save] Αποθήκευση Template';

  if (res.success) {
    showToast('Template αποθηκεύτηκε: ' + name, 'success');
    await loadTemplates(true);   // true = refresh doc list matches too
  } else {
    showToast('Σφάλμα: ' + (res.error || 'άγνωστο'), 'error');
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast';
  const ok = type === 'success';
  t.style.cssText = 'background:' + (ok ? 'rgba(0,229,160,0.15)' : 'rgba(255,68,68,0.15)')
    + ';border:1px solid ' + (ok ? '#00e5a0' : '#ff4444')
    + ';color:' + (ok ? '#00e5a0' : '#ff4444');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
</script>
</body>
</html>

'''

@app.get("/ui/template-builder/<int:doc_id>")
def serve_template_builder(doc_id):
    """Standalone Template Builder — HTML embedded directly, no static file needed."""
    doc = db.get_document(doc_id)
    if not doc:
        from flask import abort
        abort(404)

    from flask import make_response
    resp = make_response(_TEMPLATE_BUILDER_HTML.encode('utf-8'))
    resp.headers["Content-Type"] = "text/html; charset=utf-8"
    return resp
