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
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
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

@app.post("/api/upload/pre-check")
@require_auth
def upload_pre_check():
    """
    Pre-check για μεμονωμένο αρχείο: ανιχνεύει τον προμηθευτή και ελέγχει αν
    υπάρχει αντίστοιχο template.
    """
    if "file" not in request.files:
        return jsonify({"error": "Δεν βρέθηκε αρχείο."}), 400
    f = request.files["file"]
    suffix = Path(f.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Μη αποδεκτός τύπος: '{suffix}'."}), 400

    dest = UPLOAD_DIR / f.filename
    f.save(str(dest))

    try:
        from ai_extractor import AIExtractor
        from batch_processor import SUPPLIER_DETECT_PROMPT
        api_key = key_mgr.get_key("gemini")
        if not api_key:
            return jsonify({"error": "Gemini API key δεν βρέθηκε."}), 500

        # Μετατροπή σε εικόνα
        processed = processor.process(dest)
        if not processed.is_ok():
            return jsonify({"error": f"Σφάλμα επεξεργασίας: {processed.error_message}"}), 500

        extractor = AIExtractor(api_key=api_key)
        supplier_schema = {
            "type": "object",
            "properties": {"supplier_name": {"type": "string"}},
            "required": ["supplier_name"]
        }

        detected_supplier = "unknown"
        matched_template = None
        first_page = processed.pages[0] if processed.pages else None

        if first_page:
            try:
                sup_result = extractor.extract(
                    image_paths=[first_page],
                    schema=supplier_schema,
                    extra_instructions=SUPPLIER_DETECT_PROMPT
                )
                if sup_result.is_ok():
                    detected_supplier = (sup_result.extracted_data.get("supplier_name") or "").strip()
                    if not detected_supplier or detected_supplier.upper() == "UNKNOWN":
                        detected_supplier = "unknown"
            except:
                pass

        # Template matching
        templates = db.list_templates()
        if detected_supplier and detected_supplier != "unknown":
            detected_lower = detected_supplier.lower()
            for tmpl in templates:
                pattern = (tmpl.get("supplier_pattern") or "").strip().lower()
                if not pattern:
                    continue
                keywords = [k.strip() for k in pattern.split(",") if k.strip()]
                for kw in keywords:
                    if kw and kw in detected_lower:
                        matched_template = tmpl["name"]
                        break
                if matched_template:
                    break

        # Έλεγχος require_review
        needs_approval = False
        if matched_template:
            templates_dict = {t["name"]: t for t in templates}
            tmpl = templates_dict.get(matched_template, {})
            needs_approval = bool(tmpl.get("require_review"))

        return jsonify({
            "success": True,
            "filename": f.filename,
            "total_invoices": 1,
            "supplier": detected_supplier,
            "matched_template": matched_template,
            "without_template": 0 if matched_template else 1,
            "with_template": 1 if matched_template else 0,
            "needs_approval": 1 if needs_approval else 0,
            "no_approval": 1 if (matched_template and not needs_approval) else 0
        })

    except Exception as e:
        return jsonify({"error": f"Σφάλμα pre-check: {str(e)}"}), 500


# ── Documents ─────────────────────────────────────────────────────────────────
@app.get("/api/documents")
@require_auth
def list_documents():
    docs = db.list_documents(status=request.args.get("status"))
    # Hide batch parent documents (original PDFs that were split into pages)
    batch_parents = set()
    for d in docs:
        of = d.get("original_filename")
        if of and of != d.get("filename"):
            batch_parents.add(of)
    docs = [d for d in docs if d.get("filename") not in batch_parents]
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
def approve_document(doc_id):
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    old_status = doc.get("status", "?")
    db.update_document_status(doc_id, status="Completed", result_json=doc.get("result_json"))
    updated = db.get_document(doc_id)
    new_status = updated.get("status", "?") if updated else "NOT_FOUND"
    print(f"[APPROVE] doc #{doc_id}: {old_status} → {new_status}", flush=True)
    return jsonify({"success": True, "doc_id": doc_id, "status": new_status})

@app.post("/api/documents/<int:doc_id>/reject")
def reject_document(doc_id):
    if not db.get_document(doc_id):
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    db.update_document_status(doc_id, status="Failed")
    return jsonify({"success": True, "doc_id": doc_id, "status": "Failed"})

@app.route("/api/documents/<int:doc_id>/data", methods=["PATCH"])
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
    """Επιστρέφει τις y-θέσεις των γραμμών του πίνακα (ως % ύψους σελίδας)."""
    import re as _re
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404

    original = doc.get("original_filename") or doc.get("filename") or ""
    pdf_path = UPLOAD_DIR / original
    if not pdf_path.exists() or not str(pdf_path).lower().endswith(".pdf"):
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
        db.update_document_status(doc_id, status="pending_review", result_json=json.dumps(result.extracted_data))
        return jsonify({"success": True, "doc_id": doc_id, "data": result.extracted_data, "status": "pending_review"})
    else:
        db.update_document_status(doc_id, status="Failed")
        return jsonify({"success": False, "error": result.error_message}), 500

# ── Batch Endpoints ───────────────────────────────────────────────────────────
from batch_processor import BatchProcessor

batch_proc = BatchProcessor(db=db, key_mgr=key_mgr,
                             processor=processor, schema_bld=schema_bld)

@app.post("/api/batch/pre-check")
@require_auth
def batch_pre_check():
    """
    Pre-check: Κάνει segmentation + supplier detection + template matching.
    Επιστρέφει στατιστικά πριν ξεκινήσει το batch.
    """
    if "file" not in request.files:
        return jsonify({"error": "Δεν βρέθηκε αρχείο."}), 400
    f = request.files["file"]
    suffix = Path(f.filename).suffix.lower()
    if suffix != ".pdf":
        return jsonify({"error": "Μόνο PDF αρχεία γίνονται δεκτά."}), 400

    dest = UPLOAD_DIR / f.filename
    f.save(str(dest))

    try:
        # Pass 1: Μετατροπή σελίδων σε εικόνες
        processed = processor.process(dest)
        if not processed.is_ok():
            return jsonify({"error": f"Σφάλμα επεξεργασίας: {processed.error_message}"}), 500
        all_pages = processed.pages
        total_pages = len(all_pages)

        # Pass 2: Segmentation — εντοπισμός ορίων τιμολογίων
        from ai_extractor import AIExtractor
        api_key = key_mgr.get_key("gemini")
        if not api_key:
            return jsonify({"error": "Gemini API key δεν βρέθηκε."}), 500

        extractor = AIExtractor(api_key=api_key)
        seg_schema = {
            "type": "object",
            "properties": {
                "pages": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "page":    {"type": "integer"},
                            "new_doc": {"type": "boolean"},
                        },
                        "required": ["page", "new_doc"],
                    }
                }
            },
            "required": ["pages"],
        }

        from batch_processor import SEGMENTATION_PROMPT, SUPPLIER_DETECT_PROMPT, BATCH_SIZE
        page_labels = {}
        for batch_start in range(0, len(all_pages), BATCH_SIZE):
            batch_pages = all_pages[batch_start: batch_start + BATCH_SIZE]
            result = extractor.extract(image_paths=batch_pages, schema=seg_schema,
                                        extra_instructions=SEGMENTATION_PROMPT)
            if result.is_ok():
                for item in result.extracted_data.get("pages", []):
                    local_page  = item.get("page", 0)
                    global_page = batch_start + local_page
                    page_labels[global_page] = item.get("new_doc", False)
            else:
                for i in range(len(batch_pages)):
                    page_labels[batch_start + i + 1] = True
        page_labels[1] = True

        # Δημιουργία segments
        segments = []
        current_seg = None
        for i, page_path in enumerate(all_pages):
            page_num = i + 1
            is_new   = page_labels.get(page_num, True)
            if is_new or current_seg is None:
                current_seg = {"pages": [], "page_nums": []}
                segments.append(current_seg)
            current_seg["pages"].append(str(page_path))
            current_seg["page_nums"].append(page_num)

        total_invoices = len(segments)

        # Pass 3: Supplier detection + template matching για κάθε segment
        supplier_schema = {
            "type": "object",
            "properties": {"supplier_name": {"type": "string"}},
            "required": ["supplier_name"]
        }
        templates = db.list_templates()
        invoices_info = []

        for idx, seg in enumerate(segments):
            first_page = seg["pages"][0]
            detected_supplier = "unknown"
            matched_template = None

            try:
                sup_result = extractor.extract(
                    image_paths=[first_page],
                    schema=supplier_schema,
                    extra_instructions=SUPPLIER_DETECT_PROMPT
                )
                if sup_result.is_ok():
                    detected_supplier = (sup_result.extracted_data.get("supplier_name") or "").strip()
                    if not detected_supplier or detected_supplier.upper() == "UNKNOWN":
                        detected_supplier = "unknown"
            except:
                pass

            # Template matching
            if detected_supplier and detected_supplier != "unknown":
                detected_lower = detected_supplier.lower()
                for tmpl in templates:
                    pattern = (tmpl.get("supplier_pattern") or "").strip().lower()
                    if not pattern:
                        continue
                    keywords = [k.strip() for k in pattern.split(",") if k.strip()]
                    for kw in keywords:
                        if kw and kw in detected_lower:
                            matched_template = tmpl["name"]
                            break
                    if matched_template:
                        break

            invoices_info.append({
                "index": idx + 1,
                "pages": seg["page_nums"],
                "supplier": detected_supplier,
                "matched_template": matched_template
            })

        # Υπολογισμός στατιστικών
        without_template = sum(1 for inv in invoices_info if not inv["matched_template"])
        with_template = sum(1 for inv in invoices_info if inv["matched_template"])
        # Τιμολόγια που χρειάζονται έγκριση = αυτά που ΕΧΟΥΝtemplate ΚΑΙ
        # το template τους έχει require_review=True
        templates_dict = {t["name"]: t for t in templates}
        needs_approval = 0
        no_approval = 0
        for inv in invoices_info:
            if inv["matched_template"]:
                tmpl = templates_dict.get(inv["matched_template"], {})
                if tmpl.get("require_review"):
                    needs_approval += 1
                else:
                    no_approval += 1

        return jsonify({
            "success": True,
            "filename": f.filename,
            "total_pages": total_pages,
            "total_invoices": total_invoices,
            "without_template": without_template,
            "with_template": with_template,
            "needs_approval": needs_approval,
            "no_approval": no_approval,
            "invoices": invoices_info
        })

    except Exception as e:
        return jsonify({"error": f"Σφάλμα pre-check: {str(e)}"}), 500


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
.pdf-bar{padding:7px 14px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.pdf-bar-label{font-family:'DM Mono',monospace;font-size:11px;color:var(--text2);}

/* ── Right column ── */
.right-col{display:flex;flex-direction:column;overflow:hidden;min-height:0;}
.editor{flex:0 0 55%;overflow-y:auto;padding:20px;}
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
        <span class="sup-chevron" id="sup-chevron">&#9650;</span>
      </div>
      <div class="sup-modes">
        <button class="mode-btn active-warn" id="mode-notmpl" onclick="setMode('notmpl')">&#9888; Χωρίς Template</button>
        <button class="mode-btn" id="mode-review" onclick="setMode('review')">&#10003; Τιμολόγια Έγκριση</button>
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
      <a id="pdf-open-link" href="#" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none;font-family:'DM Mono',monospace;">&#8599; Νέο tab</a>
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
  document.getElementById('sup-chevron').textContent = supCollapsed ? '\u25BC' : '\u25B2';
}

