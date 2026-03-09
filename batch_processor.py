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

SEGMENTATION_PROMPT = """Κοίτα τις παρακάτω σελίδες PDF και πες μου πού αρχίζει κάθε νέο τιμολόγιο.
Επίστρεψε ΜΟΝΟ έγκυρο JSON array, ένα αντικείμενο ανά σελίδα.
Παράδειγμα: [{"page":1,"new_doc":true},{"page":2,"new_doc":false},{"page":3,"new_doc":true}]
Κανόνες:
- Η πρώτη σελίδα είναι ΠΑΝΤΑ new_doc:true
- new_doc:true = αρχή νέου τιμολογίου
- new_doc:false = συνέχεια του προηγούμενου
Επίστρεψε ΜΟΝΟ το JSON array, χωρίς markdown ή επεξηγήσεις."""


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

    def submit(self, pdf_path, schema_name, original_filename=""):
        job_id = str(uuid.uuid4())
        job    = BatchJobStatus(job_id=job_id, status="pending",
                                started_at=datetime.utcnow().isoformat())
        with self._jobs_lock:
            self._jobs[job_id] = job
        t = threading.Thread(target=self._run_job,
            args=(job_id, pdf_path, schema_name, original_filename), daemon=True)
        t.start()
        return job_id

    def get_status(self, job_id):
        with self._jobs_lock:
            job = self._jobs.get(job_id)
        return job.to_dict() if job else None

    def list_jobs(self):
        with self._jobs_lock:
            return [j.to_dict() for j in self._jobs.values()]

    def _run_job(self, job_id, pdf_path, schema_name, original_filename):
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

            self._extract_parallel(segments, schema_name, original_filename, job)

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

    def _extract_parallel(self, segments, schema_name, original_filename, job):
        from ai_extractor import AIExtractor
        api_key  = self.key_mgr.get_key("gemini")
        template = self.db.get_template(schema_name)
        if not template:
            self._fail_job(job, f"Template '{schema_name}' δεν βρέθηκε.")
            return
        schema = self.schema_bld.build_from_list(template["fields"])
        schema.pop("additionalProperties", None)

        def extract_one(idx, segment, doc_id):
            try:
                extractor = AIExtractor(api_key=api_key)
                result    = extractor.extract(image_paths=segment.pages, schema=schema)
                if result.is_ok():
                    self.db.update_document_status(doc_id, status="Completed",
                        result_json=json.dumps(result.extracted_data))
                    return {"success": True, "doc_id": doc_id}
                else:
                    self.db.update_document_status(doc_id, status="Failed")
                    return {"success": False, "doc_id": doc_id, "error": result.error_message}
            except Exception as e:
                self.db.update_document_status(doc_id, status="Failed")
                return {"success": False, "doc_id": doc_id, "error": str(e)}

        # Pre-register όλα τα documents πριν το parallel extraction
        doc_id_map = {}
        for idx, segment in enumerate(segments):
            pages_str = ",".join(str(p) for p in segment.page_nums)
            stem      = Path(original_filename).stem if original_filename else "batch"
            filename  = f"{stem}_inv{idx+1:03d}_pages{pages_str}.pdf"
            doc_id    = self.db.insert_document(filename=filename,
                            file_path=str(segment.pages[0]), schema_name=schema_name)
            doc_id_map[idx] = doc_id

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {executor.submit(extract_one, idx, seg, doc_id_map[idx]): idx
                       for idx, seg in enumerate(segments)}
            for future in as_completed(futures):
                res = future.result()
                if res["success"]:
                    job.processed += 1
                    job.doc_ids.append(res["doc_id"])
                else:
                    job.failed += 1
                    job.errors.append(f"Invoice {futures[future]+1}: {res.get('error','unknown')}")
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
