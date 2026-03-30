"""
Module 9: Batch Processor
Επεξεργασία PDF με 0-200 τιμολόγια.
Pass 1 → AI Segmentation (εντοπισμός ορίων τιμολογίων)
Pass 2 → Parallel Extraction (ThreadPoolExecutor, workers=4)
"""

import json
import time
import uuid
import threading
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

BATCH_SIZE            = 10
MAX_WORKERS           = 4
MAX_PAGES_PER_INVOICE = 10

def _smart_filename(extracted_data, original_filename):
    """Δημιουργεί έξυπνο filename: 'vendor — invoice_no' ή fallback."""
    data = extracted_data or {}
    vendor = (data.get("vendor_name") or data.get("supplier_name") or
              data.get("company") or data.get("issuer") or
              data.get("_matched_supplier") or "").strip()
    inv_no = (data.get("invoice_number") or data.get("invoice_no") or
              data.get("inv_number") or data.get("number") or "").strip()
    safe = lambda s: "".join(c for c in s if c not in r'\/:*?"<>|').strip()
    if vendor and inv_no:
        return f"{safe(vendor)} \u2014 {safe(inv_no)}"
    elif vendor:
        return safe(vendor)
    elif inv_no:
        return f"Invoice {safe(inv_no)}"
    return None  # fallback: κρατά το υπάρχον filename

# Prompt για segmentation (ορισμός ορίων τιμολογίων)
SEGMENTATION_PROMPT = """You are analyzing pages from a PDF that contains one or more invoices/documents.
Your task: identify which page starts a NEW invoice/document.

Rules:
- Page 1 is ALWAYS the start of a new document (new_doc: true)
- new_doc: true = this page starts a NEW invoice (different supplier, invoice number, or document header)
- new_doc: false = this page is a CONTINUATION of the previous invoice (e.g. page 2 of a multi-page invoice)

Key signals that indicate a NEW invoice:
- Different company/supplier name at the top
- New invoice number
- New document header (e.g. "Invoice", "Sales Invoice", "Tax Invoice")
- Completely different layout/format

Key signals that indicate CONTINUATION:
- "Page 2 of 2" or similar
- Same invoice number
- Continuation of a table from previous page
- Payment terms / signature section of the same invoice

Return ONLY valid JSON. The "page" field must be the 1-based index of the page within this batch.
Example for 4 pages where page 1-2 are one invoice, page 3 and 4 are separate invoices:
{"pages": [{"page":1,"new_doc":true},{"page":2,"new_doc":false},{"page":3,"new_doc":true},{"page":4,"new_doc":true}]}"""

# Prompt για εξαγωγή ονόματος προμηθευτή (Auto Template Matching)
SUPPLIER_DETECT_PROMPT = """Κοίτα το παρακάτω τιμολόγιο και εξήγαγε ΜΟΝΟ το όνομα του προμηθευτή/εκδότη.
Επίστρεψε ΜΟΝΟ το όνομα, χωρίς εξηγήσεις. Αν δεν βρεθεί, επίστρεψε 'UNKNOWN'."""


@dataclass
class InvoiceSegment:
    pages      : list = None
    page_nums  : list = None
    def __post_init__(self):
        if self.pages is None: self.pages = []
        if self.page_nums is None: self.page_nums = []

@dataclass
class BatchJobStatus:
    job_id        : str  = ""
    status        : str  = "pending"
    total_pages   : int  = 0
    total_invoices: int  = 0
    processed     : int  = 0
    failed        : int  = 0
    doc_ids       : list = None
    errors        : list = None
    started_at    : str  = ""
    completed_at  : str  = ""
    progress_pct  : float = 0.0
    def __post_init__(self):
        if self.doc_ids is None: self.doc_ids = []
        if self.errors  is None: self.errors  = []
    def to_dict(self):
        return {
            "job_id": self.job_id, "status": self.status,
            "total_pages": self.total_pages, "total_invoices": self.total_invoices,
            "processed": self.processed, "failed": self.failed,
            "doc_ids": self.doc_ids, "errors": self.errors,
            "started_at": self.started_at, "completed_at": self.completed_at,
            "progress_pct": self.progress_pct,
        }