function setMode(mode) {
  currentMode = mode;
  document.getElementById('mode-notmpl').className = 'mode-btn' + (mode==='notmpl' ? ' active-warn' : '');
  document.getElementById('mode-review').className = 'mode-btn' + (mode==='review' ? ' active-blue' : '');
  document.getElementById('sup-search').value = '';
  renderSupList(allDocs, '');
}

function getSupplierName(doc) {
  if (!doc.result_json) return null;
  try {
    const rd = JSON.parse(doc.result_json);
    return rd._matched_supplier || rd.supplier_name || rd.vendor_name || rd.company || rd.issuer || null;
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
      ? (ql ? 'Δεν βρέθηκε' : '\u2713 Όλα έχουν template!')
      : (ql ? 'Δεν βρέθηκε' : '\u2713 Κανένα προς έγκριση');
    el.innerHTML = '<div style="color:var(--accent);font-size:12px;padding:10px;text-align:center;">' + msg + '</div>';
    return;
  }

  el.innerHTML = filtered.map(d => {
    const sup = d._supplier || d.filename || ('Doc #' + d.id);
    const supShort = sup.length > 30 ? sup.slice(0,28) + '\u2026' : sup;
    const supEscaped = sup.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const badge = !d._matched
      ? '<span class="sup-badge sup-badge-notmpl">\u26A0 Χωρίς</span>'
      : d.status==='pending_review'
        ? '<span class="sup-badge sup-badge-review">\u23F3</span>'
        : '<span class="sup-badge sup-badge-tmpl">\u2713 '+d._matched+'</span>';
    const itemClass = !d._matched ? 'no-tmpl' : d.status==='pending_review' ? 'needs-review' : 'has-tmpl';
    return '<div class="sup-item ' + itemClass + '" id="si-'+d.id+'">'
         + '<span class="sup-name" title="'+sup+'">'+supShort+'</span>'
         + badge
         + '<button class="sup-copy-btn" onclick="copySupplier(\'' + supEscaped + '\')" title="Αντιγραφή">\u2398</button>'
         + '<button class="sup-copy-btn" onclick="openDoc('+d.id+')" title="Άνοιγμα PDF" style="color:var(--accent2);">\u2192</button>'
         + '</div>';
  }).join('');
}

