"""
Module 8: Τοπικός Διακομιστής (Flask) & Σύνδεση με Frontend
Domain: fastwrite.duckdns.org
"""
import json
from pathlib import Path
from flask import Flask, jsonify, request, send_file, make_response, redirect
from db_manager     import DatabaseManager
from auth_manager   import create_token, verify_token, hash_password, check_password, require_auth, COOKIE_NAME
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
    return jsonify({"app":"FastWrite API","version":"1.0.0",
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
@require_auth
def save_template():
    data = request.get_json(force=True)
    try:
        schema = schema_bld.build_from_list(data.get("fields", []))
        db.save_template(
            data.get("name",""),
            data.get("fields",[]),
            require_review=bool(data.get("require_review", False)),
            supplier_pattern=data.get("supplier_pattern")
        )
        return jsonify({"success": True, "name": data.get("name"), "json_schema": schema})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@app.get("/api/templates")
@require_auth
def list_templates():
    t = db.list_templates()
    return jsonify({"templates": t, "count": len(t)})

@app.get("/api/templates/<name>")
@require_auth
def get_template(name):
    tmpl = db.get_template(name)
    if not tmpl:
        return jsonify({"error": f"Template '{name}' δεν βρέθηκε."}), 404
    tmpl["json_schema"] = schema_bld.build_from_list(tmpl["fields"])
    return jsonify(tmpl)

@app.delete("/api/templates/<name>")
@require_auth
def delete_template(name):
    if not db.get_template(name):
        return jsonify({"error": f"Template '{name}' δεν βρέθηκε."}), 404
    db.delete_template(name)
    return jsonify({"success": True, "message": f"Template '{name}' διαγράφηκε."})

# ── Upload ────────────────────────────────────────────────────────────────────
@app.post("/api/upload")
@require_auth
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
    doc_id = db.insert_document(filename=f.filename, file_path=str(dest), schema_name=schema_name)
    return jsonify({"success":True,"doc_id":doc_id,"filename":f.filename,
                    "file_path":str(dest),"schema_name":schema_name,"status":"Pending"})

# ── Documents ─────────────────────────────────────────────────────────────────
@app.get("/api/documents")
@require_auth
def list_documents():
    docs = db.list_documents(status=request.args.get("status"))
    for d in docs:
        if d.get("result_json"):
            try: d["result_data"] = json.loads(d["result_json"])
            except: d["result_data"] = None
    return jsonify({"documents": docs, "count": len(docs)})

@app.get("/api/documents/<int:doc_id>")
@require_auth
def get_document(doc_id):
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    if doc.get("result_json"):
        try: doc["result_data"] = json.loads(doc["result_json"])
        except: doc["result_data"] = None
    return jsonify(doc)

@app.delete("/api/documents/<int:doc_id>")
@require_auth
def delete_document(doc_id):
    if not db.get_document(doc_id):
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    db.delete_document(doc_id)
    return jsonify({"success": True, "message": f"Έγγραφο #{doc_id} διαγράφηκε."})

@app.post("/api/documents/cleanup-pending")
@require_auth
def cleanup_pending():
    """Delete all Pending documents that have no result_json (unprocessed uploads)."""
    docs = db.list_documents(status="Pending")
    deleted = 0
    for d in docs:
        if not d.get("result_json"):
            db.delete_document(d["id"])
            deleted += 1
    return jsonify({"success": True, "deleted": deleted,
                    "message": f"Διαγράφηκαν {deleted} εκκρεμή έγγραφα."})

# ── Document Actions (Approve / Reject / Edit Data) ──────────────────────────
@app.post("/api/documents/<int:doc_id>/approve")
@require_auth
def approve_document(doc_id):
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    db.update_document_status(doc_id, status="Completed", result_json=doc.get("result_json"))
    return jsonify({"success": True, "doc_id": doc_id, "status": "Completed"})

@app.post("/api/documents/<int:doc_id>/reject")
@require_auth
def reject_document(doc_id):
    if not db.get_document(doc_id):
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    db.update_document_status(doc_id, status="Failed")
    return jsonify({"success": True, "doc_id": doc_id, "status": "Failed"})

@app.route("/api/documents/<int:doc_id>/data", methods=["PATCH"])
@require_auth
def update_document_data(doc_id):
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    new_data = request.get_json(force=True) or {}
    existing = {}
    if doc.get("result_json"):
        try: existing = json.loads(doc["result_json"])
        except: pass
    existing.update(new_data)
    db.update_document_status(doc_id, status=doc["status"], result_json=json.dumps(existing))
    return jsonify({"success": True, "doc_id": doc_id, "data": existing})

@app.get("/api/documents/<int:doc_id>/file")
@require_auth
def serve_document_file(doc_id):
    """Σερβίρει το processed αρχείο (PNG/εικόνα) για preview στο UI."""
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    file_path = Path(doc["file_path"])
    if not file_path.exists():
        return jsonify({"error": "Αρχείο δεν βρέθηκε στο σύστημα."}), 404
    suffix = file_path.suffix.lower()
    mime_map = {".pdf":"application/pdf",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp"}
    return send_file(str(file_path), mimetype=mime_map.get(suffix, "application/octet-stream"))

@app.get("/api/documents/<int:doc_id>/original-pdf")
@require_auth
def serve_original_pdf(doc_id):
    """Σερβίρει το πρωτότυπο PDF αρχείο."""
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    original = doc.get("original_filename") or doc.get("filename", "")
    pdf_path = UPLOAD_DIR / original
    if not pdf_path.exists():
        return jsonify({"error": "Original PDF δεν βρέθηκε."}), 404
    return send_file(str(pdf_path), mimetype="application/pdf")

@app.get("/api/documents/<int:doc_id>/line-positions")
@require_auth
def get_line_positions(doc_id):
    """Επιστρέφει τις y-θέσεις γραμμών πίνακα (ως % ύψους σελίδας) μέσω pdfplumber."""
    import re as _re
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    fp = doc.get("file_path", "")
    page_num = 0
    m = _re.search(r"page_(\d+)", fp)
    if m:
        page_num = int(m.group(1)) - 1
    original = doc.get("original_filename") or doc.get("filename", "")
    pdf_path = UPLOAD_DIR / original
    if not pdf_path.exists() or not str(pdf_path).lower().endswith(".pdf"):
        return jsonify({"positions": []})
    try:
        import pdfplumber
        with pdfplumber.open(str(pdf_path)) as pdf:
            if page_num >= len(pdf.pages):
                return jsonify({"positions": []})
            page = pdf.pages[page_num]
            tables = page.find_tables()
            if not tables:
                return jsonify({"positions": []})
            tbl = tables[0]
            page_h = float(page.height)
            positions = []
            for row in tbl.rows:
                cells = row.cells
                if not cells:
                    continue
                tops = [c[1] for c in cells if c]
                bots = [c[3] for c in cells if c]
                if tops and bots:
                    positions.append({"top_pct": min(tops)/page_h, "bottom_pct": max(bots)/page_h})
            return jsonify({"positions": positions})
    except Exception as e:
        return jsonify({"positions": [], "error": str(e)})

@app.get("/api/documents/<int:doc_id>/batch-siblings")
@require_auth
def get_batch_siblings(doc_id):
    """Επιστρέφει όλα τα docs που ανήκουν στο ίδιο batch (ίδιο original_filename)."""
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": "Not found"}), 404
    original = doc.get("original_filename")
    if not original:
        return jsonify({"siblings": [dict(doc)], "original_filename": ""})
    all_docs = db.list_documents()
    siblings = [d for d in all_docs if d.get("original_filename") == original and d.get("filename") != original]
    siblings.sort(key=lambda d: d["id"])
    return jsonify({"siblings": siblings, "original_filename": original})

# ── Export ────────────────────────────────────────────────────────────────────
def _get_records_for_export(doc_ids=None):
    all_docs = db.list_documents()
    if doc_ids:
        all_docs = [d for d in all_docs if d["id"] in doc_ids]
    records = []
    for doc in all_docs:
        row = {k: v for k, v in doc.items() if k != "result_json"}
        if doc.get("result_json"):
            try:
                for k, v in json.loads(doc["result_json"]).items():
                    if not k.startswith("_"): row[k] = v
            except: pass
        records.append(row)
    return records

@app.post("/api/export/csv")
@require_auth
def export_csv():
    data    = request.get_json(force=True) or {}
    records = _get_records_for_export(data.get("doc_ids"))
    if not records:
        return jsonify({"error": "Δεν βρέθηκαν έγγραφα."}), 404
    result = exporter.export_csv(records, filename=data.get("filename"), columns=data.get("columns"))
    if not result.success:
        return jsonify({"error": result.error}), 500
    return send_file(str(result.file_path), mimetype="text/csv",
                     as_attachment=True, download_name=result.file_path.name)

@app.post("/api/export/xlsx")
@require_auth
def export_xlsx():
    data    = request.get_json(force=True) or {}
    records = _get_records_for_export(data.get("doc_ids"))
    if not records:
        return jsonify({"error": "Δεν βρέθηκαν έγγραφα."}), 404
    result = exporter.export_xlsx(records, filename=data.get("filename"), columns=data.get("columns"))
    if not result.success:
        return jsonify({"error": result.error}), 500
    return send_file(str(result.file_path),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True, download_name=result.file_path.name)

# ── Search & Stats ────────────────────────────────────────────────────────────
@app.get("/api/search")
@require_auth
def search_documents():
    records = _get_records_for_export()
    result  = exporter.search(records,
        query=request.args.get("q",""),
        status_filter=request.args.get("status"),
        date_from=request.args.get("date_from"),
        date_to=request.args.get("date_to"),
        min_amount=request.args.get("min_amount", type=float),
        max_amount=request.args.get("max_amount", type=float),
    )
    return jsonify({"documents":result.records,"count":result.total_count,
                    "query":result.query,"filters_used":result.filters_used})

@app.get("/api/stats")
@require_auth
def get_stats():
    return jsonify(exporter.summary_stats(_get_records_for_export()))

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)

# ── Extract Endpoint ──────────────────────────────────────────────────────────
from ai_extractor import AIExtractor, ExtractionResult

@app.post("/api/extract/<int:doc_id>")
@require_auth
def extract_document(doc_id):
    data        = request.get_json() or {}
    schema_name = data.get("schema_name")
    if not schema_name:
        return jsonify({"success": False, "error": "schema_name απαιτείται"}), 400

    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"success": False, "error": "Έγγραφο δεν βρέθηκε"}), 404

    template = db.get_template(schema_name)
    if not template:
        return jsonify({"success": False, "error": f"Schema '{schema_name}' δεν βρέθηκε"}), 404

    schema = schema_bld.build_from_list(template["fields"])
    schema.pop("additionalProperties", None)

    api_key = key_mgr.get_key("gemini")
    if not api_key:
        return jsonify({"success": False, "error": "Gemini key δεν βρέθηκε"}), 400

    file_path     = Path(doc["file_path"])
    processed     = processor.process(file_path)
    if not processed.is_ok():
        return jsonify({"success": False, "error": processed.error_message}), 500

    extractor = AIExtractor(api_key=api_key)
    result    = extractor.extract(image_paths=processed.pages, schema=schema)

    if result.is_ok():
        db.update_document_status(doc_id, status="Completed", result_json=json.dumps(result.extracted_data))
        return jsonify({"success": True, "doc_id": doc_id, "data": result.extracted_data})
    else:
        db.update_document_status(doc_id, status="Failed")
        return jsonify({"success": False, "error": result.error_message}), 500

