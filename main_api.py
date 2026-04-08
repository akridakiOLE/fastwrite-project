"""
Module 8: Τοπικός Διακομιστής (Flask) & Σύνδεση με Frontend
Domain: fastwrite.duckdns.org
"""
import json
import sys
import io
import base64
import logging
from datetime import datetime
from pathlib import Path
from flask import Flask, jsonify, request, send_file, make_response, redirect
from db_manager     import DatabaseManager
from auth_manager   import create_token, verify_token, hash_password, check_password, require_auth, require_admin, COOKIE_NAME
from key_manager    import KeyManager
from file_processor import FileProcessor
from schema_builder import SchemaBuilder
from validator      import InvoiceValidator
from exporter       import DocumentExporter
import billing_manager

# ── Logging setup — εξασφαλίζει ότι τα logs φτάνουν στο journalctl ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

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

# ── Seed default pricing plans on startup ──
db.seed_default_plans()

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_ORIGINS = [
    "http://localhost:3000","http://localhost:5173","http://localhost:8080",
    "https://fastwrite.duckdns.org","http://fastwrite.duckdns.org",
    "https://fastwrite.tech","http://fastwrite.tech",
    "https://www.fastwrite.tech","http://www.fastwrite.tech",
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
    return redirect("/ui")

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
    uid = request.current_user["user_id"]
    data = request.get_json(force=True)
    try:
        schema = schema_bld.build_from_list(data.get("fields", []))
        db.save_template(
            data.get("name",""),
            data.get("fields",[]),
            require_review=bool(data.get("require_review", False)),
            supplier_pattern=data.get("supplier_pattern"),
            user_id=uid
        )
        # ── Auto-update activity history results ──────────────────────────
        updated_activities = _recalc_activities_after_template_change(uid=uid)
        return jsonify({
            "success": True,
            "name": data.get("name"),
            "json_schema": schema,
            "updated_activities": updated_activities
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


def _match_supplier_to_template(supplier, templates):
    """Match a supplier name against template supplier_patterns.
    Returns template name or None."""
    if not supplier or supplier.lower() == "unknown":
        return None
    sup_lower = supplier.lower()
    for tmpl in templates:
        pattern = (tmpl.get("supplier_pattern") or "").strip().lower()
        if not pattern:
            continue
        keywords = [k.strip() for k in pattern.split(",") if k.strip()]
        for kw in keywords:
            if kw and kw in sup_lower:
                return tmpl["name"]
    return None


def _recalc_activities_after_template_change(uid: int = None):
    """Re-match suppliers in ALL activity entries against current templates.
    Handles both pre-check entries (with invoices array) and batch entries
    (with doc_ids — looks up actual documents in the database).
    Also checks document status: Completed docs count as no_approval.
    Returns list of activity IDs that were updated."""
    templates = db.list_templates(user_id=uid)
    templates_dict = {t["name"]: t for t in templates}
    activities = db.list_activities(limit=500, user_id=uid)
    updated_ids = []

    logger.info("[_recalc] START — %d templates, %d activities",
                len(templates), len(activities))

    # Build a map of original_filename → list of documents for pre-check lookups
    all_docs = db.list_documents(user_id=uid)
    docs_by_filename = {}
    for d in all_docs:
        ofn = d.get("original_filename") or ""
        if ofn:
            docs_by_filename.setdefault(ofn, []).append(d)

    for act in activities:
      try:
        rj = act.get("result_json")
        if not rj:
            continue
        try:
            result_data = json.loads(rj)
        except (json.JSONDecodeError, TypeError):
            continue

        invoices = result_data.get("invoices")
        doc_ids  = result_data.get("doc_ids")

        new_without = 0
        new_needs   = 0
        new_no_appr = 0
        total_count = 0

        if invoices and isinstance(invoices, list):
            # ── Pre-check entries (or batch with cached invoices): per-invoice supplier info ──
            total_count = len(invoices)

            # Build doc status map from linked doc_ids or from filename match
            doc_status_map = {}  # supplier → status (best effort)
            act_filename = act.get("filename") or ""
            sibling_docs = docs_by_filename.get(act_filename, [])
            # Map each sibling doc to its supplier for status lookup
            for sd in sibling_docs:
                sd_result = {}
                if sd.get("result_json"):
                    try:
                        sd_result = json.loads(sd["result_json"])
                    except (json.JSONDecodeError, TypeError):
                        pass
                sd_supplier = (sd_result.get("supplier_name") or
                               sd_result.get("vendor_name") or
                               sd_result.get("company") or "").strip().lower()
                if sd_supplier:
                    doc_status_map[sd_supplier] = sd.get("status", "")

            for inv in invoices:
                supplier  = (inv.get("supplier") or "").strip()
                new_match = _match_supplier_to_template(supplier, templates)

                # Always update the matched_template to current state
                inv["matched_template"] = new_match

                # Check document status: linked doc_id or filename-based lookup
                doc_status = None
                did = inv.get("doc_id")
                if did:
                    linked_doc = db.get_document(did)
                    if linked_doc:
                        doc_status = (linked_doc.get("status") or "").strip()
                elif supplier:
                    doc_status = doc_status_map.get(supplier.lower(), None)

                if not new_match:
                    new_without += 1
                elif doc_status == "Completed":
                    # Already approved → counts as no_approval
                    new_no_appr += 1
                else:
                    tmpl_info = templates_dict.get(new_match, {})
                    if tmpl_info.get("require_review"):
                        new_needs += 1
                    else:
                        new_no_appr += 1

        elif doc_ids and isinstance(doc_ids, list):
            # ── Batch entries: look up actual documents by doc_ids ──
            total_count = len(doc_ids)
            inv_list = []  # Build invoices array for future recalcs
            for did in doc_ids:
                doc = db.get_document(did)
                if not doc:
                    total_count -= 1
                    continue
                doc_status = (doc.get("status") or "").strip()
                # Extract supplier from document result_data
                doc_result = {}
                if doc.get("result_json"):
                    try:
                        doc_result = json.loads(doc["result_json"])
                    except (json.JSONDecodeError, TypeError):
                        pass
                supplier = (doc_result.get("supplier_name") or
                            doc_result.get("vendor_name") or
                            doc_result.get("company") or
                            doc_result.get("_matched_supplier") or "").strip()
                new_match  = _match_supplier_to_template(supplier, templates)

                inv_list.append({
                    "doc_id": did,
                    "supplier": supplier,
                    "matched_template": new_match
                })

                if not new_match:
                    new_without += 1
                elif doc_status == "Completed":
                    # Already approved → counts as no_approval
                    new_no_appr += 1
                else:
                    tmpl_info = templates_dict.get(new_match, {})
                    if tmpl_info.get("require_review"):
                        new_needs += 1
                    else:
                        new_no_appr += 1

            # Store invoices array in result_data for future recalcs
            if inv_list:
                result_data["invoices"] = inv_list
        else:
            continue  # No data to recalculate

        # ALWAYS update: αφαιρέθηκε ο έλεγχος "changed" για αξιοπιστία
        result_data["without_template"] = new_without
        result_data["with_template"]    = total_count - new_without
        result_data["needs_approval"]   = new_needs
        result_data["no_approval"]      = new_no_appr

        old_w = act.get("without_template") or 0
        old_n = act.get("needs_approval") or 0
        old_a = act.get("no_approval") or 0

        db.update_activity(
            act["id"],
            without_template=new_without,
            needs_approval=new_needs,
            no_approval=new_no_appr,
            result_json=json.dumps(result_data)
        )
        updated_ids.append(act["id"])

        if (new_without != old_w or new_needs != old_n or new_no_appr != old_a):
            logger.info("[_recalc] Activity #%d CHANGED: without %d→%d, needs %d→%d, no_appr %d→%d",
                        act["id"], old_w, new_without, old_n, new_needs, old_a, new_no_appr)

      except Exception as e:
        logger.error("[_recalc] Error processing activity #%s: %s",
                     act.get("id", "?"), str(e), exc_info=True)

    logger.info("[_recalc] DONE — updated %d activities: %s",
                len(updated_ids), updated_ids)
    return updated_ids

@app.get("/api/templates")
@require_auth
def list_templates():
    uid = request.current_user["user_id"]
    t = db.list_templates(user_id=uid)
    return jsonify({"templates": t, "count": len(t)})

@app.get("/api/templates/<name>")
@require_auth
def get_template(name):
    uid = request.current_user["user_id"]
    tmpl = db.get_template(name, user_id=uid)
    if not tmpl:
        return jsonify({"error": f"Template '{name}' δεν βρέθηκε."}), 404
    tmpl["json_schema"] = schema_bld.build_from_list(tmpl["fields"])
    return jsonify(tmpl)

@app.delete("/api/templates/<name>")
@require_auth
def delete_template(name):
    uid = request.current_user["user_id"]
    if not db.get_template(name, user_id=uid):
        return jsonify({"error": f"Template '{name}' δεν βρέθηκε."}), 404
    db.delete_template(name, user_id=uid)
    logger.info("[delete_template] Template '%s' deleted, running _recalc...", name)
    # Re-calc activity results μετά τη διαγραφή
    try:
        updated_activities = _recalc_activities_after_template_change(uid=uid)
    except Exception as e:
        logger.error("[delete_template] _recalc failed: %s", str(e), exc_info=True)
        updated_activities = []
    logger.info("[delete_template] _recalc done, updated %d activities", len(updated_activities))
    return jsonify({
        "success": True,
        "message": f"Template '{name}' διαγράφηκε.",
        "updated_activities": updated_activities
    })

# ── Upload ────────────────────────────────────────────────────────────────────
@app.post("/api/upload")
@require_auth
def upload_file():
    uid = request.current_user["user_id"]
    # ── Usage limit check ──
    limit_check = db.check_usage_limit(uid, 'doc_processed', 1)
    if not limit_check['allowed']:
        return jsonify({"error": limit_check['message'], "limit_reached": True,
                        "usage": limit_check}), 403
    if "file" not in request.files:
        return jsonify({"error": "Δεν βρέθηκε αρχείο."}), 400
    f      = request.files["file"]
    suffix = Path(f.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Μη αποδεκτός τύπος: '{suffix}'."}), 400
    schema_name = request.form.get("schema_name")
    dest = UPLOAD_DIR / f.filename
    f.save(str(dest))
    doc_id = db.insert_document(filename=f.filename, file_path=str(dest), schema_name=schema_name, user_id=uid)
    # ── Record usage event ──
    db.record_usage_event(uid, 'doc_processed', 1)
    return jsonify({"success":True,"doc_id":doc_id,"filename":f.filename,
                    "file_path":str(dest),"schema_name":schema_name,"status":"Pending"})

@app.post("/api/upload/pre-check")
@require_auth
def upload_pre_check():
    """
    Pre-check για μεμονωμένο αρχείο: ανιχνεύει τον προμηθευτή και ελέγχει αν
    υπάρχει αντίστοιχο template.
    """
    uid = request.current_user["user_id"]
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
        templates = db.list_templates(user_id=uid)
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
    uid = request.current_user["user_id"]
    docs = db.list_documents(status=request.args.get("status"), user_id=uid)
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
    uid = request.current_user["user_id"]
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    if doc.get("user_id") != uid:
        return jsonify({"error": "Access denied"}), 403
    if doc.get("result_json"):
        try: doc["result_data"] = json.loads(doc["result_json"])
        except: doc["result_data"] = None
    return jsonify(doc)

@app.delete("/api/documents/<int:doc_id>")
@require_auth
def delete_document(doc_id):
    uid = request.current_user["user_id"]
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    if doc.get("user_id") != uid:
        return jsonify({"error": "Access denied"}), 403
    db.delete_document(doc_id)
    return jsonify({"success": True, "message": f"Έγγραφο #{doc_id} διαγράφηκε."})

@app.post("/api/documents/cleanup-pending")
@require_auth
def cleanup_pending():
    """Delete all Pending documents that have no result_json (unprocessed uploads)."""
    uid = request.current_user["user_id"]
    docs = db.list_documents(status="Pending", user_id=uid)
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
    uid = request.current_user["user_id"]
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    if doc.get("user_id") != uid:
        return jsonify({"error": "Access denied"}), 403
    old_status = doc.get("status", "?")
    db.update_document_status(doc_id, status="Completed", result_json=doc.get("result_json"))
    updated = db.get_document(doc_id)
    new_status = updated.get("status", "?") if updated else "NOT_FOUND"
    print(f"[APPROVE] doc #{doc_id}: {old_status} → {new_status}", flush=True)
    # Recalc activity history results (needs_approval → no_approval)
    updated_activities = _recalc_activities_after_template_change(uid=uid)
    print(f"[APPROVE] recalc updated {len(updated_activities)} activities", flush=True)
    return jsonify({"success": True, "doc_id": doc_id, "status": new_status,
                     "updated_activities": len(updated_activities)})

@app.post("/api/documents/<int:doc_id>/reject")
@require_auth
def reject_document(doc_id):
    uid = request.current_user["user_id"]
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    if doc.get("user_id") != uid:
        return jsonify({"error": "Access denied"}), 403
    db.update_document_status(doc_id, status="Failed")
    return jsonify({"success": True, "doc_id": doc_id, "status": "Failed"})

@app.route("/api/documents/<int:doc_id>/data", methods=["PATCH"])
@require_auth
def update_document_data(doc_id):
    uid = request.current_user["user_id"]
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    if doc.get("user_id") != uid:
        return jsonify({"error": "Access denied"}), 403
    new_data = request.get_json(force=True) or {}
    existing = {}
    if doc.get("result_json"):
        try: existing = json.loads(doc["result_json"])
        except: pass
    existing.update(new_data)
    db.update_document_status(doc_id, status=doc["status"], result_json=json.dumps(existing))
    return jsonify({"success": True, "doc_id": doc_id, "data": existing})

@app.route("/api/documents/<int:doc_id>/assign-label", methods=["PATCH"])
@require_auth
def assign_label_to_document(doc_id):
    """Assign a schema_name (label) to a document."""
    uid = request.current_user["user_id"]
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    if doc.get("user_id") != uid:
        return jsonify({"error": "Access denied"}), 403
    data = request.get_json(force=True) or {}
    schema_name = data.get("schema_name", "").strip()
    if not schema_name:
        return jsonify({"error": "Δεν δόθηκε schema_name."}), 400
    now = datetime.utcnow().isoformat()
    # Also update status from no_template to pending so label shows in UI
    new_status = doc.get("status", "")
    if new_status == "no_template":
        new_status = "pending"
    db.conn.execute(
        "UPDATE documents SET schema_name=?, status=?, updated_at=? WHERE id=?",
        (schema_name, new_status, now, doc_id)
    )
    db.conn.commit()
    return jsonify({"success": True, "doc_id": doc_id, "schema_name": schema_name, "status": new_status})

@app.get("/api/documents/<int:doc_id>/file")
@require_auth
def serve_document_file(doc_id):
    """Σερβίρει το processed αρχείο (PNG/εικόνα) για preview στο UI."""
    uid = request.current_user["user_id"]
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    if doc.get("user_id") != uid:
        return jsonify({"error": "Access denied"}), 403
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
    uid = request.current_user["user_id"]
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    if doc.get("user_id") != uid:
        return jsonify({"error": "Access denied"}), 403
    original = doc.get("original_filename") or doc.get("filename", "")
    pdf_path = UPLOAD_DIR / original
    if not pdf_path.exists():
        return jsonify({"error": "Original PDF δεν βρέθηκε."}), 404
    return send_file(str(pdf_path), mimetype="application/pdf")

@app.get("/api/documents/filtered-pdf")
@require_auth
def serve_filtered_pdf():
    """Δημιουργεί PDF μόνο με τις σελίδες των επιλεγμένων εγγράφων."""
    uid = request.current_user["user_id"]
    import re as _re
    import io
    doc_ids = request.args.get("ids", "")
    if not doc_ids:
        return jsonify({"error": "Δεν δόθηκαν doc IDs."}), 400
    ids = [int(x) for x in doc_ids.split(",") if x.strip().isdigit()]
    if not ids:
        return jsonify({"error": "Μη έγκυρα doc IDs."}), 400

    # Group documents by original PDF file
    pdf_pages = {}  # {pdf_path: set of page numbers (0-indexed)}
    docs_order = []  # [(pdf_path, page_num)] to maintain order
    for doc_id in ids:
        doc = db.get_document(doc_id)
        if not doc:
            continue
        if doc.get("user_id") != uid:
            continue
        original = doc.get("original_filename") or doc.get("filename", "")
        pdf_path = UPLOAD_DIR / original
        if not pdf_path.exists() or not str(pdf_path).lower().endswith(".pdf"):
            continue
        fp = doc.get("file_path", "")
        m = _re.search(r"page_(\d+)", fp)
        page_num = int(m.group(1)) - 1 if m else 0  # 0-indexed
        if str(pdf_path) not in pdf_pages:
            pdf_pages[str(pdf_path)] = set()
        pdf_pages[str(pdf_path)].add(page_num)
        docs_order.append((str(pdf_path), page_num))

    if not docs_order:
        return jsonify({"error": "Δεν βρέθηκαν σελίδες."}), 404

    # Deduplicate: keep order but skip repeated (pdf_path, page_num) pairs
    seen = set()
    unique_order = []
    for item in docs_order:
        if item not in seen:
            seen.add(item)
            unique_order.append(item)

    try:
        try:
            from pypdf import PdfReader, PdfWriter
        except ImportError:
            from PyPDF2 import PdfReader, PdfWriter

        writer = PdfWriter()
        readers_cache = {}
        for pdf_path, page_num in unique_order:
            if pdf_path not in readers_cache:
                readers_cache[pdf_path] = PdfReader(pdf_path)
            reader = readers_cache[pdf_path]
            if page_num < len(reader.pages):
                writer.add_page(reader.pages[page_num])

        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        return send_file(buf, mimetype="application/pdf", download_name="selected_pages.pdf")
    except ImportError:
        logging.error("filtered-pdf: pypdf/PyPDF2 NOT installed — install with: pip install pypdf")
        return jsonify({"error": "Απαιτείται εγκατάσταση pypdf στον server: pip install pypdf"}), 500
    except Exception as e:
        logging.error("filtered-pdf error: %s", e)
        return jsonify({"error": str(e)}), 500

@app.get("/api/documents/<int:doc_id>/line-positions")
@require_auth
def get_line_positions(doc_id):
    """Επιστρέφει τις y-θέσεις των γραμμών του πίνακα (ως % ύψους σελίδας)."""
    uid = request.current_user["user_id"]
    import re as _re
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": f"Έγγραφο #{doc_id} δεν βρέθηκε."}), 404
    if doc.get("user_id") != uid:
        return jsonify({"error": "Access denied"}), 403

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
    uid = request.current_user["user_id"]
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": "Not found"}), 404
    if doc.get("user_id") != uid:
        return jsonify({"error": "Access denied"}), 403
    original = doc.get("original_filename")
    if not original:
        return jsonify({"siblings": [dict(doc)], "original_filename": ""})
    all_docs = db.list_documents(user_id=uid)
    siblings = [d for d in all_docs if d.get("original_filename") == original and d.get("filename") != original]
    siblings.sort(key=lambda d: d["id"])
    return jsonify({"siblings": siblings, "original_filename": original})

# ── Export ────────────────────────────────────────────────────────────────────
def _get_records_for_export(doc_ids=None, user_id: int = None):
    """Επιστρέφει ΟΛΑ τα πεδία (εσωτερικά + extracted) — χρησιμοποιείται από search/stats."""
    all_docs = db.list_documents(user_id=user_id)
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

def _get_clean_records_for_export(doc_ids=None, user_id: int = None):
    """Επιστρέφει ΜΟΝΟ τα πεδία που ο χρήστης όρισε στην ετικέτα (result_json).
    Χρησιμοποιείται από CSV/XLSX/Line Items export — καθαρά δεδομένα χωρίς
    εσωτερικά πεδία FastWrite (filename, status, batch_id κλπ)."""
    all_docs = db.list_documents(user_id=user_id)
    if doc_ids:
        all_docs = [d for d in all_docs if d["id"] in doc_ids]
    records = []
    for doc in all_docs:
        row = {}
        if doc.get("result_json"):
            try:
                for k, v in json.loads(doc["result_json"]).items():
                    if not k.startswith("_"): row[k] = v
            except: pass
        if row:  # μόνο αν υπάρχουν εξαγόμενα δεδομένα
            records.append(row)
    return records

@app.post("/api/export/csv")
@require_auth
def export_csv():
    uid = request.current_user["user_id"]
    data    = request.get_json(force=True) or {}
    records = _get_clean_records_for_export(data.get("doc_ids"), user_id=uid)
    if not records:
        return jsonify({"error": "Δεν βρέθηκαν έγγραφα."}), 404
    # Αφαίρεση line_items — εξάγονται ξεχωριστά μέσω Line Items XLSX
    clean = [{k: v for k, v in r.items() if k != "line_items"} for r in records]
    result = exporter.export_csv(clean, filename=data.get("filename"), columns=data.get("columns"))
    if not result.success:
        return jsonify({"error": result.error}), 500
    return send_file(str(result.file_path), mimetype="text/csv",
                     as_attachment=True, download_name=result.file_path.name)

@app.post("/api/export/xlsx")
@require_auth
def export_xlsx():
    uid = request.current_user["user_id"]
    data    = request.get_json(force=True) or {}
    records = _get_clean_records_for_export(data.get("doc_ids"), user_id=uid)
    if not records:
        return jsonify({"error": "Δεν βρέθηκαν έγγραφα."}), 404
    # Αφαίρεση line_items — εξάγονται ξεχωριστά μέσω Line Items XLSX
    clean = [{k: v for k, v in r.items() if k != "line_items"} for r in records]
    result = exporter.export_xlsx(clean, filename=data.get("filename"), columns=data.get("columns"))
    if not result.success:
        return jsonify({"error": result.error}), 500
    return send_file(str(result.file_path),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True, download_name=result.file_path.name)

@app.post("/api/export/line-items/xlsx")
@require_auth
def export_line_items_xlsx():
    uid = request.current_user["user_id"]
    data    = request.get_json(force=True) or {}
    records = _get_clean_records_for_export(data.get("doc_ids"), user_id=uid)
    if not records:
        return jsonify({"error": "Δεν βρέθηκαν έγγραφα."}), 404
    result = exporter.export_line_items_xlsx(records, filename=data.get("filename"))
    if not result.success:
        return jsonify({"error": result.error}), 500
    return send_file(str(result.file_path),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True, download_name=result.file_path.name)

# ── Search & Stats ────────────────────────────────────────────────────────────
@app.get("/api/search")
@require_auth
def search_documents():
    uid = request.current_user["user_id"]
    records = _get_records_for_export(user_id=uid)
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
    uid = request.current_user["user_id"]
    return jsonify(exporter.summary_stats(_get_records_for_export(user_id=uid)))

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)

# ── Extract Endpoint ──────────────────────────────────────────────────────────
from ai_extractor import AIExtractor, ExtractionResult

@app.post("/api/extract/<int:doc_id>")
@require_auth
def extract_document(doc_id):
    uid = request.current_user["user_id"]
    data        = request.get_json() or {}
    schema_name = data.get("schema_name")
    if not schema_name:
        return jsonify({"success": False, "error": "schema_name απαιτείται"}), 400

    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"success": False, "error": "Έγγραφο δεν βρέθηκε"}), 404
    if doc.get("user_id") != uid:
        return jsonify({"error": "Access denied"}), 403

    template = db.get_template(schema_name, user_id=uid)
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

    # ── Page usage limit check ──
    page_count = len(processed.pages)
    page_check = db.check_usage_limit(uid, 'page_processed', page_count)
    if not page_check['allowed']:
        return jsonify({"success": False, "error": page_check['message'],
                        "limit_reached": True, "usage": page_check}), 403

    extractor = AIExtractor(api_key=api_key)
    result    = extractor.extract(image_paths=processed.pages, schema=schema)

    if result.is_ok():
        db.update_document_status(doc_id, status="pending_review", result_json=json.dumps(result.extracted_data))
        # ── Record page usage ──
        db.record_usage_event(uid, 'page_processed', page_count)
        return jsonify({"success": True, "doc_id": doc_id, "data": result.extracted_data, "status": "pending_review"})
    else:
        db.update_document_status(doc_id, status="Failed")
        return jsonify({"success": False, "error": result.error_message}), 500

@app.post("/api/batch/extract-selected")
@require_auth
def batch_extract_selected():
    """
    Batch extraction για επιλεγμένα documents.
    Αγνοεί docs που ήδη είναι Completed/pending_review.
    Εξάγει δεδομένα μόνο για docs με schema_name (ετικέτα).
    """
    uid = request.current_user["user_id"]
    data = request.get_json(force=True) or {}
    doc_ids = data.get("doc_ids", [])
    if not doc_ids:
        return jsonify({"error": "Δεν δόθηκαν doc_ids."}), 400

    api_key = key_mgr.get_key("gemini")
    if not api_key:
        return jsonify({"error": "Gemini API key δεν βρέθηκε."}), 500

    from ai_extractor import AIExtractor

    results = {"total": len(doc_ids), "extracted": 0, "skipped_completed": 0,
               "skipped_no_label": 0, "failed": 0, "details": []}

    for doc_id in doc_ids:
        doc = db.get_document(doc_id)
        if not doc:
            results["failed"] += 1
            results["details"].append({"doc_id": doc_id, "status": "not_found"})
            continue
        if doc.get("user_id") != uid:
            results["failed"] += 1
            results["details"].append({"doc_id": doc_id, "status": "access_denied"})
            continue

        # Skip already completed/approved
        if doc.get("status") in ("Completed", "pending_review", "completed", "approved"):
            results["skipped_completed"] += 1
            results["details"].append({"doc_id": doc_id, "status": "already_completed"})
            continue

        # Skip if no label assigned
        sname = doc.get("schema_name", "").strip()
        if not sname:
            results["skipped_no_label"] += 1
            results["details"].append({"doc_id": doc_id, "status": "no_label"})
            continue

        template = db.get_template(sname, user_id=uid)
        if not template:
            results["skipped_no_label"] += 1
            results["details"].append({"doc_id": doc_id, "status": "label_not_found"})
            continue

        try:
            schema = schema_bld.build_from_list(template["fields"])
            schema.pop("additionalProperties", None)

            file_path = Path(doc["file_path"])
            processed_result = processor.process(file_path)
            if not processed_result.is_ok():
                results["failed"] += 1
                results["details"].append({"doc_id": doc_id, "status": "process_error"})
                continue

            extractor = AIExtractor(api_key=api_key)
            result = extractor.extract(image_paths=processed_result.pages, schema=schema)

            if result.is_ok():
                extracted = result.extracted_data
                # _confidence_pct υπολογίζεται αυτόματα από ai_extractor (logprobs)
                # Preserve supplier info
                rd = {}
                try:
                    rd = json.loads(doc.get("result_json") or "{}")
                except:
                    pass
                if rd.get("_matched_supplier"):
                    extracted.setdefault("_matched_supplier", rd["_matched_supplier"])
                extracted.setdefault("_matched_template", sname)

                # Μετά extraction: πάντα Εκκρεμεί (pending) — ο χρήστης εγκρίνει χειροκίνητα
                final_status = "pending"
                db.update_document_status(doc_id, status=final_status,
                                          result_json=json.dumps(extracted))
                results["extracted"] += 1
                results["details"].append({"doc_id": doc_id, "status": final_status})
            else:
                db.update_document_status(doc_id, status="Failed")
                results["failed"] += 1
                results["details"].append({"doc_id": doc_id, "status": "extraction_failed"})
        except Exception as e:
            logger.error("extract-selected doc %d error: %s", doc_id, e)
            results["failed"] += 1
            results["details"].append({"doc_id": doc_id, "status": "error", "error": str(e)})

    return jsonify({"success": True, **results})


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
    Δέχεται file upload Ή file_path (για αρχεία από ιστορικό).
    """
    uid = request.current_user["user_id"]
    # Πηγή αρχείου: upload ή file_path από ιστορικό
    file_path_param = request.form.get("file_path", "").strip()
    if file_path_param and Path(file_path_param).exists():
        dest = Path(file_path_param)
        original_filename = dest.name
    elif "file" in request.files:
        f = request.files["file"]
        suffix = Path(f.filename).suffix.lower()
        if suffix != ".pdf":
            return jsonify({"error": "Μόνο PDF αρχεία γίνονται δεκτά."}), 400
        dest = UPLOAD_DIR / f.filename
        f.save(str(dest))
        original_filename = f.filename
    else:
        return jsonify({"error": "Δεν βρέθηκε αρχείο."}), 400

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
        templates = db.list_templates(user_id=uid)
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
            "filename": original_filename,
            "file_path": str(dest),
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
    """Δέχεται file upload Ή file_path (για αρχεία από ιστορικό)."""
    uid = request.current_user["user_id"]
    # ── Feature check: batch_upload requires paid plan ──
    if not billing_manager.check_feature(db, uid, 'batch_upload'):
        return jsonify({"error": "Batch upload requires a paid plan. Please upgrade.",
                        "limit_reached": True}), 403
    # ── Usage limit check ──
    limit_check = db.check_usage_limit(uid, 'doc_processed', 1)
    if not limit_check['allowed']:
        return jsonify({"error": limit_check['message'], "limit_reached": True,
                        "usage": limit_check}), 403
    file_path_param = request.form.get("file_path", "").strip()
    if file_path_param and Path(file_path_param).exists():
        dest = Path(file_path_param)
        original_filename = dest.name
    elif "file" in request.files:
        f      = request.files["file"]
        suffix = Path(f.filename).suffix.lower()
        if suffix != ".pdf":
            return jsonify({"error": "Μόνο PDF αρχεία γίνονται δεκτά."}), 400
        dest = UPLOAD_DIR / f.filename
        f.save(str(dest))
        original_filename = f.filename
    else:
        return jsonify({"error": "Δεν βρέθηκε αρχείο."}), 400
    schema_name       = request.form.get("schema_name", "invoice")
    auto_match        = request.form.get("auto_match", "false").lower() == "true"
    skip_completed    = request.form.get("skip_completed", "false").lower() == "true"
    registration_only = request.form.get("registration_only", "false").lower() == "true"
    logger.info("[batch_upload] original_filename='%s', skip_completed=%s, auto_match=%s, "
                "REGISTRATION_ONLY=%s, schema='%s', file_path_param='%s'",
                original_filename, skip_completed, auto_match, registration_only,
                schema_name, file_path_param or "(uploaded file)")
    print(f"[batch_upload] REGISTRATION_ONLY={registration_only}, "
          f"auto_match={auto_match}, schema='{schema_name}'", flush=True)
    job_id = batch_proc.submit(pdf_path=dest, schema_name=schema_name,
                               original_filename=original_filename,
                               auto_match=auto_match,
                               skip_completed=skip_completed,
                               registration_only=registration_only,
                               user_id=uid)
    return jsonify({"success": True, "job_id": job_id,
                    "filename": original_filename, "schema_name": schema_name})

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

# ── Activity Log Endpoints ────────────────────────────────────────────────────
@app.post("/api/activity")
@require_auth
def activity_create():
    """Save a new activity log entry."""
    uid = request.current_user["user_id"]
    data = request.get_json(force=True)
    filename = data.get("filename", "")
    action = data.get("action", "")
    if not filename or not action:
        return jsonify({"error": "filename and action required"}), 400
    import traceback
    logger.info("[activity_create] NEW activity: filename='%s', action='%s', "
                "total=%s, without=%s, needs=%s, no_appr=%s\n  Caller stack:\n%s",
                filename, action,
                data.get("total_invoices"), data.get("without_template"),
                data.get("needs_approval"), data.get("no_approval"),
                ''.join(traceback.format_stack()[-4:-1]))
    aid = db.insert_activity(
        filename=filename,
        action=action,
        total_invoices=data.get("total_invoices", 0),
        without_template=data.get("without_template", 0),
        needs_approval=data.get("needs_approval", 0),
        no_approval=data.get("no_approval", 0),
        result_json=json.dumps(data.get("result_data")) if data.get("result_data") else None,
        file_path=data.get("file_path"),
        user_id=uid
    )
    return jsonify({"success": True, "id": aid})

@app.put("/api/activity/<int:activity_id>")
@require_auth
def activity_update(activity_id):
    """Update an existing activity log entry (for repeat batch)."""
    uid = request.current_user["user_id"]
    a = db.get_activity(activity_id)
    if not a:
        return jsonify({"error": "Activity not found"}), 404
    if a.get("user_id") != uid:
        return jsonify({"error": "Access denied"}), 403
    data = request.get_json(force=True)
    # Merge result_data into existing result_json
    existing_rj = {}
    if a.get("result_json"):
        try:
            existing_rj = json.loads(a["result_json"])
        except (json.JSONDecodeError, TypeError):
            pass
    new_result_data = data.get("result_data", {})
    existing_rj.update(new_result_data)
    db.update_activity(
        activity_id,
        total_invoices=data.get("total_invoices", a.get("total_invoices", 0)),
        without_template=data.get("without_template", a.get("without_template", 0)),
        needs_approval=data.get("needs_approval", a.get("needs_approval", 0)),
        no_approval=data.get("no_approval", a.get("no_approval", 0)),
        result_json=json.dumps(existing_rj)
    )
    return jsonify({"success": True, "id": activity_id})

@app.get("/api/activity")
@require_auth
def activity_list():
    """Return recent activity log entries."""
    uid = request.current_user["user_id"]
    limit = request.args.get("limit", 50, type=int)
    activities = db.list_activities(limit=limit, user_id=uid)
    return jsonify({"activities": activities})

@app.get("/api/activity/<int:activity_id>")
@require_auth
def activity_get(activity_id):
    """Fetch a single activity log entry."""
    uid = request.current_user["user_id"]
    a = db.get_activity(activity_id)
    if not a:
        return jsonify({"error": "Not found"}), 404
    if a.get("user_id") != uid:
        return jsonify({"error": "Access denied"}), 403
    return jsonify(a)


@app.post("/api/documents/cleanup")
@require_auth
def documents_cleanup():
    """Remove duplicate documents, keeping only the LATEST per original_filename + page.
    Useful when multiple batch runs created duplicates."""
    uid = request.current_user["user_id"]
    all_docs = db.list_documents(user_id=uid)
    # Group by (original_filename, page_basename)
    groups = {}
    for d in all_docs:
        ofn = d.get("original_filename") or ""
        fp = d.get("file_path") or ""
        if ofn and fp:
            page_basename = Path(fp).name
            key = f"{ofn}::{page_basename}"
        else:
            # Docs without ofn — skip cleanup, keep them
            continue
        groups.setdefault(key, []).append(d)

    deleted_count = 0
    kept_ids = []
    for key, docs in groups.items():
        if len(docs) <= 1:
            if docs:
                kept_ids.append(docs[0]["id"])
            continue
        # Sort by id DESC (newest first)
        docs.sort(key=lambda x: x["id"], reverse=True)
        # Keep the newest, delete rest
        kept_ids.append(docs[0]["id"])
        for old_doc in docs[1:]:
            db.delete_document(old_doc["id"])
            deleted_count += 1

    logger.info("[cleanup] Deleted %d duplicate documents, kept %d unique",
                deleted_count, len(kept_ids))
    return jsonify({
        "success": True,
        "deleted": deleted_count,
        "remaining": len(kept_ids),
        "message": f"Διαγράφηκαν {deleted_count} διπλότυπα, παρέμειναν {len(kept_ids)} μοναδικά έγγραφα"
    })


# ── Auth Endpoints ────────────────────────────────────────────────────────────
@app.post("/api/auth/login")
def auth_login():
    data = request.get_json(force=True)
    username = data.get("username", "").strip()
    password = data.get("password", "")
    totp_code = data.get("totp_code", "").strip()
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    user = db.get_user_by_username(username)
    if not user or not user.get("is_active"):
        return jsonify({"error": "Invalid credentials"}), 401
    if not check_password(password, user["password_hash"]):
        return jsonify({"error": "Invalid credentials"}), 401
    # ── 2FA check ──
    if user.get("totp_enabled"):
        if not totp_code:
            # Password OK but 2FA required — tell frontend to show TOTP field
            return jsonify({"requires_2fa": True}), 200
        try:
            import pyotp
            totp = pyotp.TOTP(user.get("totp_secret", ""))
            if not totp.verify(totp_code, valid_window=1):
                return jsonify({"error": "Λάθος κωδικός 2FA"}), 401
        except ImportError:
            logger.error("pyotp not installed — cannot verify 2FA")
            return jsonify({"error": "2FA library missing on server"}), 500
    token = create_token(user["id"], user["username"], user.get("role", "user"))
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
    uid = request.current_user["user_id"]
    user = db.get_user_by_id(uid)
    if not user:
        return jsonify({"error": "User not found"}), 404
    result = {"id": user["id"], "username": user["username"],
              "role": user["role"], "email": user.get("email", ""),
              "totp_enabled": bool(user.get("totp_enabled", 0)),
              "created_at": user["created_at"]}
    # ── Subscription & usage info ──
    sub = db.get_active_subscription(uid)
    if sub:
        result["plan"] = {
            "name": sub["plan_name"],
            "display_name": sub["plan_display_name"],
            "status": sub["status"],
            "doc_limit": sub["doc_limit"],
            "page_limit": sub["page_limit"],
            "period_end": sub["current_period_end"],
            "cancel_at_period_end": bool(sub.get("cancel_at_period_end", 0)),
        }
        features_str = sub.get("features_json", "{}")
        try:
            result["plan"]["features"] = json.loads(features_str) if features_str else {}
        except (json.JSONDecodeError, TypeError):
            result["plan"]["features"] = {}
        summary = db.get_usage_summary(uid)
        if summary:
            result["usage"] = {
                "docs_used": summary["docs_used"],
                "doc_limit": summary["doc_limit"],
                "pages_used": summary["pages_used"],
                "page_limit": summary["page_limit"],
            }
    return jsonify(result)

@app.post("/api/auth/change-username")
@require_auth
def auth_change_username():
    data = request.get_json(force=True)
    new_username = data.get("username", "").strip()
    password = data.get("password", "")
    if not new_username or not password:
        return jsonify({"error": "Απαιτείται νέο username και κωδικός"}), 400
    if len(new_username) < 3:
        return jsonify({"error": "Το username πρέπει να έχει τουλάχιστον 3 χαρακτήρες"}), 400
    user = db.get_user_by_id(request.current_user["user_id"])
    if not user:
        return jsonify({"error": "User not found"}), 404
    if not check_password(password, user["password_hash"]):
        return jsonify({"error": "Λάθος κωδικός"}), 401
    # Check if username already taken
    existing = db.get_user_by_username(new_username)
    if existing and existing["id"] != user["id"]:
        return jsonify({"error": "Το username χρησιμοποιείται ήδη"}), 409
    try:
        db.update_user_username(user["id"], new_username)
    except Exception:
        return jsonify({"error": "Το username χρησιμοποιείται ήδη"}), 409
    # Issue new token with updated username
    token = create_token(user["id"], new_username, user.get("role", "user"))
    resp = make_response(jsonify({"success": True}))
    resp.set_cookie(COOKIE_NAME, token, httponly=True, samesite="Lax", secure=False, max_age=86400, path="/")
    return resp

@app.post("/api/auth/change-password")
@require_auth
def auth_change_password():
    data = request.get_json(force=True)
    current_pw = data.get("current_password", "")
    new_pw = data.get("new_password", "")
    if not current_pw or not new_pw:
        return jsonify({"error": "Απαιτείται τρέχων και νέος κωδικός"}), 400
    if len(new_pw) < 6:
        return jsonify({"error": "Ο νέος κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες"}), 400
    user = db.get_user_by_id(request.current_user["user_id"])
    if not user:
        return jsonify({"error": "User not found"}), 404
    if not check_password(current_pw, user["password_hash"]):
        return jsonify({"error": "Λάθος τρέχων κωδικός"}), 401
    db.update_user_password(user["id"], hash_password(new_pw))
    return jsonify({"success": True})

@app.post("/api/auth/change-email")
@require_auth
def auth_change_email():
    data = request.get_json(force=True)
    new_email = data.get("email", "").strip()
    password = data.get("password", "")
    if not new_email or not password:
        return jsonify({"error": "Απαιτείται email και κωδικός"}), 400
    user = db.get_user_by_id(request.current_user["user_id"])
    if not user:
        return jsonify({"error": "User not found"}), 404
    if not check_password(password, user["password_hash"]):
        return jsonify({"error": "Λάθος κωδικός"}), 401
    db.update_user_email(user["id"], new_email)
    return jsonify({"success": True})


# ── 2FA / TOTP Endpoints ─────────────────────────────────────────────────────

@app.post("/api/auth/2fa/setup")
@require_auth
def auth_2fa_setup():
    """Generate TOTP secret and return QR code as base64 PNG."""
    try:
        import pyotp
        import qrcode
    except ImportError:
        return jsonify({"error": "2FA libraries not installed on server"}), 500
    user = db.get_user_by_id(request.current_user["user_id"])
    if not user:
        return jsonify({"error": "User not found"}), 404
    if user.get("totp_enabled"):
        return jsonify({"error": "Το 2FA είναι ήδη ενεργοποιημένο"}), 400
    # Generate secret and store it (not yet enabled)
    secret = pyotp.random_base32()
    db.set_totp_secret(user["id"], secret)
    # Build provisioning URI
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user["username"], issuer_name="FastWrite")
    # Generate QR code as base64 PNG
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    qr_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return jsonify({"secret": secret, "qr_code": qr_b64})


@app.post("/api/auth/2fa/verify")
@require_auth
def auth_2fa_verify():
    """Verify TOTP code and enable 2FA for the user."""
    try:
        import pyotp
    except ImportError:
        return jsonify({"error": "2FA libraries not installed on server"}), 500
    data = request.get_json(force=True)
    code = data.get("code", "").strip()
    if not code or len(code) != 6:
        return jsonify({"error": "Απαιτείται 6ψήφιος κωδικός"}), 400
    user = db.get_user_by_id(request.current_user["user_id"])
    if not user:
        return jsonify({"error": "User not found"}), 404
    secret = user.get("totp_secret", "")
    if not secret:
        return jsonify({"error": "Πρώτα κάνε setup 2FA"}), 400
    totp = pyotp.TOTP(secret)
    if not totp.verify(code, valid_window=1):
        return jsonify({"error": "Λάθος κωδικός. Δοκίμασε ξανά."}), 401
    db.enable_totp(user["id"])
    return jsonify({"success": True, "message": "Το 2FA ενεργοποιήθηκε!"})


@app.post("/api/auth/2fa/disable")
@require_auth
def auth_2fa_disable():
    """Disable 2FA. Requires current password."""
    data = request.get_json(force=True)
    password = data.get("password", "")
    if not password:
        return jsonify({"error": "Απαιτείται κωδικός"}), 400
    user = db.get_user_by_id(request.current_user["user_id"])
    if not user:
        return jsonify({"error": "User not found"}), 404
    if not check_password(password, user["password_hash"]):
        return jsonify({"error": "Λάθος κωδικός"}), 401
    db.disable_totp(user["id"])
    return jsonify({"success": True, "message": "Το 2FA απενεργοποιήθηκε."})


@app.get("/api/auth/2fa/status")
@require_auth
def auth_2fa_status():
    """Return whether 2FA is enabled for the current user."""
    user = db.get_user_by_id(request.current_user["user_id"])
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"totp_enabled": bool(user.get("totp_enabled", 0))})


# ── Registration Endpoint ─────────────────────────────────────────────────────

@app.post("/api/auth/register")
def auth_register():
    """Public registration. Creates a new user with role='user'."""
    data = request.get_json(force=True)
    username = data.get("username", "").strip()
    password = data.get("password", "")
    email = data.get("email", "").strip()
    if not username or not password:
        return jsonify({"error": "Απαιτείται username και κωδικός"}), 400
    if len(username) < 3:
        return jsonify({"error": "Το username πρέπει να έχει τουλάχιστον 3 χαρακτήρες"}), 400
    if len(password) < 6:
        return jsonify({"error": "Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες"}), 400
    if email and "@" not in email:
        return jsonify({"error": "Μη έγκυρη μορφή email"}), 400
    # Check duplicate username
    existing = db.get_user_by_username(username)
    if existing:
        return jsonify({"error": "Το username χρησιμοποιείται ήδη"}), 409
    try:
        user_id = db.create_user(username, hash_password(password), role="user")
        if email:
            db.update_user_email(user_id, email)
        # Store terms acceptance timestamp
        db.conn.execute("UPDATE users SET terms_accepted_at=? WHERE id=?",
                        (datetime.utcnow().isoformat(), user_id))
        db.conn.commit()
        # ── Auto-assign Free plan ──
        db.assign_free_plan(user_id)
        logger.info("Free plan assigned to new user: %s (id=%s)", username, user_id)
        # Auto-login: issue JWT token
        token = create_token(user_id, username, "user")
        resp = make_response(jsonify({"success": True, "username": username, "role": "user"}))
        resp.set_cookie(COOKIE_NAME, token, httponly=True, samesite="Lax", secure=False, max_age=86400, path="/")
        return resp
    except Exception as e:
        logger.error(f"Registration error: {e}")
        return jsonify({"error": "Σφάλμα κατά την εγγραφή"}), 500


# ── Admin Endpoints ──────────────────────────────────────────────────────────

@app.get("/api/admin/users")
@require_admin
def admin_list_users():
    """List all users. Admin only. No sensitive data (no password_hash, no totp_secret)."""
    users = db.list_users()
    return jsonify(users)


@app.get("/api/admin/users/stats")
@require_admin
def admin_user_stats():
    """Return detailed user statistics. Admin only."""
    return jsonify(db.user_stats())


@app.post("/api/admin/users/<int:user_id>/toggle-active")
@require_admin
def admin_toggle_active(user_id):
    """Activate or deactivate a user. Cannot deactivate yourself."""
    admin_id = request.current_user["user_id"]
    if user_id == admin_id:
        return jsonify({"error": "Δεν μπορείς να απενεργοποιήσεις τον εαυτό σου"}), 400
    user = db.get_user_by_id(user_id)
    if not user:
        return jsonify({"error": "Ο χρήστης δεν βρέθηκε"}), 404
    if user.get("is_active"):
        db.deactivate_user(user_id)
        return jsonify({"success": True, "is_active": False})
    else:
        db.activate_user(user_id)
        return jsonify({"success": True, "is_active": True})


@app.post("/api/admin/users/<int:user_id>/reset-2fa")
@require_admin
def admin_reset_2fa(user_id):
    """Reset (disable) 2FA for a user. Admin only."""
    user = db.get_user_by_id(user_id)
    if not user:
        return jsonify({"error": "Ο χρήστης δεν βρέθηκε"}), 404
    db.disable_totp(user_id)
    return jsonify({"success": True, "message": f"Το 2FA απενεργοποιήθηκε για τον χρήστη {user['username']}"})


@app.post("/api/admin/users/<int:user_id>/change-role")
@require_admin
def admin_change_role(user_id):
    """Change user role. Cannot change your own role."""
    admin_id = request.current_user["user_id"]
    if user_id == admin_id:
        return jsonify({"error": "Δεν μπορείς να αλλάξεις τον δικό σου ρόλο"}), 400
    data = request.get_json(force=True)
    new_role = data.get("role", "").strip()
    if new_role not in ("admin", "user"):
        return jsonify({"error": "Μη έγκυρος ρόλος"}), 400
    user = db.get_user_by_id(user_id)
    if not user:
        return jsonify({"error": "Ο χρήστης δεν βρέθηκε"}), 404
    db.update_user_role(user_id, new_role)
    return jsonify({"success": True, "role": new_role})


# ── Billing & Usage Endpoints ─────────────────────────────────────────────────

@app.get("/api/billing/plans")
def billing_list_plans():
    """Public: list active pricing plans."""
    plans = db.list_plans(active_only=True)
    result = []
    for p in plans:
        features = {}
        try:
            features = json.loads(p['features_json']) if p.get('features_json') else {}
        except (json.JSONDecodeError, TypeError):
            pass
        result.append({
            'id': p['id'], 'name': p['name'],
            'display_name': p['display_name'],
            'price_cents': p['price_cents'],
            'doc_limit': p['doc_limit'], 'page_limit': p['page_limit'],
            'features': features,
        })
    return jsonify(result)


@app.get("/api/billing/subscription")
@require_auth
def billing_get_subscription():
    """Get current user subscription + usage."""
    uid = request.current_user["user_id"]
    sub = db.get_active_subscription(uid)
    if not sub:
        return jsonify({"error": "No active subscription"}), 404
    summary = db.get_usage_summary(uid)
    features = {}
    try:
        features = json.loads(sub['features_json']) if sub.get('features_json') else {}
    except (json.JSONDecodeError, TypeError):
        pass
    return jsonify({
        'plan': {
            'name': sub['plan_name'],
            'display_name': sub['plan_display_name'],
            'price_cents': sub['price_cents'],
            'doc_limit': sub['doc_limit'],
            'page_limit': sub['page_limit'],
            'features': features,
        },
        'status': sub['status'],
        'period_start': sub['current_period_start'],
        'period_end': sub['current_period_end'],
        'cancel_at_period_end': bool(sub.get('cancel_at_period_end', 0)),
        'usage': {
            'docs_used': summary['docs_used'] if summary else 0,
            'doc_limit': summary['doc_limit'] if summary else sub['doc_limit'],
            'pages_used': summary['pages_used'] if summary else 0,
            'page_limit': summary['page_limit'] if summary else sub['page_limit'],
        }
    })


@app.post("/api/billing/checkout")
@require_auth
def billing_checkout():
    """Create a Stripe Checkout Session for plan upgrade."""
    uid = request.current_user["user_id"]
    data = request.get_json(force=True)
    plan_id = data.get("plan_id")
    if not plan_id:
        return jsonify({"error": "plan_id required"}), 400
    if not billing_manager.is_stripe_configured():
        return jsonify({"error": "Stripe not configured"}), 503
    base_url = request.host_url.rstrip("/")
    result = billing_manager.create_checkout_session(
        db, uid, plan_id,
        success_url=f"{base_url}/ui/billing?success=1",
        cancel_url=f"{base_url}/ui/billing?canceled=1",
    )
    if not result:
        return jsonify({"error": "Failed to create checkout session"}), 500
    return jsonify(result)


@app.post("/api/billing/portal")
@require_auth
def billing_portal():
    """Create a Stripe Customer Portal session."""
    uid = request.current_user["user_id"]
    sub = db.get_active_subscription(uid)
    if not sub or not sub.get("stripe_customer_id"):
        return jsonify({"error": "No Stripe customer found. Only paid plans have portal access."}), 400
    base_url = request.host_url.rstrip("/")
    portal_url = billing_manager.create_portal_session(
        sub["stripe_customer_id"],
        return_url=f"{base_url}/ui/billing",
    )
    if not portal_url:
        return jsonify({"error": "Failed to create portal session"}), 500
    return jsonify({"portal_url": portal_url})


@app.post("/api/billing/webhook")
def billing_webhook():
    """Stripe webhook endpoint. Signature-verified."""
    payload = request.get_data()
    sig_header = request.headers.get("Stripe-Signature", "")
    event = billing_manager.verify_webhook(payload, sig_header)
    if not event:
        return jsonify({"error": "Invalid signature"}), 400
    success = billing_manager.handle_webhook_event(db, event)
    return jsonify({"received": True}), 200 if success else 500


@app.get("/api/billing/invoices")
@require_auth
def billing_invoices():
    """List billing history for current user."""
    uid = request.current_user["user_id"]
    history = db.list_billing_history(uid)
    return jsonify(history)


@app.get("/api/usage/current")
@require_auth
def usage_current():
    """Get current period usage + limits + percentage."""
    uid = request.current_user["user_id"]
    summary = db.get_usage_summary(uid)
    if not summary:
        return jsonify({"error": "No active subscription"}), 404
    doc_pct = 0
    if summary['doc_limit'] > 0:
        doc_pct = round(summary['docs_used'] / summary['doc_limit'] * 100, 1)
    elif summary['doc_limit'] == -1:
        doc_pct = 0  # Unlimited
    page_pct = 0
    if summary['page_limit'] > 0:
        page_pct = round(summary['pages_used'] / summary['page_limit'] * 100, 1)
    elif summary['page_limit'] == -1:
        page_pct = 0  # Unlimited
    return jsonify({
        'docs_used': summary['docs_used'],
        'doc_limit': summary['doc_limit'],
        'doc_percentage': doc_pct,
        'pages_used': summary['pages_used'],
        'page_limit': summary['page_limit'],
        'page_percentage': page_pct,
        'period_start': summary.get('period_start'),
        'period_end': summary.get('period_end'),
    })


@app.get("/api/usage/history")
@require_auth
def usage_history():
    """Get usage history by period."""
    uid = request.current_user["user_id"]
    history = db.get_usage_history(uid)
    return jsonify(history)


# ── Admin Billing Endpoints ──────────────────────────────────────────────────

@app.get("/api/admin/plans")
@require_admin
def admin_list_plans():
    """List all plans including inactive. Admin only."""
    return jsonify(db.list_plans(active_only=False))


@app.post("/api/admin/plans")
@require_admin
def admin_create_plan():
    """Create a new pricing plan. Admin only."""
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    display_name = data.get("display_name", "").strip()
    if not name or not display_name:
        return jsonify({"error": "name and display_name required"}), 400
    try:
        plan_id = db.create_plan(
            name=name, display_name=display_name,
            price_cents=data.get("price_cents", 0),
            doc_limit=data.get("doc_limit", 50),
            page_limit=data.get("page_limit", 500),
            features_json=json.dumps(data.get("features", {})),
            stripe_price_id=data.get("stripe_price_id"),
            sort_order=data.get("sort_order", 0),
        )
        return jsonify({"success": True, "plan_id": plan_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/admin/plans/<int:plan_id>", methods=["PATCH"])
@require_admin
def admin_update_plan(plan_id):
    """Update a plan. Admin only."""
    data = request.get_json(force=True)
    kwargs = {}
    for k in ['display_name', 'price_cents', 'doc_limit', 'page_limit',
              'stripe_price_id', 'is_active', 'sort_order']:
        if k in data:
            kwargs[k] = data[k]
    if 'features' in data:
        kwargs['features_json'] = json.dumps(data['features'])
    if not kwargs:
        return jsonify({"error": "No fields to update"}), 400
    db.update_plan(plan_id, **kwargs)
    return jsonify({"success": True})


@app.get("/api/admin/subscriptions")
@require_admin
def admin_list_subscriptions():
    """List all subscriptions. Admin only."""
    status = request.args.get("status")
    return jsonify(db.list_subscriptions(status=status))


@app.get("/api/admin/usage-report")
@require_admin
def admin_usage_report():
    """Aggregated usage report across all users. Admin only."""
    rows = db.conn.execute("""
        SELECT u.id, u.username, u.email, p.name as plan_name,
               s.status as sub_status,
               COALESCE(us.docs_used, 0) as docs_used,
               COALESCE(us.pages_used, 0) as pages_used,
               p.doc_limit, p.page_limit
        FROM users u
        LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status IN ('active', 'trialing', 'past_due')
        LEFT JOIN plans p ON s.plan_id = p.id
        LEFT JOIN usage_summary us ON us.user_id = u.id AND us.period_start = s.current_period_start
        WHERE u.is_active = 1
        ORDER BY docs_used DESC
    """).fetchall()
    return jsonify([dict(r) for r in rows])


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
      <span onclick="var p=document.getElementById('password');p.type=p.type==='password'?'text':'password'" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;color:#7c8299;font-size:18px;">&#128065;</span>
    </div>
    <div id="totp-section" style="display:none;">
      <label>2FA Code</label>
      <input type="text" id="totp-code" placeholder="6-digit code" maxlength="6" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" style="text-align:center;font-size:20px;letter-spacing:8px;"/>
    </div>
    <button type="submit" id="login-btn">Sign In</button>
  </form>
  <div style="text-align:center;margin-top:20px;font-size:13px;color:#7c8299;">
    Δεν έχεις λογαριασμό; <a href="/ui/register" style="color:#00e5a0;text-decoration:none;">Εγγραφή</a>
  </div>
  <div style="text-align:center;margin-top:12px;font-size:11px;color:#555;">
    <a href="/legal" target="_blank" style="color:#7c8299;text-decoration:none;">Όροι Χρήσης &amp; Πολιτική Απορρήτου</a>
  </div>
</div>
<script>
let needs2fa=false;
async function doLogin(e){
  e.preventDefault();
  const err=document.getElementById('error-msg');
  err.style.display='none';
  const body={username:document.getElementById('username').value,password:document.getElementById('password').value};
  if(needs2fa) body.totp_code=document.getElementById('totp-code').value;
  try{
    const r=await fetch('/api/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    if(d.requires_2fa){
      needs2fa=true;
      document.getElementById('totp-section').style.display='block';
      document.getElementById('totp-code').focus();
      document.getElementById('login-btn').textContent='Verify & Sign In';
      return false;
    }
    if(r.ok&&d.success){window.location.href='/ui';}
    else{err.textContent=d.error||'Login failed';err.style.display='block';}
  }catch(ex){err.textContent='Connection error';err.style.display='block';}
  return false;
}
</script>
</body>
</html>"""


@app.get("/ui/terms")
@app.get("/legal")
def serve_terms():
    return TERMS_HTML, 200, {"Content-Type": "text/html"}

@app.get("/ui/login")
def serve_login():
    return LOGIN_HTML, 200, {"Content-Type": "text/html"}


TERMS_HTML = """<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>FastWrite — Terms of Service &amp; Privacy Policy</title>
<style>
:root{--bg:#0a0c10;--bg2:#111318;--border:#1e2330;--accent:#00e5a0;--text:#e8eaf0;--text2:#7c8299;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:40px 20px;}
.terms-wrap{max-width:800px;margin:0 auto;background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:48px 40px;box-shadow:0 8px 32px rgba(0,0,0,0.5);}
h1{font-size:28px;margin-bottom:8px;} h1 span{color:var(--accent);}
.subtitle{color:var(--text2);font-size:13px;margin-bottom:32px;}
h2{font-size:18px;margin:28px 0 12px;color:var(--accent);} h3{font-size:15px;margin:20px 0 8px;}
p,li{font-size:14px;line-height:1.7;color:var(--text2);margin-bottom:8px;}
ul{padding-left:24px;margin-bottom:12px;}
a{color:var(--accent);text-decoration:none;} a:hover{text-decoration:underline;}
.back-link{display:inline-block;margin-top:24px;padding:10px 20px;background:var(--accent);color:#0a0c10;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;}
.back-link:hover{opacity:.85;text-decoration:none;}
.lang-switch{position:absolute;top:20px;right:20px;display:flex;gap:8px;}
.lang-switch a{padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;border:1px solid var(--border);color:var(--text2);}
.lang-switch a.active{background:var(--accent);color:#0a0c10;border-color:var(--accent);}
.section-divider{margin:40px 0 32px;border-top:2px solid var(--accent);padding-top:8px;}
</style>
</head>
<body>
<div class="terms-wrap" style="position:relative;">
<div class="lang-switch">
  <a href="#" onclick="showLang('el');return false;" id="lang-el" class="active">EL</a>
  <a href="#" onclick="showLang('en');return false;" id="lang-en">EN</a>
</div>

<h1>Fast<span>Write</span></h1>
<p class="subtitle">Terms of Service &amp; Privacy Policy &middot; Last updated: April 2026</p>

<!-- ======================== GREEK VERSION ======================== -->
<div id="terms-el">

<h2>ΜΕΡΟΣ Α: ΟΡΟΙ ΧΡΗΣΗΣ</h2>

<h2>1. Εισαγωγή</h2>
<p>Καλώς ήρθατε στο FastWrite ("Υπηρεσία", "Πλατφόρμα", "εμείς"). Το FastWrite είναι ένα εργαλείο εξαγωγής δεδομένων από έγγραφα με τεχνητή νοημοσύνη, το οποίο λειτουργεί ως Software-as-a-Service (SaaS) πλατφόρμα, προσβάσιμη στη διεύθυνση fastwrite.duckdns.org. Με τη δημιουργία λογαριασμού και τη χρήση της Υπηρεσίας, ο χρήστης ("Χρήστης", "εσείς") αποδέχεται τους παρόντες Όρους Χρήσης.</p>

<h2>2. Περιγραφή Υπηρεσίας</h2>
<p>Το FastWrite παρέχει αυτοματοποιημένη εξαγωγή δεδομένων από έγγραφα χρησιμοποιώντας τεχνητή νοημοσύνη. Η Υπηρεσία επιτρέπει στους χρήστες να ανεβάζουν έγγραφα (PDF), να εξάγουν δομημένα δεδομένα μέσω μοντέλων AI, να οργανώνουν τα έγγραφα με ετικέτες/πρότυπα, και να εξάγουν δεδομένα σε μορφές CSV/XLSX. Η Υπηρεσία παρέχεται "ως έχει" (as-is).</p>

<h2>3. Μοντέλο BYOK (Bring Your Own Key)</h2>
<p>Το FastWrite λειτουργεί αποκλειστικά με το μοντέλο BYOK (Bring Your Own Key). Αυτό σημαίνει ότι:</p>
<ul>
<li>Ο χρήστης <strong>υποχρεούται</strong> να παρέχει το δικό του κλειδί API (API Key) από τον πάροχο AI (π.χ. Google Gemini) για να χρησιμοποιήσει τις λειτουργίες εξαγωγής.</li>
<li>Η πλατφόρμα <strong>δεν παρέχει, δεν μεσολαβεί και δεν επιδοτεί</strong> κλειδιά API. Η χρέωση για τη χρήση του AI γίνεται <strong>απευθείας</strong> μεταξύ του χρήστη και του παρόχου AI.</li>
<li>Τα κλειδιά API αποθηκεύονται κρυπτογραφημένα (Fernet encryption) στον server και χρησιμοποιούνται μόνο κατά την εκτέλεση εξαγωγών.</li>
<li>Η πλατφόρμα δεν έχει πρόσβαση στα κλειδιά API σε μη κρυπτογραφημένη μορφή, εκτός από τη στιγμή της χρήσης τους για κλήση του AI API.</li>
</ul>

<h2>4. Ακρίβεια Εξαγωγής Δεδομένων &amp; Ευθύνη Χρήστη</h2>
<p><strong>ΣΗΜΑΝΤΙΚΟ:</strong> Η εξαγωγή δεδομένων με τεχνητή νοημοσύνη δεν είναι 100% ακριβής. Ο χρήστης αναγνωρίζει και αποδέχεται ότι:</p>
<ul>
<li>Η πλατφόρμα παρέχει εργαλεία ελέγχου (confidence scores, workflow έγκρισης), αλλά <strong>ο τελικός έλεγχος και η ευθύνη για την ορθότητα των εξαγόμενων δεδομένων ανήκει αποκλειστικά στον χρήστη</strong>.</li>
<li>Η πλατφόρμα <strong>δεν εγγυάται</strong> την ακρίβεια, πληρότητα ή αξιοπιστία των δεδομένων που εξάγονται μέσω AI.</li>
<li>Ο χρήστης οφείλει να ελέγχει τα εξαγόμενα δεδομένα <strong>πριν</strong> τα χρησιμοποιήσει για επαγγελματικούς, νομικούς ή οικονομικούς σκοπούς.</li>
<li>Η πλατφόρμα <strong>δεν φέρει καμία ευθύνη</strong> για τυχόν λανθασμένες εξαγωγές, ελλιπή δεδομένα ή σφάλματα στα αποτελέσματα εξαγωγής, ανεξαρτήτως της αιτίας.</li>
</ul>

<h2>5. Λογαριασμός &amp; Ασφάλεια</h2>
<p>Για τη χρήση της Υπηρεσίας, ο χρήστης πρέπει να δημιουργήσει λογαριασμό. Ο χρήστης ευθύνεται για τη διατήρηση της εμπιστευτικότητας των στοιχείων πρόσβασης και για κάθε δραστηριότητα στον λογαριασμό του. Συνιστάται η ενεργοποίηση Ελέγχου Ταυτότητας Δύο Παραγόντων (2FA) για ενισχυμένη ασφάλεια.</p>

<h2>6. Αποδεκτή Χρήση</h2>
<p>Ο χρήστης συμφωνεί να μην:</p>
<ul>
<li>Ανεβάζει παράνομο, επιβλαβές ή προσβλητικό περιεχόμενο</li>
<li>Επιχειρεί πρόσβαση σε δεδομένα ή λογαριασμούς άλλων χρηστών</li>
<li>Αποσυμπιλεί, αποσυναρμολογεί ή κάνει reverse engineering στην Υπηρεσία</li>
<li>Επεξεργάζεται έγγραφα που δεν δικαιούται να επεξεργαστεί</li>
<li>Υπερφορτώνει την Υπηρεσία με υπερβολικά αιτήματα</li>
<li>Μοιράζεται τα στοιχεία πρόσβασης με τρίτους</li>
</ul>

<h2>7. Πνευματική Ιδιοκτησία</h2>
<p>Η πλατφόρμα FastWrite, συμπεριλαμβανομένου του λογισμικού, του σχεδιασμού και της τεκμηρίωσης, αποτελεί πνευματική ιδιοκτησία του φορέα λειτουργίας. Τα έγγραφα και τα δεδομένα του χρήστη παραμένουν δική του ιδιοκτησία.</p>

<h2>8. Διαθεσιμότητα Υπηρεσίας</h2>
<p>Στοχεύουμε σε υψηλή διαθεσιμότητα αλλά δεν εγγυόμαστε αδιάκοπη λειτουργία. Η Υπηρεσία μπορεί να είναι προσωρινά μη διαθέσιμη λόγω συντήρησης ή περιστάσεων εκτός ελέγχου μας. Δεν ευθυνόμαστε για τυχόν ζημία λόγω διακοπής λειτουργίας.</p>

<h2>9. Περιορισμός Ευθύνης</h2>
<p>Στο μέγιστο βαθμό που επιτρέπεται από το εφαρμοστέο δίκαιο, η πλατφόρμα FastWrite και οι φορείς λειτουργίας της <strong>δεν ευθύνονται</strong> για οποιαδήποτε έμμεση, τυχαία, ειδική, παρεπόμενη ή αποθετική ζημία, συμπεριλαμβανομένων ενδεικτικά απώλειας κερδών, δεδομένων ή επιχειρηματικών ευκαιριών, που προκύπτει από τη χρήση της Υπηρεσίας. Ειδικότερα, η πλατφόρμα <strong>δεν φέρει ευθύνη</strong> για αποφάσεις που λαμβάνονται βάσει δεδομένων που εξήχθησαν μέσω της Υπηρεσίας.</p>

<h2>10. Καταγγελία</h2>
<p>Διατηρούμε το δικαίωμα αναστολής ή τερματισμού λογαριασμών που παραβιάζουν τους παρόντες όρους. Ο χρήστης μπορεί να σταματήσει τη χρήση ανά πάσα στιγμή.</p>

<h2>11. Αλλαγές στους Όρους</h2>
<p>Ενδέχεται να ενημερώσουμε τους παρόντες Όρους. Η συνέχιση χρήσης μετά τις αλλαγές συνιστά αποδοχή. Θα καταβάλουμε εύλογες προσπάθειες ενημέρωσης για σημαντικές αλλαγές.</p>

<div class="section-divider"></div>
<h2>ΜΕΡΟΣ Β: ΠΟΛΙΤΙΚΗ ΑΠΟΡΡΗΤΟΥ</h2>

<h2>12. Δεδομένα που Ανεβάζετε</h2>
<p>Τα έγγραφα και τα αρχεία που ανεβάζετε παραμένουν δική σας ιδιοκτησία. Δεν έχουμε πρόσβαση, δεν προβάλλουμε, δεν αναλύουμε και <strong>δεν μοιραζόμαστε</strong> τα ανεβασμένα έγγραφα ή τα εξαγόμενα δεδομένα σας με κανέναν τρίτο. Τα δεδομένα σας είναι απομονωμένα από τα δεδομένα άλλων χρηστών.</p>

<h2>13. Δεδομένα που Συλλέγουμε</h2>
<p>Συλλέγουμε μόνο τα ελάχιστα δεδομένα που απαιτούνται:</p>
<ul>
<li>Στοιχεία λογαριασμού: username, κωδικός (αποθηκεύεται ως bcrypt hash — ποτέ σε απλό κείμενο)</li>
<li>Μεταδεδομένα χρήσης: ημερομηνία δημιουργίας λογαριασμού, χρονοσήματα σύνδεσης</li>
<li>Τεχνικά δεδομένα: JWT authentication tokens για τη διαχείριση συνεδριών</li>
</ul>

<h2>14. Επεξεργασία AI &amp; Τρίτοι Πάροχοι</h2>
<p>Η εξαγωγή δεδομένων χρησιμοποιεί υπηρεσίες AI τρίτων (π.χ. Google Gemini). Όταν γίνεται επεξεργασία εγγράφου, το περιεχόμενό του αποστέλλεται <strong>απευθείας</strong> στον πάροχο AI μέσω του κλειδιού API του χρήστη. Η πλατφόρμα <strong>δεν αποθηκεύει, δεν προωθεί και δεν κοινοποιεί</strong> δεδομένα εγγράφων σε κανέναν εκτός του AI παρόχου που έχει επιλέξει ο χρήστης. Ο χρήστης αναγνωρίζει ότι οι πάροχοι AI έχουν τους δικούς τους όρους χρήσης.</p>

<h2>15. Αποθήκευση &amp; Ασφάλεια Δεδομένων</h2>
<p>Τα δεδομένα αποθηκεύονται <strong>τοπικά</strong> στον server της πλατφόρμας. Δεν χρησιμοποιούνται εξωτερικές υπηρεσίες αποθήκευσης (cloud storage) τρίτων. Τα κλειδιά API κρυπτογραφούνται (Fernet encryption). Χρησιμοποιούμε HTTPS για τα δεδομένα κατά τη μεταφορά και JWT tokens με httpOnly cookies για τον έλεγχο ταυτότητας.</p>

<h2>16. Διατήρηση &amp; Διαγραφή Δεδομένων</h2>
<p>Μπορείτε να διαγράψετε τα έγγραφά σας ανά πάσα στιγμή μέσα από την πλατφόρμα. Μετά την απενεργοποίηση λογαριασμού, τα δεδομένα μπορεί να διατηρηθούν για εύλογο χρονικό διάστημα πριν τη μόνιμη διαγραφή. Μπορείτε να ζητήσετε πλήρη διαγραφή δεδομένων.</p>

<h2>17. Κοινοποίηση σε Τρίτους</h2>
<p><strong>ΔΕΝ</strong> κοινοποιούμε, πωλούμε ή μεταφέρουμε προσωπικά δεδομένα σε τρίτους. Τα δεδομένα σας παραμένουν αποκλειστικά στην πλατφόρμα και δεν αξιοποιούνται για εμπορικούς σκοπούς ή διαφήμιση.</p>

<h2>18. Εφαρμοστέο Δίκαιο</h2>
<p>Οι παρόντες όροι διέπονται από το εφαρμοστέο δίκαιο. Τυχόν διαφορές θα επιλύονται κατ' αρχήν μέσω καλόπιστης διαπραγμάτευσης και, εάν απαιτηθεί, μέσω των αρμόδιων δικαστηρίων.</p>

<h2>19. Επικοινωνία</h2>
<p>Για ερωτήσεις σχετικά με τους Όρους Χρήσης ή την Πολιτική Απορρήτου, ή για αίτημα διαγραφής δεδομένων, επικοινωνήστε μέσω της πλατφόρμας.</p>

<p style="margin-top:32px;padding-top:16px;border-top:1px solid var(--border);font-size:12px;color:var(--text2);">
<strong>Σημείωση:</strong> Το παρόν αποτελεί προσχέδιο και πρέπει να ελεγχθεί από εξειδικευμένο νομικό σύμβουλο πριν τη χρήση. Δεν αποτελεί νομική συμβουλή.
</p>
</div>

<!-- ======================== ENGLISH VERSION ======================== -->
<div id="terms-en" style="display:none;">

<h2>PART A: TERMS OF SERVICE</h2>

<h2>1. Introduction</h2>
<p>Welcome to FastWrite ("Service", "Platform", "we", "us"). FastWrite is an AI-powered document extraction tool operated as a Software-as-a-Service (SaaS) platform accessible at fastwrite.duckdns.org. By creating an account and using the Service, you ("User", "you") agree to be bound by these Terms of Service.</p>

<h2>2. Service Description</h2>
<p>FastWrite provides automated document data extraction using artificial intelligence. The Service allows users to upload documents (PDF), extract structured data using AI models, organize documents with labels/templates, and export data in CSV/XLSX formats. The Service is provided on an "as-is" basis.</p>

<h2>3. BYOK Model (Bring Your Own Key)</h2>
<p>FastWrite operates exclusively on the BYOK (Bring Your Own Key) model. This means:</p>
<ul>
<li>The user is <strong>required</strong> to provide their own API Key from the AI provider (e.g. Google Gemini) to use extraction features.</li>
<li>The platform <strong>does not provide, mediate, or subsidize</strong> API keys. AI usage is billed <strong>directly</strong> between the user and the AI provider.</li>
<li>API keys are stored encrypted (Fernet encryption) on the server and are used only during extraction execution.</li>
<li>The platform does not have access to API keys in unencrypted form, except at the moment of use for AI API calls.</li>
</ul>

<h2>4. Data Extraction Accuracy &amp; User Responsibility</h2>
<p><strong>IMPORTANT:</strong> AI-based data extraction is not 100% accurate. The user acknowledges and accepts that:</p>
<ul>
<li>The platform provides verification tools (confidence scores, approval workflow), but <strong>the final verification and responsibility for the accuracy of extracted data lies exclusively with the user</strong>.</li>
<li>The platform <strong>does not guarantee</strong> the accuracy, completeness, or reliability of AI-extracted data.</li>
<li>The user must verify extracted data <strong>before</strong> using it for business, legal, or financial purposes.</li>
<li>The platform <strong>bears no responsibility</strong> for incorrect extractions, incomplete data, or errors in extraction results, regardless of the cause.</li>
</ul>

<h2>5. Account &amp; Security</h2>
<p>To use the Service, the user must create an account. The user is responsible for maintaining credential confidentiality and for all activity on their account. Enabling Two-Factor Authentication (2FA) is recommended for enhanced security.</p>

<h2>6. Acceptable Use</h2>
<p>The user agrees not to:</p>
<ul>
<li>Upload illegal, harmful, or infringing content</li>
<li>Attempt to access other users' data or accounts</li>
<li>Reverse engineer, decompile, or disassemble the Service</li>
<li>Process documents they do not have the right to process</li>
<li>Overload the Service with excessive requests</li>
<li>Share account credentials with third parties</li>
</ul>

<h2>7. Intellectual Property</h2>
<p>The FastWrite platform, including its software, design, and documentation, is the intellectual property of the Service operator. User documents and data remain the user's property.</p>

<h2>8. Service Availability</h2>
<p>We aim for high availability but do not guarantee uninterrupted service. The Service may be temporarily unavailable due to maintenance or circumstances beyond our control. We are not liable for any loss resulting from service downtime.</p>

<h2>9. Limitation of Liability</h2>
<p>To the maximum extent permitted by applicable law, FastWrite and its operators shall <strong>not be liable</strong> for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or business opportunities, arising from the use of the Service. In particular, the platform <strong>bears no liability</strong> for decisions made based on data extracted through the Service.</p>

<h2>10. Termination</h2>
<p>We reserve the right to suspend or terminate accounts that violate these terms. The user may stop using the Service at any time.</p>

<h2>11. Changes to Terms</h2>
<p>We may update these Terms from time to time. Continued use after changes constitutes acceptance. We will make reasonable efforts to notify users of significant changes.</p>

<div class="section-divider"></div>
<h2>PART B: PRIVACY POLICY</h2>

<h2>12. Data You Upload</h2>
<p>Documents and files you upload remain your property. We do not access, view, analyze, or <strong>share</strong> your uploaded documents or extracted data with anyone. Your data is isolated from other users' data.</p>

<h2>13. Data We Collect</h2>
<p>We collect only the minimum data necessary:</p>
<ul>
<li>Account information: username, password (stored as bcrypt hash — never in plain text)</li>
<li>Usage metadata: account creation date, login timestamps</li>
<li>Technical data: JWT authentication tokens for session management</li>
</ul>

<h2>14. AI Processing &amp; Third Parties</h2>
<p>Data extraction uses third-party AI services (e.g. Google Gemini). When a document is processed, its content is sent <strong>directly</strong> to the AI provider using the user's API key. The platform <strong>does not store, forward, or disclose</strong> document data to anyone other than the AI provider selected by the user. The user acknowledges that AI providers have their own terms of service.</p>

<h2>15. Data Storage &amp; Security</h2>
<p>Data is stored <strong>locally</strong> on the platform's server. No third-party cloud storage services are used. API keys are encrypted (Fernet encryption). We use HTTPS for data in transit and JWT tokens with httpOnly cookies for authentication.</p>

<h2>16. Data Retention &amp; Deletion</h2>
<p>You may delete your documents at any time through the platform. Upon account deactivation, data may be retained for a reasonable period before permanent deletion. You may request complete data deletion.</p>

<h2>17. Third-Party Sharing</h2>
<p>We do <strong>NOT</strong> share, sell, or transfer personal data to third parties. Your data remains exclusively on the platform and is not used for commercial purposes or advertising.</p>

<h2>18. Governing Law</h2>
<p>These terms are governed by applicable law. Disputes shall be resolved through good-faith negotiation first, and if necessary, through courts of competent jurisdiction.</p>

<h2>19. Contact</h2>
<p>For questions about these Terms of Service or Privacy Policy, or to request data deletion, please contact us through the platform.</p>

<p style="margin-top:32px;padding-top:16px;border-top:1px solid var(--border);font-size:12px;color:var(--text2);">
<strong>Disclaimer:</strong> This document is a draft and should be reviewed by a qualified legal professional before being relied upon. It does not constitute legal advice.
</p>
</div>

<a href="/ui/login" class="back-link" id="back-link-text">&#8592; Επιστροφή</a>
</div>

<script>
function showLang(lang) {
  document.getElementById('terms-el').style.display = lang === 'el' ? 'block' : 'none';
  document.getElementById('terms-en').style.display = lang === 'en' ? 'block' : 'none';
  document.getElementById('lang-el').className = lang === 'el' ? 'active' : '';
  document.getElementById('lang-en').className = lang === 'en' ? 'active' : '';
  document.getElementById('back-link-text').innerHTML = lang === 'el' ? '&#8592; Επιστροφή' : '&#8592; Back to Login';
}
</script>
</body>
</html>"""


REGISTER_HTML = """<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>FastWrite — Register</title>
<style>
:root{--bg:#0a0c10;--bg2:#111318;--bg3:#181c24;--border:#1e2330;--accent:#00e5a0;--text:#e8eaf0;--text2:#7c8299;--danger:#ff4444;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center;}
.reg-card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:48px 40px;width:100%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.5);}
.reg-card h1{font-size:24px;margin-bottom:8px;letter-spacing:-0.5px;}
.reg-card h1 span{color:var(--accent);}
.reg-card p{color:var(--text2);font-size:14px;margin-bottom:32px;}
label{display:block;font-size:12px;color:var(--text2);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;}
input{width:100%;padding:12px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;margin-bottom:16px;outline:none;transition:border .2s;}
input:focus{border-color:var(--accent);}
button{width:100%;padding:14px;background:var(--accent);color:#0a0c10;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:opacity .2s;}
button:hover{opacity:.85;}
.error-msg{color:var(--danger);font-size:13px;margin-bottom:16px;display:none;}
.success-msg{color:var(--accent);font-size:13px;margin-bottom:16px;display:none;}
</style>
</head>
<body>
<div class="reg-card">
  <h1>Fast<span>Write</span></h1>
  <p>Create your account</p>
  <div class="error-msg" id="error-msg"></div>
  <div class="success-msg" id="success-msg"></div>
  <form id="reg-form" onsubmit="return doRegister(event)">
    <label>Username</label>
    <input type="text" id="reg-username" placeholder="min. 3 characters" autocomplete="username" required minlength="3"/>
    <label>Email (optional)</label>
    <input type="email" id="reg-email" placeholder="your@email.com" autocomplete="email"/>
    <label>Password</label>
    <div style="position:relative">
      <input type="password" id="reg-password" placeholder="min. 6 characters" autocomplete="new-password" required minlength="6" style="padding-right:40px"/>
      <span onclick="var p=document.getElementById('reg-password');p.type=p.type==='password'?'text':'password'" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;color:#7c8299;font-size:18px;">&#128065;</span>
    </div>
    <label>Confirm Password</label>
    <div style="position:relative">
      <input type="password" id="reg-password2" placeholder="repeat password" autocomplete="new-password" required minlength="6" style="padding-right:40px"/>
      <span onclick="var p=document.getElementById('reg-password2');p.type=p.type==='password'?'text':'password'" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;color:#7c8299;font-size:18px;">&#128065;</span>
    </div>
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:16px;">
      <input type="checkbox" id="reg-terms" required style="margin-top:3px;accent-color:#00e5a0;width:16px;height:16px;flex-shrink:0;cursor:pointer;"/>
      <label for="reg-terms" style="font-size:12px;color:#7c8299;text-transform:none;letter-spacing:0;cursor:pointer;">
        I have read and agree to the <a href="/ui/terms" target="_blank" style="color:#00e5a0;">Terms &amp; Conditions</a>
      </label>
    </div>
    <button type="submit">Create Account</button>
  </form>
  <div style="text-align:center;margin-top:20px;font-size:13px;color:#7c8299;">
    Already have an account? <a href="/ui/login" style="color:#00e5a0;text-decoration:none;">Sign In</a>
  </div>
</div>
<script>
async function doRegister(e){
  e.preventDefault();
  const err=document.getElementById('error-msg');
  const suc=document.getElementById('success-msg');
  err.style.display='none';suc.style.display='none';
  const username=document.getElementById('reg-username').value.trim();
  const email=document.getElementById('reg-email').value.trim();
  const pw=document.getElementById('reg-password').value;
  const pw2=document.getElementById('reg-password2').value;
  if(pw!==pw2){err.textContent='Passwords do not match';err.style.display='block';return false;}
  try{
    const r=await fetch('/api/auth/register',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:username,password:pw,email:email})});
    const d=await r.json();
    if(r.ok&&d.success){window.location.href='/ui';}
    else{err.textContent=d.error||'Registration failed';err.style.display='block';}
  }catch(ex){err.textContent='Connection error';err.style.display='block';}
  return false;
}
</script>
</body>
</html>"""


@app.get("/ui/register")
def serve_register():
    return REGISTER_HTML, 200, {"Content-Type": "text/html"}


@app.get("/ui")
@app.get("/ui/")
def serve_ui():
    token = request.cookies.get(COOKIE_NAME)
    if not token or not verify_token(token):
        return redirect("/ui/login")
    return send_file("/app/projects/static/index.html")


@app.get("/ui/<path:subpath>")
def serve_ui_spa(subpath):
    """Catch-all for SPA client-side routing."""
    token = request.cookies.get(COOKIE_NAME)
    if not token or not verify_token(token):
        return redirect("/ui/login")
    return send_file("/app/projects/static/index.html")

# ── App Start ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