function goToReview(docId, status, hasData) {
  if (!hasData) {
    alert('Πρέπει πρώτα να εκτελέσετε [Έναρξη Batch] πριν από τη διαδικασία έγκρισης.\n\nΕπιστρέψτε στη σελίδα Upload & Extract και πατήστε "Έναρξη Batch".');
    return;
  }
  window.location.href = '/ui/review/' + docId;
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
  addField(); addField(); addField();
  await loadTemplates();
  await loadDocList(allTemplates);
})();

// ── Navigation ────────────────────────────────────────────────────────────────
function goBack() {
  if (window.opener && !window.opener.closed) {
    try { window.opener.showPage('upload'); } catch(e) {}
    window.close();
  } else {
    window.location.href = '/ui#upload';
  }
}

// ── API helper (with credentials for JWT) ────────────────────────────────────
async function apiFetch(method, url, body) {
  const opts = { method, headers: {}, credentials: 'include' };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  if (r.status === 401) { window.location.href = '/ui/login'; return {error:'Session expired'}; }
  return r.json();
}

// ── Templates list ────────────────────────────────────────────────────────────
async function loadTemplates(refreshDocList) {
  const el = document.getElementById('tmpl-list');
  try {
    const res = await apiFetch('GET', '/api/templates');
    allTemplates = res.templates || [];
    renderTemplates(allTemplates);
    if (refreshDocList && allDocs.length) {
      allDocs = allDocs.map(d => ({...d, _matched: getMatchedTemplate(d, allTemplates)}));
      renderSupList(allDocs, '');
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
    return '<div class="tmpl-item" id="ti-' + t.name.replace(/[^a-zA-Z0-9]/g,'_') + '">'
      + '<div style="flex:1;min-width:0;">'
      + '<div class="tmpl-name">' + t.name + '</div>'
      + '<div class="tmpl-meta">' + spBadge + rvBadge
      + '<span class="badge-gray">' + cnt + ' πεδία</span></div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;">'
      + '<button class="btn-green" onclick="loadTemplate(\'' + nameEsc + '\')">[In] Φόρτωση</button>'
      + '<button class="btn-blue" onclick="copyTemplate(\'' + nameEsc + '\')">[Copy] Αντιγραφή</button>'
      + '</div></div>';
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
        if (subList) { subList.innerHTML = '';
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
  div.innerHTML = '<input class="form-input" placeholder="Όνομα πεδίου" style="font-size:13px"/>'
    + '<select class="form-input" style="font-size:13px" onchange="onFieldTypeChange(this)">'
    + '<option value="string">string</option><option value="number">number</option>'
    + '<option value="date">date</option><option value="integer">integer</option>'
    + '<option value="boolean">boolean</option><option value="array">array (line items)</option></select>'
    + '<button class="field-remove" onclick="this.closest(\'.field-row-wrap\').remove()">x</button>';
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
    panel.innerHTML = '<div class="array-subfields-title">[Copy] Στήλες Line Items</div>'
      + '<div class="subfield-list">'
      + defaultSubfieldRow('description','string')
      + defaultSubfieldRow('quantity','number')
      + defaultSubfieldRow('unit_price','number')
      + defaultSubfieldRow('total','number')
      + '</div>'
      + '<button type="button" onclick="addSubfield(this)" style="font-size:12px;color:var(--accent);background:none;border:none;cursor:pointer;margin-top:4px;">+ Προσθήκη στήλης</button>';
    wrap.appendChild(panel);
  }
}

function defaultSubfieldRow(name, type) {
  const types = ['string','number','integer','date','boolean'];
  const opts = types.map(t=>'<option value="'+t+'" '+(t===type?'selected':'')+'>'+t+'</option>').join('');
  return '<div class="subfield-row">'
    + '<input class="form-input" value="'+name+'" placeholder="Όνομα στήλης" style="font-size:12px"/>'
    + '<select class="form-input" style="font-size:12px">'+opts+'</select>'
    + '<button type="button" onclick="this.closest(\'.subfield-row\').remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:4px">x</button></div>';
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
    await loadTemplates(true);
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
    if not doc_id:
        return redirect("/ui")
    doc = db.get_document(doc_id)
    if not doc:
        return "<h2>Not found</h2>", 404
    resp = make_response(_TEMPLATE_BUILDER_HTML.encode('utf-8'))
    resp.headers["Content-Type"] = "text/html; charset=utf-8"
    return resp

@app.get("/ui/review/<int:doc_id>")
def serve_review_page(doc_id):
    """Standalone Review Page — PNG preview + canvas highlight + approve/reject."""
    token = request.cookies.get(COOKIE_NAME)
    if not token or not verify_token(token):
        return redirect("/ui/login")

    import json as _json, re as _re
    doc = db.get_document(doc_id)
    if not doc:
        return "<h2>Not found</h2>", 404
    if not doc.get("result_json"):
        return """<html><body style='background:#0a0c10;color:#e0e0e0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:20px'>
        <h2>Δεν υπάρχουν εξαγόμενα δεδομένα</h2>
        <p style='color:#888'>Πρέπει πρώτα να εκτελέσετε <b>Έναρξη Batch</b> πριν από τη διαδικασία έγκρισης.</p>
        <a href='javascript:history.back()' style='color:#00e5a0'>← Επιστροφή</a>
        </body></html>""", 200

    # Get ALL batch siblings (not just pending_review) for navigation
    original = doc.get("original_filename")
    if original:
        all_docs = db.list_documents()
        sibling_docs = [d for d in all_docs
                        if d.get("original_filename") == original
                        and d.get("filename") != original
                        and d.get("result_json")]
        sibling_docs.sort(key=lambda d: d["id"])
    else:
        sibling_docs = [doc] if doc.get("result_json") else []

    sibling_ids = [d["id"] for d in sibling_docs]

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

    cur_pos = sibling_ids.index(doc_id) if doc_id in sibling_ids else 0
    total   = len(sibling_ids)
    prev_id = sibling_ids[cur_pos - 1] if cur_pos > 0 else None
    next_id = sibling_ids[cur_pos + 1] if cur_pos < total - 1 else None
    pos_label = "%s / %s" % (cur_pos + 1, total) if total else "—"
    after_action = ('location.replace("/ui/review/'+str(next_id)+'")') if next_id else 'window.location.href="/ui#upload"'

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
          <button class="li-nav-btn" onclick="navRow(-1)" title="Προηγούμενη γραμμή (&#8593;)">&#8593;</button>
          <button class="li-nav-btn" onclick="navRow(1)" title="Επόμενη γραμμή (&#8595;)">&#8595;</button>
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
let dirty       = false;
let curRow      = -1;
let curArrKey   = null;
let numRows     = 0;
let imgHeight   = 0;

(async function init() {
  await loadLinePositions();
  const keys = Object.keys(LINE_DATA);
  if (keys.length) {
    curArrKey = keys[0];
    const rows = LINE_DATA[curArrKey];
    numRows = rows.length;
    renderTable(curArrKey, rows);
    document.getElementById('li-section').style.display = 'flex';
    document.getElementById('li-title').textContent = 'LINE ITEMS: ' + curArrKey;
    updateNavLabel();
  }
})();

function toggleScalars() {
  const f = document.getElementById('scalar-fields');
  const i = document.getElementById('toggle-icon');
  f.classList.toggle('collapsed');
  i.textContent = f.classList.contains('collapsed') ? '\\u25bc Εμφάνιση' : '\\u25b2 Απόκρυψη';
}

function renderTable(key, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  document.querySelector('#li-thead tr').innerHTML = cols.map(c => '<th>' + c + '</th>').join('') + '<th style="width:30px"></th>';
  document.getElementById('li-tbody').innerHTML = rows.map((row, ri) =>
    '<tr id="row-'+ri+'" onclick="selectRow('+ri+')">' +
    cols.map(c => '<td contenteditable="true" data-key="'+key+'" data-col="'+c+'" data-ri="'+ri+'" oninput="markDirty()">'+(row[c]!=null?row[c]:'')+'</td>').join('') +
    '<td style="text-align:center"><button onclick="deleteRow('+ri+')" style="background:none;border:none;color:#666;cursor:pointer;font-size:14px;" title="Διαγραφή">\\u2715</button></td>' +
    '</tr>'
  ).join('');
}

function selectRow(ri) {
  curRow = ri;
  document.querySelectorAll('#li-tbody tr').forEach(r => r.classList.remove('row-hl'));
  const row = document.getElementById('row-' + ri);
  if (row) { row.classList.add('row-hl'); row.scrollIntoView({block:'nearest'}); }
  updateNavLabel();
  drawHighlight(ri);
}

function navRow(dir) {
  if (numRows === 0) return;
  const next = curRow + dir;
  if (next < 0 || next >= numRows) return;
  selectRow(next);
}

function updateNavLabel() {
  const lbl = document.getElementById('li-nav-label');
  if (curRow < 0) { lbl.textContent = numRows + ' γραμμές'; return; }
  lbl.textContent = 'Γραμμή ' + (curRow + 1) + ' / ' + numRows;
}

let linePositions = [];
async function loadLinePositions() {
  try {
    const res = await fetch('/api/documents/' + DOC_ID + '/line-positions', {credentials:'include'});
    const data = await res.json();
    linePositions = data.positions || [];
    console.log('Line positions loaded:', linePositions.length);
  } catch(e) { linePositions = []; }
}

function onImgLoad() {
  const img    = document.getElementById('doc-img');
  const canvas = document.getElementById('hl-canvas');
  canvas.width  = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.style.width  = img.clientWidth  + 'px';
  canvas.style.height = img.clientHeight + 'px';
  imgHeight = img.naturalHeight;
  if (curRow >= 0) drawHighlight(curRow);
}

function drawHighlight(ri) {
  const img    = document.getElementById('doc-img');
  const canvas = document.getElementById('hl-canvas');
  if (!img.complete || canvas.width === 0) return;
  canvas.style.width  = img.clientWidth  + 'px';
  canvas.style.height = img.clientHeight + 'px';
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (ri < 0 || numRows === 0) return;
  let y, bandH;
  if (linePositions.length > ri) {
    const pos = linePositions[ri];
    y     = canvas.height * pos.top_pct;
    bandH = canvas.height * (pos.bottom_pct - pos.top_pct);
  } else {
    bandH = canvas.height / numRows;
    y     = ri * bandH;
  }
  ctx.fillStyle   = 'rgba(0, 229, 160, 0.25)';
  ctx.strokeStyle = 'rgba(0, 229, 160, 0.80)';
  ctx.lineWidth   = 2;
  ctx.fillRect(0, y, canvas.width, bandH);
  ctx.strokeRect(1, y + 1, canvas.width - 2, bandH - 2);
}

window.addEventListener('resize', function() {
  const img    = document.getElementById('doc-img');
  const canvas = document.getElementById('hl-canvas');
  if (img && canvas) {
    canvas.style.width  = img.clientWidth  + 'px';
    canvas.style.height = img.clientHeight + 'px';
  }
  if (curRow >= 0) drawHighlight(curRow);
});

document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') return;
  if (e.key === 'ArrowUp')   { e.preventDefault(); navRow(-1); }
  if (e.key === 'ArrowDown') { e.preventDefault(); navRow(1);  }
  if (e.key === 'Escape')    { curRow = -1; document.querySelectorAll('#li-tbody tr').forEach(function(r){r.classList.remove('row-hl');}); drawHighlight(-1); updateNavLabel(); }
});

function addRow() {
  if (!curArrKey) return;
  const rows = LINE_DATA[curArrKey];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const newRow = {};
  cols.forEach(function(c){ newRow[c] = ''; });
  rows.push(newRow);
  numRows = rows.length;
  renderTable(curArrKey, rows);
  markDirty();
  selectRow(numRows - 1);
}

function deleteRow(ri) {
  if (!curArrKey) return;
  if (!confirm('Διαγραφή γραμμής ' + (ri+1) + ';')) return;
  LINE_DATA[curArrKey].splice(ri, 1);
  numRows = LINE_DATA[curArrKey].length;
  renderTable(curArrKey, LINE_DATA[curArrKey]);
  markDirty();
  curRow = -1;
  updateNavLabel();
  drawHighlight(-1);
}

function markDirty() {
  dirty = true;
  document.getElementById('dirty-badge').classList.add('show');
}

function collectData() {
  const data = {};
  document.querySelectorAll('.field-input').forEach(function(f){ data[f.dataset.key] = f.value; });
  Object.keys(LINE_DATA).forEach(function(key) {
    const rows = [];
    document.querySelectorAll('#li-tbody tr').forEach(function(tr) {
      const row = {};
      tr.querySelectorAll('td[contenteditable]').forEach(function(td) {
        if (td.dataset.col) row[td.dataset.col] = td.textContent.trim();
      });
      if (Object.keys(row).length) rows.push(row);
    });
    data[key] = rows;
  });
  return data;
}

async function doApprove() {
  try {
    // Save edits first if any changes were made
    if (dirty) {
      const sr = await fetch('/api/documents/' + DOC_ID + '/data', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(collectData())
      });
      if (!sr.ok) { showToast('Σφάλμα αποθήκευσης: ' + sr.status, '#ff4444'); return; }
    }
    // Approve
    const r = await fetch('/api/documents/' + DOC_ID + '/approve', {method:'POST', credentials:'include'});
    if (!r.ok) { showToast('HTTP Error: ' + r.status, '#ff4444'); return; }
    const j = await r.json();
    if (j.success) {
      showToast('Εγκρίθηκε! (' + j.status + ')', '#00e5a0');
      setTimeout(function(){ %(after_action)s; }, 1200);
    } else {
      showToast('Σφάλμα: ' + (j.error || 'Unknown'), '#ff4444');
    }
  } catch(err) {
    showToast('JS Error: ' + err.message, '#ff4444');
  }
}