# ── Batch Endpoints ───────────────────────────────────────────────────────────
from batch_processor import BatchProcessor

batch_proc = BatchProcessor(db=db, key_mgr=key_mgr,
                             processor=processor, schema_bld=schema_bld)

@app.post("/api/batch")
@require_auth
def batch_upload():
    if "file" not in request.files:
        return jsonify({"error": "Δεν βρέθηκε αρχείο."}), 400
    f      = request.files["file"]
    suffix = Path(f.filename).suffix.lower()
    if suffix != ".pdf":
        return jsonify({"error": "Μόνο PDF αρχεία γίνονται δεκτά."}), 400
    schema_name    = request.form.get("schema_name", "invoice")
    auto_match     = request.form.get("auto_match", "false").lower() == "true"
    skip_completed = request.form.get("skip_completed", "false").lower() == "true"
    dest = UPLOAD_DIR / f.filename
    f.save(str(dest))
    job_id = batch_proc.submit(pdf_path=dest, schema_name=schema_name,
                               original_filename=f.filename,
                               auto_match=auto_match,
                               skip_completed=skip_completed)
    return jsonify({"success": True, "job_id": job_id,
                    "filename": f.filename, "schema_name": schema_name})

@app.get("/api/batch/<job_id>/status")
@require_auth
def batch_status(job_id):
    status = batch_proc.get_status(job_id)
    if not status:
        return jsonify({"error": f"Job '{job_id}' δεν βρέθηκε."}), 404
    return jsonify(status)

