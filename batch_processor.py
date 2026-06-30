"""
Module 9: Batch Processor
Επεξεργασία PDF με 0-200 τιμολόγια.
Pass 1 → AI Segmentation (εντοπισμός ορίων τιμολογίων)
Pass 2 → Parallel Extraction (ThreadPoolExecutor, workers=4)
"""

import os
import json
import time
import uuid
import logging
import threading
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from perf_config import get_max_workers
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _calc_confidence(extracted: dict, schema: dict) -> float:
    """Υπολογισμός ποσοστού εμπιστοσύνης βάσει πληρότητας πεδίων.
    Ελέγχει πόσα πεδία του schema επιστράφηκαν non-null/non-empty.
    Επιστρέφει ποσοστό 0-100.
    """
    if not schema or not extracted:
        return 0.0
    props = schema.get("properties", {})
    if not props:
        return 0.0
    # Μετράμε μόνο πεδία χρήστη (όχι metadata _matched_supplier κτλ)
    total = 0
    filled = 0
    for key, prop in props.items():
        if key.startswith("_"):
            continue
        total += 1
        val = extracted.get(key)
        if val is None:
            continue
        if isinstance(val, str) and val.strip() == "":
            continue
        if isinstance(val, list):
            # array field: μετράμε αν έχει τουλάχιστον 1 item
            if len(val) > 0:
                filled += 1
            continue
        filled += 1
    return round((filled / total) * 100, 1) if total > 0 else 0.0

BATCH_SIZE            = 10
# Default worker count (fallback). The ACTIVE count is read at runtime via
# perf_config.get_max_workers() in _run_job, so it applies without a rebuild.
MAX_WORKERS           = 8
MAX_PAGES_PER_INVOICE = 10
# B7: bbox (Tour-mode field locations) is a SECOND AI call per doc → it doubled
# batch time. Skipped in bulk; Tour-mode now computes bboxes ON-DEMAND when a
# single doc is opened for review (see /api/document/<id>/bboxes). Keeps batch
# fast AND keeps the highlight available (best-effort) for whatever doc is viewed.
SKIP_BBOX_IN_BATCH    = True

# Default field set for AUTO-CREATED labels. When registration detects a supplier
# that has no existing label, the system creates one with all standard fields
# (zero manual setup). Fields not present on a given invoice simply extract null.
DEFAULT_LABEL_FIELDS = [
    {"name": "invoice_number", "type": "string"},
    {"name": "invoice_date",   "type": "date"},
    {"name": "vendor_name",    "type": "string"},
    {"name": "vendor_afm",     "type": "string"},
    {"name": "buyer_name",     "type": "string"},
    {"name": "buyer_afm",      "type": "string"},
    {"name": "net_amount",     "type": "number"},
    {"name": "vat_rate",       "type": "number"},
    {"name": "vat_amount",     "type": "number"},
    {"name": "total_amount",   "type": "number"},
    {"name": "line_items", "type": "array", "items": [
        {"name": "item_code",      "type": "string", "nullable": True,
         "description": "Product/item code if present on the line, else null."},
        {"name": "description",    "type": "string",
         "description": "Line item description."},
        {"name": "pack_size",      "type": "string", "nullable": True,
         "description": "Pack size (e.g. 1x24) if present on the line, else null."},
        {"name": "quantity",       "type": "number",
         "description": "Quantity for the line."},
        {"name": "unit_price",     "type": "number",
         "description": "Unit price for the line."},
        {"name": "total",          "type": "number",
         "description": "Line total EXCLUDING VAT (net line amount)."},
        {"name": "vat_rate",       "type": "number", "nullable": True,
         "description": "VAT percentage for the line (e.g. 19), or null if the line has no VAT column."},
        {"name": "vat_amount",     "type": "number", "nullable": True,
         "description": "VAT amount for the line, or null if the line has no VAT column."},
        {"name": "total_incl_vat", "type": "number", "nullable": True,
         "description": "Line total INCLUDING VAT (gross line amount), or null if not shown on the line."},
    ]},
]


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

# Prompt για segmentation (ορισμός ορίων τιμολογίων + supplier ανά σελίδα).
# Ο supplier ενσωματώθηκε ΕΔΩ (fold-into-segmentation) ώστε να ΜΗΝ χρειάζεται
# ξεχωριστή AI κλήση ανά τιμολόγιο για auto-match (ταχύτητα + λιγότερα failures).
SEGMENTATION_PROMPT = """You are analyzing pages from a PDF that contains one or more invoices/documents.
For EACH page do TWO things:
1. Decide whether it STARTS a new invoice/document (new_doc).
2. Extract the SUPPLIER / VENDOR / ISSUER name printed on that page — the company that ISSUED the invoice (the seller), NOT the recipient/buyer. Look at the company name at the top, letterhead/logo, or 'From:' section. For a continuation page, repeat the same supplier as its invoice. If no supplier is visible, use "UNKNOWN".

Rules for new_doc:
- Page 1 is ALWAYS the start of a new document (new_doc: true)
- new_doc: true = this page starts a NEW invoice (different supplier, invoice number, or document header)
- new_doc: false = this page is a CONTINUATION of the previous invoice (e.g. page 2 of a multi-page invoice)

Key signals for a NEW invoice: different company/supplier at the top, new invoice number, new document header ("Invoice", "Tax Invoice"), completely different layout.
Key signals for CONTINUATION: "Page 2 of 2", same invoice number, table continued from previous page, payment/signature section of the same invoice.

Return ONLY valid JSON. The "page" field must be the 1-based index of the page within this batch.
Example (4 pages; pages 1-2 = one invoice from Acme, page 3 = Beta Ltd, page 4 = Gamma Co):
{"pages":[{"page":1,"new_doc":true,"supplier_name":"Acme Ltd"},{"page":2,"new_doc":false,"supplier_name":"Acme Ltd"},{"page":3,"new_doc":true,"supplier_name":"Beta Ltd"},{"page":4,"new_doc":true,"supplier_name":"Gamma Co"}]}"""