async function doReject() {
  if (!confirm('Απόρριψη εγγράφου;')) return;
  try {
    const r = await fetch('/api/documents/' + DOC_ID + '/reject', {method:'POST', credentials:'include'});
    const j = await r.json();
    if (j.success) { showToast('Απορρίφθηκε', '#ff4444'); setTimeout(function(){ %(after_action)s; }, 1200); }
    else showToast('Σφάλμα: ' + (j.error || 'Unknown'), '#ff4444');
  } catch(err) {
    showToast('JS Error: ' + err.message, '#ff4444');
  }
}

function showToast(msg, color) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.borderColor = color || '#333';
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 3000);
}
</script>
</body>
</html>""" % {
        "filename":       doc["filename"],
        "schema":         doc.get("schema_name", "—"),
        "date":           (doc.get("created_at") or "").split("T")[0],
        "pos_label":      pos_label,
        "prev_btn":       ('<span class="nav-btn" onclick="location.replace(\'/ui/review/%s\')" style="cursor:pointer">&#9664; Προηγ.</span>' % prev_id) if prev_id else '<span class="nav-btn disabled">&#9664; Προηγ.</span>',
        "next_btn":       ('<span class="nav-btn" onclick="location.replace(\'/ui/review/%s\')" style="cursor:pointer">Επόμ. &#9654;</span>' % next_id) if next_id else '<span class="nav-btn disabled">Επόμ. &#9654;</span>',
        "after_back":     "history.back()",
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