@app.get("/api/batch")
@require_auth
def batch_list():
    return jsonify({"jobs": batch_proc.list_jobs()})

# ── Auth Endpoints ────────────────────────────────────────────────────────────
@app.post("/api/auth/login")
def auth_login():
    data = request.get_json(force=True)
    username = data.get("username", "").strip()
    password = data.get("password", "")
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    user = db.get_user_by_username(username)
    if not user or not user.get("is_active"):
        return jsonify({"error": "Invalid credentials"}), 401
    if not check_password(password, user["password_hash"]):
        return jsonify({"error": "Invalid credentials"}), 401
    token = create_token(user["id"], user["username"])
    resp = make_response(jsonify({"success": True, "username": user["username"], "role": user["role"]}))
    resp.set_cookie(COOKIE_NAME, token, httponly=True, samesite="Lax", secure=False, max_age=86400, path="/")
    return resp

@app.post("/api/auth/logout")
def auth_logout():
    resp = make_response(jsonify({"success": True}))
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp

@app.get("/api/auth/me")
@require_auth
def auth_me():
    user = db.get_user_by_id(request.current_user["user_id"])
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"id": user["id"], "username": user["username"],
                     "role": user["role"], "created_at": user["created_at"]})

# ── Login Page ────────────────────────────────────────────────────────────────
LOGIN_HTML = """<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>FastWrite — Login</title>
<style>
:root{--bg:#0a0c10;--bg2:#111318;--bg3:#181c24;--border:#1e2330;--accent:#00e5a0;--text:#e8eaf0;--text2:#7c8299;--danger:#ff4444;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center;}
.login-card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:48px 40px;width:100%;max-width:400px;box-shadow:0 8px 32px rgba(0,0,0,0.5);}
.login-card h1{font-size:24px;margin-bottom:8px;letter-spacing:-0.5px;}
.login-card h1 span{color:var(--accent);}
.login-card p{color:var(--text2);font-size:14px;margin-bottom:32px;}
label{display:block;font-size:12px;color:var(--text2);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;}
input{width:100%;padding:12px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;margin-bottom:20px;outline:none;transition:border .2s;}
input:focus{border-color:var(--accent);}
button{width:100%;padding:14px;background:var(--accent);color:#0a0c10;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:opacity .2s;}
button:hover{opacity:.85;}
.error-msg{color:var(--danger);font-size:13px;margin-bottom:16px;display:none;}
</style>
</head>
<body>
<div class="login-card">
  <h1>Fast<span>Write</span></h1>
  <p>Sign in to continue</p>
  <div class="error-msg" id="error-msg"></div>
  <form id="login-form" onsubmit="return doLogin(event)">
    <label>Username</label>
    <input type="text" id="username" autocomplete="username" required/>
    <label>Password</label>
    <div style="position:relative">
      <input type="password" id="password" autocomplete="current-password" required style="width:100%;padding-right:40px"/>
      <span onclick="var p=document.getElementById('password');p.type=p.type==='password'?'text':'password'" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;color:#7c8299;font-size:18px;">👁</span>
    </div>
    <button type="submit">Sign In</button>
  </form>
</div>
<script>
async function doLogin(e){
  e.preventDefault();
  const err=document.getElementById('error-msg');
  err.style.display='none';
  try{
    const r=await fetch('/api/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:document.getElementById('username').value,password:document.getElementById('password').value})});
    const d=await r.json();
    if(r.ok){window.location.href='/ui';}
    else{err.textContent=d.error||'Login failed';err.style.display='block';}
  }catch(ex){err.textContent='Connection error';err.style.display='block';}
  return false;
}
</script>
</body>
</html>"""