class BatchProcessor:
    def __init__(self, db, key_mgr, processor, schema_bld,
                 batch_size=BATCH_SIZE, max_workers=MAX_WORKERS):
        self.db          = db
        self.key_mgr     = key_mgr
        self.processor   = processor
        self.schema_bld  = schema_bld
        self.batch_size  = batch_size
        self.max_workers = max_workers
        self._jobs       = {}
        self._jobs_lock  = threading.Lock()

    def submit(self, pdf_path, schema_name, original_filename="", auto_match=False,
               skip_completed=False):
        job_id = str(uuid.uuid4())
        job    = BatchJobStatus(job_id=job_id, status="pending",
                                started_at=datetime.utcnow().isoformat())
        with self._jobs_lock:
            self._jobs[job_id] = job
        t = threading.Thread(target=self._run_job,
            args=(job_id, pdf_path, schema_name, original_filename,
                  auto_match, skip_completed), daemon=True)
        t.start()
        return job_id

    def get_status(self, job_id):
        with self._jobs_lock:
            job = self._jobs.get(job_id)
        return job.to_dict() if job else None

    def list_jobs(self):
        with self._jobs_lock:
            return [j.to_dict() for j in self._jobs.values()]

    def _run_job(self, job_id, pdf_path, schema_name, original_filename,
                 auto_match=False, skip_completed=False):
        job = self._get_job(job_id)
        job.status = "running"
        try:
            processed = self.processor.process(pdf_path)
            if not processed.is_ok():
                self._fail_job(job, f"FileProcessor error: {processed.error_message}")
                return
            all_pages = processed.pages
            job.total_pages = len(all_pages)
            self._update_job(job)

            segments = self._segment(all_pages, job)
            if segments is None:
                return

            job.total_invoices = len(segments)
            self._update_job(job)

            self._extract_parallel(segments, schema_name, original_filename, job,
                                   auto_match=auto_match,
                                   skip_completed=skip_completed)

            job.status       = "completed"
            job.completed_at = datetime.utcnow().isoformat()
            job.progress_pct = 100.0
            self._update_job(job)
        except Exception as e:
            self._fail_job(job, f"Unexpected error: {e}")

    def _segment(self, pages, job):
        from ai_extractor import AIExtractor
        api_key = self.key_mgr.get_key("gemini")
        if not api_key:
            self._fail_job(job, "Gemini API key δεν βρέθηκε.")
            return None

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

        extractor   = AIExtractor(api_key=api_key)
        page_labels = {}

        for batch_start in range(0, len(pages), self.batch_size):
            batch_pages = pages[batch_start: batch_start + self.batch_size]
            result = extractor.extract(image_paths=batch_pages, schema=seg_schema,
                                       extra_instructions=SEGMENTATION_PROMPT)
            if result.is_ok():
                for item in result.extracted_data.get("pages", []):
                    local_page  = item.get("page", 0)
                    global_page = batch_start + local_page
                    page_labels[global_page] = item.get("new_doc", False)
            else:
                job.errors.append(
                    f"Segmentation batch {batch_start} απέτυχε: {result.error_message}. "
                    f"Κάθε σελίδα θεωρείται ξεχωριστό τιμολόγιο.")
                for i in range(len(batch_pages)):
                    page_labels[batch_start + i + 1] = True

        page_labels[1] = True

        segments    = []
        current_seg = None
        for i, page_path in enumerate(pages):
            page_num = i + 1
            is_new   = page_labels.get(page_num, True)
            if is_new or current_seg is None:
                current_seg = InvoiceSegment()
                segments.append(current_seg)
            if len(current_seg.pages) >= MAX_PAGES_PER_INVOICE:
                current_seg = InvoiceSegment()
                segments.append(current_seg)
            current_seg.pages.append(page_path)
            current_seg.page_nums.append(page_num)
        return segments

    def _match_template(self, extractor, segment_pages, default_schema_name, job):
        """
        Auto Template Matching:
        1. Ρωτά το Gemini ποιος είναι ο προμηθευτής (από την 1η σελίδα του segment)
        2. Ψάχνει στη λίστα templates για supplier_pattern που να ταιριάζει
        3. Fallback: επιστρέφει το default_schema_name
        """
        try:
            supplier_schema = {
                "type": "object",
                "properties": {
                    "supplier_name": {"type": "string"}
                },
                "required": ["supplier_name"]
            }
            # Χρησιμοποιούμε μόνο την 1η σελίδα για ταχύτητα
            result = extractor.extract(
                image_paths=segment_pages[:1],
                schema=supplier_schema,
                extra_instructions=SUPPLIER_DETECT_PROMPT
            )
            if not result.is_ok():
                return default_schema_name, "unknown"

            detected = (result.extracted_data.get("supplier_name") or "").strip()
            if not detected or detected.upper() == "UNKNOWN":
                return default_schema_name, "unknown"

            # Fuzzy match: ψάχνουμε templates με supplier_pattern
            templates = self.db.list_templates()
            detected_lower = detected.lower()
            best_match = None
            for tmpl in templates:
                pattern = (tmpl.get("supplier_pattern") or "").strip().lower()
                if not pattern:
                    continue
                # Κάθε pattern μπορεί να έχει πολλές λέξεις-κλειδιά χωρισμένες με κόμμα
                keywords = [k.strip() for k in pattern.split(",") if k.strip()]
                for kw in keywords:
                    if kw and kw in detected_lower:
                        best_match = tmpl["name"]
                        break
                if best_match:
                    break

            if best_match:
                return best_match, detected, True   # True = real match
            return default_schema_name, detected, False  # False = fallback

        except Exception as e:
            job.errors.append(f"Template matching error: {e}. Χρήση default.")
            return default_schema_name, "unknown", False

    def _extract_parallel(self, segments, schema_name, original_filename, job,
                          auto_match=False, skip_completed=False):
        from ai_extractor import AIExtractor
        api_key  = self.key_mgr.get_key("gemini")

        default_template = self.db.get_template(schema_name)
        if not default_template:
            self._fail_job(job, f"Template '{schema_name}' δεν βρέθηκε.")
            return
        default_schema = self.schema_bld.build_from_list(default_template["fields"])
        default_schema.pop("additionalProperties", None)

        def extract_one(idx, segment, doc_id):
            try:
                extractor = AIExtractor(api_key=api_key)

                # ── Auto Template Matching ──────────────────────────────────
                if auto_match:
                    matched_name, detected_supplier, is_real_match = self._match_template(
                        extractor, segment.pages, schema_name, job)
                    if is_real_match:
                        tmpl = self.db.get_template(matched_name)
                        if tmpl:
                            seg_schema = self.schema_bld.build_from_list(tmpl["fields"])
                            seg_schema.pop("additionalProperties", None)
                            used_schema_name    = matched_name
                            used_require_review = tmpl.get("require_review", True)
                        else:
                            # Template name matched αλλά δεν βρέθηκε στη βάση
                            self.db.update_document_status(
                                doc_id, status="no_template",
                                result_json=json.dumps({"_skipped": True,
                                    "_reason": "Template δεν βρέθηκε στη βάση",
                                    "_matched_supplier": detected_supplier or "unknown"}))
                            return {"success": True, "doc_id": doc_id,
                                    "matched_template": None, "skipped": True}
                    else:
                        # Δεν βρέθηκε template match — SKIP τιμολόγιο
                        self.db.update_document_status(
                            doc_id, status="no_template",
                            result_json=json.dumps({"_skipped": True,
                                "_reason": "Δεν βρέθηκε template για αυτό το τιμολόγιο",
                                "_matched_supplier": detected_supplier or "unknown"}))
                        return {"success": True, "doc_id": doc_id,
                                "matched_template": None, "skipped": True}
                else:
                    seg_schema          = default_schema
                    used_schema_name    = schema_name
                    used_require_review = default_template.get("require_review", True)
                    detected_supplier   = None

                result = extractor.extract(image_paths=segment.pages, schema=seg_schema)
                if result.is_ok():
                    final_status = "pending_review" if used_require_review else "Completed"
                    extracted = result.extracted_data
                    if detected_supplier and detected_supplier != "unknown":
                        extracted.setdefault("_matched_supplier", detected_supplier)
                        extracted.setdefault("_matched_template", used_schema_name)
                    self.db.update_document_status(
                        doc_id, status=final_status,
                        result_json=json.dumps(extracted))
                    # Smart filename: vendor — invoice_no
                    try:
                        smart = _smart_filename(extracted, original_filename)
                        if smart:
                            self.db.conn.execute(
                                "UPDATE documents SET filename=? WHERE id=?",
                                (smart, doc_id))
                            self.db.conn.commit()
                    except Exception:
                        pass
                    if used_schema_name != schema_name:
                        try:
                            self.db.conn.execute(
                                "UPDATE documents SET schema_name=? WHERE id=?",
                                (used_schema_name, doc_id))
                            self.db.conn.commit()
                        except Exception:
                            pass
                    return {"success": True, "doc_id": doc_id,
                            "matched_template": used_schema_name}
                else:
                    self.db.update_document_status(doc_id, status="Failed")
                    return {"success": False, "doc_id": doc_id,
                            "error": result.error_message}
            except Exception as e:
                self.db.update_document_status(doc_id, status="Failed")
                return {"success": False, "doc_id": doc_id, "error": str(e)}

        # ── Pre-register: καταχώρηση ΠΡΙΝ το parallel extraction ──────────
        # Αν skip_completed=True, ελέγχουμε αν υπάρχει ήδη Completed έγγραφο
        # με το ίδιο filename — αν ναι, το παραλείπουμε εντελώς.
        doc_id_map  = {}   # idx → doc_id  (για extraction)
        skipped_map = {}   # idx → doc_id  (ήδη Completed, skip)

        all_docs_by_filename = {}
        if skip_completed:
            # Φτιάχνουμε index filename → doc για γρήγορο lookup
            existing = self.db.list_documents()
            for d in existing:
                if d.get("status") in ("Completed", "pending_review"):
                    all_docs_by_filename[d["filename"]] = d["id"]

        for idx, segment in enumerate(segments):
            pages_str = ",".join(str(p) for p in segment.page_nums)
            stem      = Path(original_filename).stem if original_filename else "batch"
            filename  = f"{stem}_inv{idx+1:03d}_pages{pages_str}.pdf"

            if skip_completed and filename in all_docs_by_filename:
                # Υπάρχει ήδη — παράλειψη
                existing_id = all_docs_by_filename[filename]
                skipped_map[idx] = existing_id
                job.doc_ids.append(existing_id)
                job.processed += 1
                job.errors.append(
                    f"Invoice {idx+1} ({filename}): παραλείφθηκε (ήδη Completed).")
            else:
                doc_id = self.db.insert_document(
                    filename=filename,
                    file_path=str(segment.pages[0]),
                    schema_name=schema_name,
                    original_filename=original_filename or filename)
                doc_id_map[idx] = doc_id

        # Ενημέρωση progress για skipped
        total = job.total_invoices or 1
        job.progress_pct = round((job.processed + job.failed) / total * 100, 1)
        self._update_job(job)

        # Αν δεν υπάρχουν segments για extraction, τελειώνουμε
        if not doc_id_map:
            return

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {executor.submit(extract_one, idx, segments[idx], doc_id_map[idx]): idx
                       for idx in doc_id_map}
            for future in as_completed(futures):
                res = future.result()
                if res["success"]:
                    job.processed += 1
                    job.doc_ids.append(res["doc_id"])
                else:
                    job.failed += 1
                    job.errors.append(
                        f"Invoice {futures[future]+1}: {res.get('error','unknown')}")
                    if "doc_id" in res:
                        job.doc_ids.append(res["doc_id"])
                total = job.total_invoices or 1
                job.progress_pct = round((job.processed + job.failed) / total * 100, 1)
                self._update_job(job)

    def _get_job(self, job_id):
        with self._jobs_lock:
            return self._jobs[job_id]

    def _update_job(self, job):
        with self._jobs_lock:
            self._jobs[job.job_id] = job

    def _fail_job(self, job, error):
        job.status       = "failed"
        job.completed_at = datetime.utcnow().isoformat()
        job.errors.append(error)
        self._update_job(job)