# Prompt για εξαγωγή ονόματος προμηθευτή (Auto Template Matching)
# ΣΗΜΕΙΩΣΗ: Χρησιμοποιείται με skip_confidence=True στο extract()
# ώστε να μην μπερδεύεται το Gemini με _confidence_pct instructions.
SUPPLIER_DETECT_PROMPT = """Look at the document image and identify the SUPPLIER / VENDOR / ISSUER of this invoice.
The supplier is the company that ISSUED the invoice (the seller), NOT the recipient/buyer.
Look for: company name at the top, letterhead, logo text, or 'From:' section.
Return the company name as-is from the document. If the document is not an invoice or no supplier is visible, return 'UNKNOWN'."""


@dataclass
class InvoiceSegment:
    pages      : list = None
    page_nums  : list = None
    supplier   : str  = None   # supplier of the segment's first page (from segmentation pass)
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
    skipped       : int  = 0
    no_template   : int  = 0
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
            "skipped": self.skipped, "no_template": self.no_template,
            "doc_ids": self.doc_ids, "errors": self.errors,
            "started_at": self.started_at, "completed_at": self.completed_at,
            "progress_pct": self.progress_pct,
        }


class BatchProcessor:
    def __init__(self, db, key_mgr, processor, schema_bld,
                 batch_size=BATCH_SIZE, max_workers=MAX_WORKERS,
                 license_consumer=None, license_enforcer=None):
        self.db          = db
        self.key_mgr     = key_mgr
        self.processor   = processor
        self.schema_bld  = schema_bld
        self.batch_size  = batch_size
        self.max_workers = max_workers
        # B5: optional callback to consume LICENSE usage after a successful
        # extraction (injected from main_api to avoid a circular import).
        self.license_consumer = license_consumer
        # Hard gate: optional callback returning True if the license/trial has
        # room for N more docs. Checked BEFORE extraction so the doc cap is
        # actually enforced (the consumer only counts, it never blocks).
        self.license_enforcer = license_enforcer
        self._jobs       = {}
        self._jobs_lock  = threading.Lock()
        self._current_user_id = None

    def submit(self, pdf_path, schema_name, original_filename="", auto_match=False,
               skip_completed=False, registration_only=False, user_id=None):
        job_id = str(uuid.uuid4())
        job    = BatchJobStatus(job_id=job_id, status="pending",
                                started_at=datetime.utcnow().isoformat())
        with self._jobs_lock:
            self._jobs[job_id] = job
        t = threading.Thread(target=self._run_job,
            args=(job_id, pdf_path, schema_name, original_filename,
                  auto_match, skip_completed, registration_only, user_id), daemon=True)
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
                 auto_match=False, skip_completed=False, registration_only=False,
                 user_id=None):
        self._current_user_id = user_id
        job = self._get_job(job_id)
        job.status = "running"
        # B6: small non-zero progress immediately so the bar shows life during the
        # render phase (a single blocking call with no sub-steps to report).
        job.progress_pct = 2.0
        self._update_job(job)
        # Apply the runtime-configured worker count (turbo) for this job.
        self.max_workers = get_max_workers()
        logger.info("[batch] job %s using %d workers", job_id, self.max_workers)
        # B6: progress bands sized ~proportionally to each phase's duration so the
        # bar moves evenly (not frozen during render then rushing at the end).
        # Registration is render+segmentation heavy (its "extraction" is just DB
        # writes); a full batch is extraction (AI) heavy.
        if registration_only:
            render_end, seg_end = 40.0, 97.0
        else:
            render_end, seg_end = 15.0, 30.0
        try:
            processed = self.processor.process(
                pdf_path,
                progress_cb=lambda done, tot: self._set_progress(
                    job, 2 + (done / max(tot, 1)) * (render_end - 2)))
            if not processed.is_ok():
                self._fail_job(job, f"FileProcessor error: {processed.error_message}")
                return
            all_pages = processed.pages
            job.total_pages = len(all_pages)
            self._update_job(job)

            segments = self._segment(all_pages, job, render_end, seg_end)
            if segments is None:
                return

            job.total_invoices = len(segments)
            self._update_job(job)

            self._extract_parallel(segments, schema_name, original_filename, job,
                                   auto_match=auto_match,
                                   skip_completed=skip_completed,
                                   registration_only=registration_only,
                                   prog_start=seg_end)

            job.status       = "completed"
            job.completed_at = datetime.utcnow().isoformat()
            job.progress_pct = 100.0
            self._update_job(job)
        except Exception as e:
            self._fail_job(job, f"Unexpected error: {e}")

    def _set_progress(self, job, pct):
        """Set job.progress_pct (clamped 0-100) and publish. Used as the render
        progress callback and for phase transitions (B6)."""
        job.progress_pct = round(max(0.0, min(pct, 100.0)), 1)
        self._update_job(job)

    def _segment(self, pages, job, prog_start=5.0, prog_end=50.0):
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
                            "page":          {"type": "integer"},
                            "new_doc":       {"type": "boolean"},
                            "supplier_name": {"type": "string"},
                        },
                        # supplier_name optional: a miss falls back to per-doc detection
                        "required": ["page", "new_doc"],
                    }
                }
            },
            "required": ["pages"],
        }

        page_labels    = {}
        page_suppliers = {}   # global_page → supplier name (folded in from segmentation)

        # ── B6: Parallelize segmentation (was serial: ~20 Gemini calls for 200
        # pages). Each page-batch runs in its own worker; page ranges are disjoint
        # so results are merged serially in the main thread (no race conditions).
        def _segment_batch(batch_start):
            batch_pages = pages[batch_start: batch_start + self.batch_size]
            extractor = AIExtractor(api_key=api_key)
            result = extractor.extract(image_paths=batch_pages, schema=seg_schema,
                                       extra_instructions=SEGMENTATION_PROMPT)
            local_labels    = {}
            local_suppliers = {}
            local_error = None
            if result.is_ok():
                for item in result.extracted_data.get("pages", []):
                    local_page  = item.get("page", 0)
                    global_page = batch_start + local_page
                    local_labels[global_page] = item.get("new_doc", False)
                    sup = (item.get("supplier_name") or "").strip()
                    if sup:
                        local_suppliers[global_page] = sup
            else:
                local_error = (
                    f"Segmentation batch {batch_start} απέτυχε: {result.error_message}. "
                    f"Κάθε σελίδα θεωρείται ξεχωριστό τιμολόγιο.")
                for i in range(len(batch_pages)):
                    local_labels[batch_start + i + 1] = True
            return local_labels, local_suppliers, local_error

        batch_starts = list(range(0, len(pages), self.batch_size))
        total_batches = len(batch_starts) or 1
        done_batches = 0

        # B6 smoothing: the parallel segmentation calls return in a burst, so the
        # bar would freeze ~15-20s then jump. A daemon "creeper" nudges it forward
        # during that wait (up to ~70% of the segmentation band). Real completions
        # use max() so the bar never moves backwards.
        _seg_done = [False]
        def _creeper():
            cap = prog_start + 0.70 * (prog_end - prog_start)
            while not _seg_done[0]:
                time.sleep(0.7)
                if _seg_done[0]:
                    break
                if job.progress_pct < cap:
                    job.progress_pct = round(min(job.progress_pct + 0.8, cap), 1)
                    self._update_job(job)
        _creep_t = threading.Thread(target=_creeper, daemon=True)
        _creep_t.start()

        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            # Merge is order-independent (dicts keyed by global page number), so we
            # consume as_completed to drive LIVE progress. Segmentation fills the
            # render_end..seg_end band.
            futs = [pool.submit(_segment_batch, bs) for bs in batch_starts]
            for fut in as_completed(futs):
                local_labels, local_suppliers, local_error = fut.result()
                page_labels.update(local_labels)
                page_suppliers.update(local_suppliers)
                if local_error:
                    job.errors.append(local_error)
                done_batches += 1
                real = round(prog_start + (done_batches / total_batches) * (prog_end - prog_start), 1)
                job.progress_pct = max(job.progress_pct, real)
                self._update_job(job)
        _seg_done[0] = True

        page_labels[1] = True

        segments    = []
        current_seg = None
        for i, page_path in enumerate(pages):
            page_num = i + 1
            is_new   = page_labels.get(page_num, True)
            if is_new or current_seg is None:
                current_seg = InvoiceSegment(supplier=page_suppliers.get(page_num))
                segments.append(current_seg)
            if len(current_seg.pages) >= MAX_PAGES_PER_INVOICE:
                current_seg = InvoiceSegment(supplier=page_suppliers.get(page_num))
                segments.append(current_seg)
            current_seg.pages.append(page_path)
            current_seg.page_nums.append(page_num)
        return segments

    def _detect_supplier(self, extractor, segment_pages):
        """FALLBACK supplier detection via a dedicated AI call.

        Used ONLY when the segmentation pass did not capture a supplier for this
        segment (normally the supplier is folded into segmentation, so this rarely
        runs). Returns the detected name, or 'unknown'.
        """
        try:
            supplier_schema = {
                "type": "object",
                "properties": {"supplier_name": {"type": "string"}},
                "required": ["supplier_name"]
            }
            result = extractor.extract(
                image_paths=segment_pages[:1],
                schema=supplier_schema,
                extra_instructions=SUPPLIER_DETECT_PROMPT,
                skip_confidence=True
            )
            if not result.is_ok():
                print(f"[_detect_supplier] Gemini FAILED: {result.error_message}", flush=True)
                return "unknown"
            detected = (result.extracted_data.get("supplier_name") or "").strip()
            if not detected or detected.upper() == "UNKNOWN":
                return "unknown"
            return detected
        except Exception as e:
            print(f"[_detect_supplier] error: {e}", flush=True)
            return "unknown"

    @staticmethod
    def _match_supplier(detected, templates, default_schema_name):
        """PURE in-memory match: detected supplier → template by supplier_pattern.

        No AI call, no DB read — `templates` is pre-fetched ONCE by the caller.
        (Previously this read db.list_templates() per-doc on the shared SQLite
        connection, which raced with concurrent writes → intermittent empty
        results → false 'no template match' → missing labels. B10 Cause 2.)

        Returns (matched_name, detected, is_real_match).
        """
        if not detected or detected == "unknown":
            return default_schema_name, "unknown", False
        detected_lower = detected.lower()
        for tmpl in (templates or []):
            pattern = (tmpl.get("supplier_pattern") or "").strip().lower()
            if not pattern:
                continue
            # pattern = comma-separated keywords; substring match against detected
            for kw in [k.strip() for k in pattern.split(",") if k.strip()]:
                if kw and kw in detected_lower:
                    return tmpl["name"], detected, True   # real match
        return default_schema_name, detected, False       # fallback

    def _extract_parallel(self, segments, schema_name, original_filename, job,
                          auto_match=False, skip_completed=False,
                          registration_only=False, prog_start=50.0):
        from ai_extractor import AIExtractor
        api_key  = self.key_mgr.get_key("gemini")

        print(f"[_extract_parallel] START: original_filename='{original_filename}', "
              f"skip_completed={skip_completed}, auto_match={auto_match}, "
              f"registration_only={registration_only}, segments={len(segments)}", flush=True)

        default_template = self.db.get_template(schema_name, user_id=self._current_user_id) if schema_name else None
        if not default_template and not auto_match:
            self._fail_job(job, f"Template '{schema_name}' δεν βρέθηκε.")
            return
        if default_template:
            default_schema = self.schema_bld.build_from_list(default_template["fields"])
            default_schema.pop("additionalProperties", None)
        else:
            default_schema = None

        # Pre-fetch templates ONCE for auto-match. Was: db.list_templates() called
        # per-doc inside _match_template → ~N concurrent reads on the shared SQLite
        # connection racing with writes → intermittent empty results → false
        # 'no template match' → missing labels (B10 Cause 2). One read, shared.
        templates_cache = (self.db.list_templates(user_id=self._current_user_id)
                           if auto_match else [])

        # Auto-label (get-or-create): when a detected supplier has NO label, create
        # one with the default fields → zero manual setup for the user. Serialized
        # so N invoices of the same NEW supplier produce ONE label (not duplicates),
        # and re-checks under the lock first. Never touches existing labels.
        _label_lock = threading.Lock()
        def _get_or_create_label(detected):
            with _label_lock:
                name, _det, is_real = self._match_supplier(detected, templates_cache, schema_name)
                if is_real:
                    return name
                try:
                    self.db.save_template(detected, DEFAULT_LABEL_FIELDS,
                                          supplier_pattern=detected,
                                          user_id=self._current_user_id)
                    templates_cache.append({"name": detected,
                                            "supplier_pattern": detected,
                                            "fields": DEFAULT_LABEL_FIELDS})
                    print(f"[auto-label] created label for supplier '{detected}'", flush=True)
                    return detected
                except Exception as e:
                    print(f"[auto-label] failed for '{detected}': {e}", flush=True)
                    return None

        def extract_one(idx, segment, doc_id):
            try:
                extractor = AIExtractor(api_key=api_key)
                detected_supplier = None
                used_schema_name  = None
                seg_schema        = None

                # ── ΒΗΜΑ 1: Template Matching (ετικέτα από supplier του segmentation) ──
                if auto_match:
                    # Supplier comes folded-in from the segmentation pass (no extra
                    # per-doc AI call). Fall back to a dedicated detection call ONLY
                    # if segmentation didn't capture a usable supplier for this segment.
                    seg_sup = (segment.supplier or "").strip()
                    if not seg_sup or seg_sup.upper() == "UNKNOWN":
                        detected_supplier = self._detect_supplier(extractor, segment.pages)
                    else:
                        detected_supplier = seg_sup
                    # Pure in-memory match against the pre-fetched template list.
                    matched_name, detected_supplier, is_real_match = self._match_supplier(
                        detected_supplier, templates_cache, schema_name)
                    # AUTO-LABEL: no existing label for this supplier → create one.
                    if not is_real_match and detected_supplier and detected_supplier != "unknown":
                        auto = _get_or_create_label(detected_supplier)
                        if auto:
                            matched_name, is_real_match = auto, True
                    print(f"[extract_one] doc_id={doc_id}, auto_match=True, "
                          f"is_real_match={is_real_match}, matched_name={matched_name}, "
                          f"detected_supplier={detected_supplier}, src={'seg' if seg_sup else 'fallback'}, "
                          f"registration_only={registration_only}", flush=True)
                    if is_real_match:
                        # Use the PRE-FETCHED templates (no per-doc DB read). The
                        # previous self.db.get_template() here ran on the shared
                        # SQLite connection inside 16 threads → cursor corruption
                        # ('bad parameter or other API misuse') / bad reads → docs
                        # marked Failed. B10 residual. matched_name came from this
                        # same cache, so it is guaranteed present.
                        tmpl = next((t for t in templates_cache
                                     if t.get("name") == matched_name), None)
                        if tmpl:
                            seg_schema = self.schema_bld.build_from_list(tmpl["fields"])
                            seg_schema.pop("additionalProperties", None)
                            used_schema_name = matched_name
                        else:
                            # Template name matched αλλά δεν βρέθηκε στη βάση
                            self.db.update_document_status(
                                doc_id, status="no_template",
                                result_json=json.dumps({"_skipped": True,
                                    "_reason": "Template δεν βρέθηκε στη βάση",
                                    "_matched_supplier": detected_supplier or "unknown"}))
                            self.db.set_document_schema(doc_id, None)
                            return {"success": True, "doc_id": doc_id,
                                    "matched_template": None, "skipped": True}
                    else:
                        # Δεν βρέθηκε template match — SKIP τιμολόγιο
                        self.db.update_document_status(
                            doc_id, status="no_template",
                            result_json=json.dumps({"_skipped": True,
                                "_reason": "Δεν βρέθηκε template για αυτό το τιμολόγιο",
                                "_matched_supplier": detected_supplier or "unknown"}))
                        self.db.set_document_schema(doc_id, None)
                        # ── Record usage: doc + pages ακόμα και για no_template ──
                        # Ο χρήστης κατανάλωσε Gemini API call + pages, οπότε
                        # πρέπει να μετρηθούν για το subscription enforcement.
                        try:
                            self.db.record_usage_event(
                                self._current_user_id, 'doc_processed', 1)
                            self.db.record_usage_event(
                                self._current_user_id, 'page_processed',
                                len(segment.pages))
                        except Exception as e:
                            logger.error("Failed to record no_template usage "
                                         "for doc %d: %s", doc_id, e)
                        return {"success": True, "doc_id": doc_id,
                                "matched_template": None, "skipped": True}
                else:
                    if not default_schema or not default_template:
                        self.db.update_document_status(
                            doc_id, status="no_template",
                            result_json=json.dumps({"_skipped": True,
                                "_reason": "Δεν υπάρχει ετικέτα",
                                "_matched_supplier": "unknown"}))
                        self.db.set_document_schema(doc_id, None)
                        # ── Record usage: doc + pages ακόμα και χωρίς ετικέτα ──
                        try:
                            self.db.record_usage_event(
                                self._current_user_id, 'doc_processed', 1)
                            self.db.record_usage_event(
                                self._current_user_id, 'page_processed',
                                len(segment.pages))
                        except Exception as e:
                            logger.error("Failed to record no_template usage "
                                         "for doc %d: %s", doc_id, e)
                        return {"success": True, "doc_id": doc_id,
                                "matched_template": None, "skipped": True}
                    seg_schema       = default_schema
                    used_schema_name = schema_name

                # ── ΒΗΜΑ 2: Registration Only → ΜΟΝΟ καταγραφή, ΠΟΤΕ extraction ──
                if registration_only:
                    reg_data = {}
                    if detected_supplier and detected_supplier != "unknown":
                        reg_data["_matched_supplier"] = detected_supplier
                    if used_schema_name:
                        reg_data["_matched_template"] = used_schema_name
                    # ΠΑΝΤΑ αποθήκευση schema_name αν βρέθηκε match
                    # (κατά registration, initial_schema=None, οπότε πρέπει να ενημερωθεί)
                    if used_schema_name:
                        try:
                            self.db.set_document_schema(doc_id, used_schema_name)
                            print(f"[extract_one] doc_id={doc_id} schema_name SET to '{used_schema_name}'", flush=True)
                        except Exception as e:
                            print(f"[extract_one] doc_id={doc_id} FAILED to set schema_name: {e}", flush=True)
                    self.db.update_document_status(
                        doc_id, status="registered",
                        result_json=json.dumps(reg_data) if reg_data else None)
                    # ── Record doc usage (registered, no extraction) ──
                    try:
                        self.db.record_usage_event(
                            self._current_user_id, 'doc_processed', 1)
                    except Exception as e:
                        logger.error("Failed to record doc usage (registered) "
                                     "for doc %d: %s", doc_id, e)
                    print(f"[extract_one] doc_id={doc_id} REGISTERED (no extraction). "
                          f"supplier={detected_supplier}, template={used_schema_name}", flush=True)
                    return {"success": True, "doc_id": doc_id,
                            "matched_template": used_schema_name, "registered": True}

                # ── License hard gate: block extraction if the doc allowance is
                #    exhausted (pairs with license_consumer below). Without this
                #    the doc cap was only counted, never enforced. ──
                if self.license_enforcer and not self.license_enforcer(docs=1):
                    print(f"[extract_one] doc_id={doc_id} BLOCKED: doc limit reached "
                          f"(license/trial allowance exhausted)", flush=True)
                    self.db.update_document_status(doc_id, status="Blocked")
                    return {"success": False, "doc_id": doc_id,
                            "error": "limit_reached", "limit_reached": True}

                # ── ΒΗΜΑ 3: Extraction (ΜΟΝΟ αν δεν είναι registration_only) ──
                print(f"[extract_one] doc_id={doc_id} EXTRACTING data...", flush=True)
                result = extractor.extract(image_paths=segment.pages, schema=seg_schema)
                if result.is_ok():
                    final_status = "pending"
                    extracted = result.extracted_data
                    # _confidence_pct υπολογίζεται αυτόματα από ai_extractor (self-assessment)
                    if detected_supplier and detected_supplier != "unknown":
                        extracted.setdefault("_matched_supplier", detected_supplier)
                        extracted.setdefault("_matched_template", used_schema_name)
                    conf_pct = extracted.get("_confidence_pct", 0)
                    print(f"[extract_one] doc_id={doc_id} EXTRACTED. confidence={conf_pct}%", flush=True)
                    # ── Tour Mode bbox extraction — SKIPPED in batch (B7): it was a
                    # SECOND AI call per doc (~doubled batch time). Not needed for
                    # bulk; compute on-demand when a doc is opened. ──
                    if not SKIP_BBOX_IN_BATCH:
                        try:
                            bboxes = extractor.extract_bboxes(
                                image_paths=segment.pages,
                                extracted_values=extracted
                            )
                            if bboxes:
                                extracted["_bboxes"] = bboxes
                                print(f"[extract_one] doc_id={doc_id} BBOXES extracted: "
                                      f"{len(bboxes)} fields", flush=True)
                        except Exception as e:
                            print(f"[extract_one] doc_id={doc_id} bbox extraction failed (soft): {e}",
                                  flush=True)
                    self.db.update_document_status(
                        doc_id, status=final_status,
                        result_json=json.dumps(extracted))
                    # Smart filename: vendor — invoice_no
                    try:
                        smart = _smart_filename(extracted, original_filename)
                        if smart:
                            self.db.set_document_filename(doc_id, smart)
                    except Exception:
                        pass
                    if used_schema_name != schema_name:
                        try:
                            self.db.set_document_schema(doc_id, used_schema_name)
                        except Exception:
                            pass
                    # ── Record usage: 1 doc + N pages for this extracted segment ──
                    try:
                        self.db.record_usage_event(
                            self._current_user_id, 'doc_processed', 1)
                        self.db.record_usage_event(
                            self._current_user_id, 'page_processed',
                            len(segment.pages))
                    except Exception as e:
                        logger.error("Failed to record usage for doc %d: %s",
                                     doc_id, e)
                    # ── B5: consume LICENSE usage (was missing in the batch path
                    # → billing leak). Mirrors the single extract-selected path. ──
                    if self.license_consumer:
                        self.license_consumer(docs=1, pages=len(segment.pages))
                    return {"success": True, "doc_id": doc_id,
                            "matched_template": used_schema_name}
                else:
                    print(f"[extract_one] doc_id={doc_id} extraction FAILED: {result.error_message}", flush=True)
                    self.db.update_document_status(doc_id, status="Failed")
                    return {"success": False, "doc_id": doc_id,
                            "error": result.error_message}
            except Exception as e:
                # Visibility for residual failures (B10): print the real cause so
                # the diagnostics log shows WHY a doc was marked Failed.
                import traceback
                print(f"[extract_one] doc_id={doc_id} FAILED (exception): {e}", flush=True)
                traceback.print_exc()
                try:
                    self.db.update_document_status(doc_id, status="Failed")
                except Exception as e2:
                    print(f"[extract_one] doc_id={doc_id} also failed to mark Failed: {e2}", flush=True)
                return {"success": False, "doc_id": doc_id, "error": str(e)}

        # ── Pre-register: καταχώρηση ΠΡΙΝ το parallel extraction ──────────
        # Αν skip_completed=True, ελέγχουμε αν υπάρχει ήδη Completed έγγραφο
        # με το ίδιο filename — αν ναι, το παραλείπουμε εντελώς.
        doc_id_map  = {}   # idx → doc_id  (για extraction)
        skipped_map = {}   # idx → doc_id  (ήδη Completed, skip)

        all_docs_by_lookup = {}
        # Ξεχωριστό index: original_filename → {page_number → doc}
        docs_by_ofn_page = {}

        if skip_completed:
            existing = self.db.list_documents(user_id=self._current_user_id)
            print(f"[skip_completed] === START === original_filename='{original_filename}', "
                  f"total docs in DB: {len(existing)}", flush=True)
            logger.info("[skip_completed] === START === original_filename='%s', "
                        "total docs in DB: %d", original_filename, len(existing))

            completed_count = 0
            for d in existing:
                d_status = d.get("status", "")
                d_ofn = d.get("original_filename") or ""
                d_fp = d.get("file_path") or ""

                if d_status in ("Completed", "pending_review", "approved"):
                    completed_count += 1
                    # Method 1: by current filename
                    all_docs_by_lookup[d["filename"]] = d
                    # Method 2: by exact file_path
                    if d_fp:
                        all_docs_by_lookup[d_fp] = d
                    # Method 3: by original_filename + page basename
                    if d_ofn and d_fp:
                        page_basename = Path(d_fp).name
                        stable_key = f"{d_ofn}::{page_basename}"
                        all_docs_by_lookup[stable_key] = d
                    # Method 4: by original_filename + page NUMBER (πιο ανεκτικό)
                    if d_ofn and d_fp:
                        try:
                            # Extract page number: "page_0001.png" → 1
                            page_num_str = Path(d_fp).stem.replace("page_", "")
                            page_num = int(page_num_str)
                            page_key = f"{d_ofn}::page{page_num}"
                            docs_by_ofn_page[page_key] = d
                        except (ValueError, IndexError):
                            pass

                    logger.info("[skip_completed]   Completed doc id=%d: status='%s', "
                                "ofn='%s', fp_basename='%s', filename='%s'",
                                d.get("id", 0), d_status, d_ofn,
                                Path(d_fp).name if d_fp else "NONE",
                                d.get("filename", ""))

            stable_keys = [k for k in all_docs_by_lookup if '::' in k]
            page_keys = list(docs_by_ofn_page.keys())
            print(f"[skip_completed] Lookup: {len(all_docs_by_lookup)} entries, "
                  f"{completed_count} completed docs, "
                  f"stable_keys={stable_keys[:10]}, page_keys={page_keys[:10]}", flush=True)
            logger.info("[skip_completed] Lookup: %d entries, %d completed docs, "
                        "stable_keys=%s, page_keys=%s",
                        len(all_docs_by_lookup), completed_count,
                        stable_keys[:10], page_keys[:10])

        for idx, segment in enumerate(segments):
            pages_str = ",".join(str(p) for p in segment.page_nums)
            stem      = Path(original_filename).stem if original_filename else "batch"
            filename  = f"{stem}_inv{idx+1:03d}_pages{pages_str}.pdf"

            # Check skip: 4 μέθοδοι αντιστοίχισης, κατά σειρά
            skip_match = None
            match_method = "none"
            if skip_completed:
                seg_fp = str(segment.pages[0])
                seg_page_basename = segment.pages[0].name
                stable_key = f"{original_filename}::{seg_page_basename}"
                page_num = segment.page_nums[0] if segment.page_nums else 0
                page_key = f"{original_filename}::page{page_num}"

                print(f"[skip_completed] Invoice {idx+1}: checking "
                      f"filename='{filename}', stable_key='{stable_key}', "
                      f"page_key='{page_key}', seg_fp='{seg_fp}'", flush=True)

                # Method 1: exact filename
                if filename in all_docs_by_lookup:
                    skip_match = all_docs_by_lookup[filename]
                    match_method = "filename"
                # Method 2: exact file_path
                elif seg_fp in all_docs_by_lookup:
                    skip_match = all_docs_by_lookup[seg_fp]
                    match_method = "file_path"
                # Method 3: original_filename + page basename
                elif stable_key in all_docs_by_lookup:
                    skip_match = all_docs_by_lookup[stable_key]
                    match_method = "stable_key"
                # Method 4: original_filename + page NUMBER
                elif page_key in docs_by_ofn_page:
                    skip_match = docs_by_ofn_page[page_key]
                    match_method = "page_number"
                else:
                    print(f"[skip_completed] Invoice {idx+1} NO MATCH!", flush=True)
                    logger.info("[skip_completed] Invoice %d NO MATCH: "
                                "filename='%s', stable_key='%s', "
                                "page_key='%s', seg_fp='%s'",
                                idx+1, filename, stable_key,
                                page_key, seg_fp)

            if skip_match:
                # Υπάρχει ήδη — παράλειψη
                existing_id = skip_match["id"]
                skipped_map[idx] = existing_id
                job.doc_ids.append(existing_id)
                job.skipped += 1
                print(f"[skip_completed] Invoice {idx+1} SKIPPED via {match_method}: "
                      f"doc_id={existing_id}, status={skip_match.get('status','?')}", flush=True)
                logger.info("[skip_completed] Invoice %d SKIPPED via %s: doc_id=%d, "
                            "status=%s, filename='%s'",
                            idx+1, match_method, existing_id,
                            skip_match.get("status", "?"),
                            skip_match.get("filename", "?"))
                job.errors.append(
                    f"Invoice {idx+1} ({filename}): παραλείφθηκε (ήδη {skip_match.get('status', 'Completed')}).")
            else:
                # Registration only: ΜΗΝ βάλεις default schema — θα ανατεθεί από auto_match
                # Normal batch: βάλε schema αν δεν είναι placeholder
                if registration_only:
                    initial_schema = None
                else:
                    initial_schema = schema_name if schema_name and schema_name != '__auto__' else None
                doc_id = self.db.insert_document(
                    filename=filename,
                    file_path=str(segment.pages[0]),
                    schema_name=initial_schema,
                    original_filename=original_filename or filename,
                    user_id=self._current_user_id)
                doc_id_map[idx] = doc_id

        # Ενημέρωση progress — skipped μετράνε ως ολοκληρωμένα στο progress
        total = job.total_invoices or 1
        job.progress_pct = round(prog_start + (job.processed + job.failed + job.skipped) / total * (100 - prog_start), 1)
        self._update_job(job)
        logger.info("[batch] Pre-extraction: total=%d, skipped=%d, to_extract=%d",
                    job.total_invoices, job.skipped, len(doc_id_map))

        # ── Multi-invoice extraction pre-pass (batch speed lever, FLAG-GATED) ──
        # Groups same-template SINGLE-PAGE invoices into one AI call (N per call).
        # OFF by default (perf_settings.json multi_invoice_n=1). CORRECTNESS RULE:
        # a chunk's result is accepted only if it maps 1:1 — count==N, image_index
        # is a permutation of 1..N, and invoice_numbers are all distinct; otherwise
        # the WHOLE chunk falls back to the proven single-doc path. Never assigns
        # extracted data to an invoice by guess.
        def _persist_extracted(doc_id, extracted, used_schema_name, detected_supplier, n_pages):
            if detected_supplier and detected_supplier != "unknown":
                extracted.setdefault("_matched_supplier", detected_supplier)
                extracted.setdefault("_matched_template", used_schema_name)
            self.db.update_document_status(doc_id, status="pending",
                                           result_json=json.dumps(extracted))
            try:
                smart = _smart_filename(extracted, original_filename)
                if smart:
                    self.db.set_document_filename(doc_id, smart)
            except Exception:
                pass
            if used_schema_name != schema_name:
                try:
                    self.db.set_document_schema(doc_id, used_schema_name)
                except Exception:
                    pass
            try:
                self.db.record_usage_event(self._current_user_id, 'doc_processed', 1)
                self.db.record_usage_event(self._current_user_id, 'page_processed', n_pages)
            except Exception as e:
                logger.error("Failed to record usage for doc %d: %s", doc_id, e)
            if self.license_consumer:
                self.license_consumer(docs=1, pages=n_pages)

        def _process_multi_chunk(chunk, used_schema_name, schema_obj):
            # chunk: list of (idx, doc_id, segment, detected_supplier)
            images = [it[2].pages[0] for it in chunk]
            extractor = AIExtractor(api_key=api_key)
            ok, invoices, err = extractor.extract_multi(images, schema_obj)
            n = len(chunk)
            valid = ok and isinstance(invoices, list) and len(invoices) == n
            if valid:
                imgidx = [int(inv.get("image_index", -1)) for inv in invoices]
                nums = [str(inv.get("invoice_number", "")).strip() for inv in invoices]
                if sorted(imgidx) != list(range(1, n + 1)):
                    valid = False                       # missing/duplicate image_index
                elif any(not x for x in nums) or len(set(nums)) != n:
                    valid = False                       # blank or duplicate invoice_number
            if not valid:
                print(f"[multi] chunk ({used_schema_name}, n={n}) → single fallback "
                      f"(ok={ok}, err={err})", flush=True)
                return {"fallback": [it[0] for it in chunk]}
            by_imgidx = {int(inv.get("image_index")): inv for inv in invoices}
            done = []
            for pos, (idx, doc_id, segment, detected) in enumerate(chunk, start=1):
                inv = dict(by_imgidx[pos])
                inv.pop("image_index", None)
                _persist_extracted(doc_id, inv, used_schema_name, detected, len(segment.pages))
                done.append((idx, doc_id))
            return {"done": done}

        def run_multi_prepass():
            multi_done = set()
            try:
                from perf_config import get_multi_invoice_n
                multi_n = get_multi_invoice_n()
            except Exception:
                multi_n = 1
            if multi_n <= 1 or registration_only:
                return multi_done
            groups = {}
            for idx, doc_id in doc_id_map.items():
                segment = segments[idx]
                if len(segment.pages) != 1:
                    continue                            # multi-page → single path
                if auto_match:
                    detected = (segment.supplier or "").strip()
                    if not detected or detected.upper() == "UNKNOWN":
                        continue
                    matched_name, detected, is_real = self._match_supplier(
                        detected, templates_cache, schema_name)
                    if not is_real:
                        continue                        # no_template → single path
                    tmpl = next((t for t in templates_cache if t.get("name") == matched_name), None)
                    if not tmpl:
                        continue
                    schema_obj = self.schema_bld.build_from_list(tmpl["fields"])
                    schema_obj.pop("additionalProperties", None)
                    used = matched_name
                else:
                    if not default_schema or not default_template:
                        continue
                    schema_obj = default_schema
                    used = schema_name
                    detected = None
                groups.setdefault(used, {"schema": schema_obj, "items": []})
                groups[used]["items"].append((idx, doc_id, segment, detected))
            chunks = []
            for used, g in groups.items():
                items = g["items"]
                for c in range(0, len(items), multi_n):
                    chunk = items[c:c + multi_n]
                    if len(chunk) >= 2:                 # singletons → single path (no benefit)
                        chunks.append((chunk, used, g["schema"]))
            if not chunks:
                return multi_done
            logger.info("[multi] N=%d: %d chunk(s) across %d template group(s)",
                        multi_n, len(chunks), len(groups))
            with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
                futs = {pool.submit(_process_multi_chunk, ch, used, sch): True
                        for (ch, used, sch) in chunks}
                for fut in as_completed(futs):
                    r = fut.result()
                    for idx, doc_id in r.get("done", []):
                        multi_done.add(idx)
                        job.processed += 1
                        job.doc_ids.append(doc_id)
                    total = job.total_invoices or 1
                    job.progress_pct = round(prog_start + (job.processed + job.failed + job.skipped + job.no_template) / total * (100 - prog_start), 1)
                    self._update_job(job)
            return multi_done

        # Αν δεν υπάρχουν segments για extraction, τελειώνουμε
        if not doc_id_map:
            return

        multi_done = run_multi_prepass()   # handles same-template single-page docs (if enabled)

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {executor.submit(extract_one, idx, segments[idx], doc_id_map[idx]): idx
                       for idx in doc_id_map if idx not in multi_done}
            for future in as_completed(futures):
                res = future.result()
                if res["success"]:
                    if res.get("skipped"):
                        # no_template — δεν βρέθηκε ετικέτα, δεν μετράει ως επιτυχία
                        job.no_template += 1
                    else:
                        job.processed += 1
                    job.doc_ids.append(res["doc_id"])
                else:
                    job.failed += 1
                    job.errors.append(
                        f"Invoice {futures[future]+1}: {res.get('error','unknown')}")
                    if "doc_id" in res:
                        job.doc_ids.append(res["doc_id"])
                total = job.total_invoices or 1
                job.progress_pct = round(prog_start + (job.processed + job.failed + job.skipped + job.no_template) / total * (100 - prog_start), 1)
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