@app.get("/ui/login")
def serve_login():
    return LOGIN_HTML, 200, {"Content-Type": "text/html"}

@app.get("/ui")
@app.get("/ui/")
def serve_ui():
    token = request.cookies.get(COOKIE_NAME)
    if not token or not verify_token(token):
        return redirect("/ui/login")
    return send_file("/app/projects/static/index.html")

@app.get("/ui/template-builder")
@app.get("/ui/template-builder/<int:doc_id>")
def serve_template_builder(doc_id=None):
    token = request.cookies.get(COOKIE_NAME)
    if not token or not verify_token(token):
        return redirect("/ui/login")
    return send_file("/app/projects/static/index.html")

@app.get("/ui/review/<int:doc_id>")
def serve_review_page(doc_id):
    """Standalone Review Page — PNG preview + canvas highlight + approve/reject."""
    token = request.cookies.get(COOKIE_NAME)
    if not token or not verify_token(token):
        return redirect("/ui/login")

    import json as _json, re as _re
    all_pending = db.list_documents(status="pending_review")
    pending_ids = [d["id"] for d in all_pending]
    doc = db.get_document(doc_id)
    if not doc:
        return "<h2>Not found</h2>", 404
    rd = {}
    if doc.get("result_json"):
        try: rd = _json.loads(doc["result_json"])
        except: pass

    page_num = 1
    fp = doc.get("file_path", "")
    m = _re.search(r"page_(\d+)", fp)
    if m:
        page_num = int(m.group(1))

    from pathlib import Path as _Path
    has_png = fp.lower().endswith(".png") and _Path(fp).exists()
    img_url = "/api/documents/%s/file" % doc_id
    original_filename = doc.get("original_filename") or doc.get("filename") or ""
    pdf_url = "/api/documents/%s/original-pdf#page=%s" % (doc_id, page_num)

    cur_pos = pending_ids.index(doc_id) if doc_id in pending_ids else 0
    total   = len(pending_ids)
    prev_id = pending_ids[cur_pos - 1] if cur_pos > 0 else None
    next_id = pending_ids[cur_pos + 1] if cur_pos < total - 1 else None
    pos_label = "%s / %s" % (cur_pos + 1, total) if total else "—"
    after_action = ('window.location.href="/ui/review/'+str(next_id)+'"') if next_id else 'history.back()'

    scalar_rows_html = ""
    line_items_data = {}
    for k, v in rd.items():
        if k.startswith("_"): continue
        if isinstance(v, list):
            line_items_data[k] = v
        else:
            scalar_rows_html += '<div class="field"><div class="field-label">%s</div><input class="field-input" data-key="%s" value="%s" oninput="markDirty()"/></div>' % (k, k, str(v) if v is not None else "")

    html = """<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Έγκριση — %(filename)s</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#0a0c10;color:#e0e0e0;height:100vh;display:flex;flex-direction:column;overflow:hidden}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:#111318;border-bottom:1px solid #1e2330;flex-shrink:0;gap:10px;flex-wrap:wrap;min-height:50px}
.topbar-title{font-size:13px;font-weight:600;color:#fff;flex:1}
.topbar-sub{font-size:10px;color:#666;font-family:monospace}
.topbar-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
.pos-label{font-size:11px;color:#666;font-family:monospace;white-space:nowrap}
.nav-btn{padding:5px 10px;border-radius:6px;background:#1e2330;border:1px solid #2a3040;color:#aaa;font-size:11px;cursor:pointer;text-decoration:none;white-space:nowrap}
.nav-btn:hover{border-color:#00e5a0;color:#00e5a0}
.nav-btn.disabled{opacity:0.3;pointer-events:none}
.btn{padding:6px 14px;border-radius:7px;border:none;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap}
.btn-back{background:#1e2330;color:#aaa;border:1px solid #2a3040}
.btn-back:hover{border-color:#aaa}
.btn-tmpl{background:rgba(0,102,255,0.12);color:#4d94ff;border:1px solid rgba(0,102,255,0.4)}
.btn-tmpl:hover{background:rgba(0,102,255,0.25)}
.btn-reject{background:rgba(255,68,68,0.12);color:#ff4444;border:1px solid rgba(255,68,68,0.4)}
.btn-reject:hover{background:#ff4444;color:#000}
.btn-approve{background:#00e5a0;color:#000}
.btn-approve:hover{background:#00ffb3}
.dirty-badge{display:none;background:#f59e0b;color:#000;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700;margin-left:6px}
.dirty-badge.show{display:inline}
.split{display:grid;grid-template-columns:1fr 1fr;flex:1;overflow:hidden;min-height:0}
.img-side{border-right:1px solid #1e2330;display:flex;flex-direction:column;overflow:hidden;position:relative;background:#111}
.img-wrap{flex:1;overflow:auto;position:relative;cursor:crosshair}
.img-wrap img{display:block;width:100%%;user-select:none;-webkit-user-drag:none}
.img-wrap canvas{position:absolute;top:0;left:0;pointer-events:none}
.img-bar{padding:6px 12px;background:#111318;border-bottom:1px solid #1e2330;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.img-bar-label{font-size:10px;color:#666;font-family:monospace}
.img-bar a{font-size:10px;color:#00e5a0;text-decoration:none}
.data-side{display:flex;flex-direction:column;overflow:hidden;min-height:0}
.scalar-section{flex-shrink:0;border-bottom:1px solid #1e2330}
.scalar-header{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:#111318;cursor:pointer;user-select:none}
.scalar-header span{font-size:10px;color:#666;font-family:monospace;letter-spacing:1px;text-transform:uppercase}
.toggle-icon{font-size:10px;color:#00e5a0}
.scalar-fields{display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px}
.scalar-fields.collapsed{display:none}
.field{display:flex;flex-direction:column;gap:3px;min-width:140px;flex:1}
.field-label{font-size:9px;color:#666;font-family:monospace;letter-spacing:.8px;text-transform:uppercase}
.field-input{background:#181c24;border:1px solid #1e2330;border-radius:6px;padding:6px 9px;color:#e0e0e0;font-size:12px;width:100%%;outline:none}
.field-input:focus{border-color:#00e5a0}
.field-input.modified{border-color:#f59e0b}
.li-section{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}
.li-header{padding:6px 12px;background:#111318;border-bottom:1px solid #1e2330;display:flex;align-items:center;gap:10px;flex-shrink:0}
.li-header-title{font-size:10px;color:#00e5a0;font-family:monospace;letter-spacing:1px;text-transform:uppercase;flex:1}
.li-nav{display:flex;align-items:center;gap:6px}
.li-nav-btn{background:#1e2330;border:1px solid #2a3040;color:#aaa;border-radius:5px;padding:2px 9px;font-size:13px;cursor:pointer;line-height:1.4}
.li-nav-btn:hover{border-color:#00e5a0;color:#00e5a0}
.li-nav-label{font-size:11px;color:#666;font-family:monospace;min-width:80px}
.li-add-btn{background:rgba(0,229,160,0.1);border:1px solid rgba(0,229,160,0.3);color:#00e5a0;border-radius:5px;padding:2px 10px;font-size:11px;cursor:pointer}
.li-add-btn:hover{background:rgba(0,229,160,0.2)}
.table-wrap{flex:1;overflow:auto}
table{width:100%%;border-collapse:collapse;font-size:12px}
th{background:#111318;padding:6px 8px;text-align:left;color:#666;font-family:monospace;font-size:9px;border-bottom:1px solid #1e2330;white-space:nowrap;text-transform:uppercase;letter-spacing:.8px}
td{padding:6px 8px;border-bottom:1px solid #181c24;color:#ccc;min-width:50px}
td[contenteditable]:focus{outline:1px solid #00e5a0;background:#0d1a0d}
td.modified{background:#1a1500}
tbody tr{cursor:pointer;transition:background .1s}
tbody tr:hover td{background:#181c24}
tbody tr.row-hl td{background:rgba(0,229,160,0.12)!important;color:#fff!important;outline:1px solid rgba(0,229,160,0.35)}
.toast{position:fixed;bottom:20px;left:50%%;transform:translateX(-50%%);background:#1a1a2a;border:1px solid #333;padding:10px 22px;border-radius:8px;font-size:13px;display:none;z-index:9999}
.toast.show{display:block}
</style>
</head>
<body>
<div class="topbar">
  <div style="flex:1;min-width:0">
    <div class="topbar-title">&#128196; %(filename)s <span class="dirty-badge" id="dirty-badge">&#9679; Αλλαγές</span></div>
    <div class="topbar-sub">Template: %(schema)s &nbsp;·&nbsp; %(date)s</div>
  </div>
  <div class="topbar-right">
    <span class="pos-label">%(pos_label)s</span>
    %(prev_btn)s
    %(next_btn)s
    <button class="btn btn-back" onclick="%(after_back)s">&#8592; Επιστροφή</button>
    <button class="btn btn-tmpl" onclick="window.open('/ui/template-builder/%(doc_id)s','_blank')">&#9998; Template Builder</button>
    <button class="btn btn-reject" onclick="doReject()">&#10005; Απόρριψη</button>
    <button class="btn btn-approve" onclick="doApprove()">&#10003; Έγκριση</button>
  </div>
</div>
<div class="split">
  <div class="img-side">
    <div class="img-bar">
      <span class="img-bar-label" id="img-bar-label">%(filename)s</span>
      <a href="%(pdf_url)s" target="_blank">&#8599; Άνοιγμα PDF</a>
    </div>
    <div class="img-wrap" id="img-wrap">
      <img id="doc-img" src="%(img_url)s" alt="%(filename)s" onload="onImgLoad()"/>
      <canvas id="hl-canvas"></canvas>
    </div>
  </div>
  <div class="data-side">
    <div class="scalar-section">
      <div class="scalar-header" onclick="toggleScalars()">
        <span>Γενικά Στοιχεία</span>
        <span class="toggle-icon" id="toggle-icon">&#9650; Απόκρυψη</span>
      </div>
      <div class="scalar-fields" id="scalar-fields">%(scalar_rows)s</div>
    </div>
    <div class="li-section" id="li-section" style="display:none">
      <div class="li-header">
        <span class="li-header-title" id="li-title">LINE ITEMS</span>
        <div class="li-nav">
          <button class="li-nav-btn" onclick="navRow(-1)" title="Προηγούμενη γραμμή">&#8593;</button>
          <button class="li-nav-btn" onclick="navRow(1)" title="Επόμενη γραμμή">&#8595;</button>
          <span class="li-nav-label" id="li-nav-label">—</span>
          <button class="li-add-btn" onclick="addRow()">+ Γραμμή</button>
        </div>
      </div>
      <div class="table-wrap">
        <table id="li-table"><thead id="li-thead"><tr></tr></thead><tbody id="li-tbody"></tbody></table>
      </div>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
const DOC_ID    = %(doc_id)s;
const LINE_DATA = %(line_data_json)s;
let dirty=false, curRow=-1, curArrKey=null, numRows=0, imgHeight=0;

(async function init(){
  await loadLinePositions();
  const keys=Object.keys(LINE_DATA);
  if(keys.length){curArrKey=keys[0];const rows=LINE_DATA[curArrKey];numRows=rows.length;renderTable(curArrKey,rows);document.getElementById('li-section').style.display='flex';document.getElementById('li-title').textContent='LINE ITEMS: '+curArrKey;updateNavLabel();}
})();

function toggleScalars(){const f=document.getElementById('scalar-fields');const i=document.getElementById('toggle-icon');f.classList.toggle('collapsed');i.textContent=f.classList.contains('collapsed')?'▼ Εμφάνιση':'▲ Απόκρυψη';}

function renderTable(key,rows){
  if(!rows.length)return;
  const cols=Object.keys(rows[0]);
  document.querySelector('#li-thead tr').innerHTML=cols.map(c=>'<th>'+c+'</th>').join('')+'<th style="width:30px"></th>';
  document.getElementById('li-tbody').innerHTML=rows.map((row,ri)=>'<tr id="row-'+ri+'" onclick="selectRow('+ri+')">'+cols.map(c=>'<td contenteditable="true" data-key="'+key+'" data-col="'+c+'" data-ri="'+ri+'" oninput="markDirty()">'+(row[c]!=null?row[c]:'')+'</td>').join('')+'<td style="text-align:center"><button onclick="deleteRow('+ri+')" style="background:none;border:none;color:#666;cursor:pointer;font-size:14px;" title="Διαγραφή">✕</button></td></tr>').join('');
}

function selectRow(ri){curRow=ri;document.querySelectorAll('#li-tbody tr').forEach(r=>r.classList.remove('row-hl'));const row=document.getElementById('row-'+ri);if(row){row.classList.add('row-hl');row.scrollIntoView({block:'nearest'});}updateNavLabel();drawHighlight(ri);}
function navRow(dir){if(numRows===0)return;const next=curRow+dir;if(next<0||next>=numRows)return;selectRow(next);}
function updateNavLabel(){const lbl=document.getElementById('li-nav-label');if(curRow<0){lbl.textContent=numRows+' γραμμές';return;}lbl.textContent='Γραμμή '+(curRow+1)+' / '+numRows;}

let linePositions=[];
async function loadLinePositions(){try{const res=await fetch('/api/documents/'+DOC_ID+'/line-positions',{credentials:'include'});const data=await res.json();linePositions=data.positions||[];}catch(e){linePositions=[];}}

function onImgLoad(){const img=document.getElementById('doc-img');const canvas=document.getElementById('hl-canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.style.width=img.clientWidth+'px';canvas.style.height=img.clientHeight+'px';imgHeight=img.naturalHeight;if(curRow>=0)drawHighlight(curRow);}

function drawHighlight(ri){
  const img=document.getElementById('doc-img');const canvas=document.getElementById('hl-canvas');
  if(!img.complete||canvas.width===0)return;
  canvas.style.width=img.clientWidth+'px';canvas.style.height=img.clientHeight+'px';
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  if(ri<0||numRows===0)return;
  let y,bandH;
  if(linePositions.length>ri){const pos=linePositions[ri];y=canvas.height*pos.top_pct;bandH=canvas.height*(pos.bottom_pct-pos.top_pct);}
  else{bandH=canvas.height/numRows;y=ri*bandH;}
  ctx.fillStyle='rgba(0,229,160,0.25)';ctx.strokeStyle='rgba(0,229,160,0.80)';ctx.lineWidth=2;
  ctx.fillRect(0,y,canvas.width,bandH);ctx.strokeRect(1,y+1,canvas.width-2,bandH-2);
}

window.addEventListener('resize',()=>{const img=document.getElementById('doc-img');const canvas=document.getElementById('hl-canvas');if(img&&canvas){canvas.style.width=img.clientWidth+'px';canvas.style.height=img.clientHeight+'px';}if(curRow>=0)drawHighlight(curRow);});
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.contentEditable==='true')return;if(e.key==='ArrowUp'){e.preventDefault();navRow(-1);}if(e.key==='ArrowDown'){e.preventDefault();navRow(1);}if(e.key==='Escape'){curRow=-1;document.querySelectorAll('#li-tbody tr').forEach(r=>r.classList.remove('row-hl'));drawHighlight(-1);updateNavLabel();}});

function addRow(){if(!curArrKey)return;const rows=LINE_DATA[curArrKey];const cols=rows.length?Object.keys(rows[0]):[];const nr={};cols.forEach(c=>nr[c]='');rows.push(nr);numRows=rows.length;renderTable(curArrKey,rows);markDirty();selectRow(numRows-1);}
function deleteRow(ri){if(!curArrKey)return;if(!confirm('Διαγραφή γραμμής '+(ri+1)+';'))return;LINE_DATA[curArrKey].splice(ri,1);numRows=LINE_DATA[curArrKey].length;renderTable(curArrKey,LINE_DATA[curArrKey]);markDirty();curRow=-1;updateNavLabel();drawHighlight(-1);}

function markDirty(){dirty=true;document.getElementById('dirty-badge').classList.add('show');}

function collectData(){
  const data={};
  document.querySelectorAll('.field-input').forEach(f=>{data[f.dataset.key]=f.value;});
  Object.keys(LINE_DATA).forEach(key=>{const rows=[];document.querySelectorAll('#li-tbody tr').forEach(tr=>{const row={};tr.querySelectorAll('td[contenteditable]').forEach(td=>{if(td.dataset.col)row[td.dataset.col]=td.textContent.trim();});if(Object.keys(row).length)rows.push(row);});data[key]=rows;});
  return data;
}

async function doApprove(){
  if(dirty){const r=await fetch('/api/documents/'+DOC_ID+'/data',{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(collectData())});if(!r.ok){showToast('Σφάλμα αποθήκευσης','#ff4444');return;}}
  const r=await fetch('/api/documents/'+DOC_ID+'/approve',{method:'POST',credentials:'include'});const j=await r.json();
  if(j.success){showToast('Εγκρίθηκε!','#00e5a0');setTimeout(()=>{%(after_action)s;},1200);}
  else showToast('Σφάλμα: '+j.error,'#ff4444');
}

async function doReject(){
  if(!confirm('Απόρριψη εγγράφου;'))return;
  const r=await fetch('/api/documents/'+DOC_ID+'/reject',{method:'POST',credentials:'include'});const j=await r.json();
  if(j.success){showToast('Απορρίφθηκε','#ff4444');setTimeout(()=>{%(after_action)s;},1200);}
  else showToast('Σφάλμα: '+j.error,'#ff4444');
}

function showToast(msg,color){const t=document.getElementById('toast');t.textContent=msg;t.style.borderColor=color||'#333';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000);}
</script>
</body>
</html>""" % {
        "filename":       doc["filename"],
        "schema":         doc.get("schema_name", "—"),
        "date":           (doc.get("created_at") or "").split("T")[0],
        "pos_label":      pos_label,
        "prev_btn":       ('<a href="/ui/review/%s" class="nav-btn">&#9664; Προηγ.</a>' % prev_id) if prev_id else '<span class="nav-btn disabled">&#9664; Προηγ.</span>',
        "next_btn":       ('<a href="/ui/review/%s" class="nav-btn">Επόμ. &#9654;</a>' % next_id) if next_id else '<span class="nav-btn disabled">Επόμ. &#9654;</span>',
        "after_back":     "if(window.opener||window.history.length<=1){window.close()}else{history.back()}",
        "after_action":   after_action,
        "doc_id":         doc_id,
        "img_url":        img_url,
        "pdf_url":        pdf_url,
        "scalar_rows":    scalar_rows_html,
        "line_data_json": _json.dumps(line_items_data, ensure_ascii=False),
    }

    resp = make_response(html)
    resp.headers["Content-Type"] = "text/html; charset=utf-8"
    return resp
