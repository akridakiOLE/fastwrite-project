"""
Module 5: Διασύνδεση με AI & Εξαγωγή Δεδομένων (The Brain)
Συνδυάζει:
  - Εικόνα από Module 3 (FileProcessor)
  - JSON Schema από Module 4 (SchemaBuilder)
  - API Key από Module 2 (KeyManager)
και κάνει κλήση στο Google Gemini 2.5 Flash με Structured Outputs.
Επιστρέφει δομημένο JSON με τα εξαγόμενα δεδομένα.
"""

import json
import base64
import time
from pathlib import Path
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


# ── Enums & Σταθερές ─────────────────────────────────────────────────────────

class ExtractionStatus(str, Enum):
    SUCCESS       = "success"
    FAILED        = "failed"
    INVALID_KEY   = "invalid_key"
    NETWORK_ERROR = "network_error"
    TIMEOUT       = "timeout"
    QUOTA_EXCEEDED = "quota_exceeded"

GEMINI_MODEL   = "gemini-2.5-flash"
MAX_RETRIES    = 3
RETRY_DELAY    = 2.0   # seconds
REQUEST_TIMEOUT = 60   # seconds

SYSTEM_PROMPT = """Είσαι ειδικός στην εξαγωγή δεδομένων από έγγραφα.
Αναλύεις την εικόνα εγγράφου και εξάγεις ΜΟΝΟ τα ζητούμενα πεδία.
Επιστρέφεις ΑΠΟΚΛΕΙΣΤΙΚΑ έγκυρο JSON σύμφωνα με το δοθέν schema.
Αν ένα πεδίο δεν βρίσκεται στο έγγραφο, επιστρέφεις null.
Δεν προσθέτεις επεξηγήσεις ή σχόλια εκτός JSON."""


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class ExtractionResult:
    """Αποτέλεσμα εξαγωγής δεδομένων από ένα έγγραφο."""
    status          : ExtractionStatus = ExtractionStatus.FAILED
    extracted_data  : Dict[str, Any]   = field(default_factory=dict)
    raw_response    : str              = ""
    error_message   : str              = ""
    model_used      : str              = ""
    pages_processed : int              = 0
    processing_time : float            = 0.0
    extracted_at    : str              = ""
    tokens_used     : int              = 0

    def is_ok(self) -> bool:
        return self.status == ExtractionStatus.SUCCESS

    def to_dict(self) -> Dict:
        return {
            "status":          self.status.value,
            "extracted_data":  self.extracted_data,
            "error_message":   self.error_message,
            "model_used":      self.model_used,
            "pages_processed": self.pages_processed,
            "processing_time": self.processing_time,
            "extracted_at":    self.extracted_at,
            "tokens_used":     self.tokens_used,
        }


# ── Κύρια Κλάση ───────────────────────────────────────────────────────────────

class AIExtractor:
    """
    Πυρήνας εξαγωγής δεδομένων μέσω Google Gemini API.

    Χρήση:
        extractor = AIExtractor(api_key="YOUR_KEY")
        result = extractor.extract(
            image_paths=[Path("/tmp/page_0001.png")],
            schema={"type": "object", "properties": {...}, ...}
        )
        print(result.extracted_data)
    """

    def __init__(self, api_key: str, model: str = GEMINI_MODEL,
                 max_retries: int = MAX_RETRIES):
        if not api_key or not api_key.strip():
            raise ValueError("Το API key δεν μπορεί να είναι κενό.")

        self.api_key     = api_key.strip()
        self.model       = model
        self.max_retries = max_retries
        self._client     = None   # lazy init

    # ── Client Init ──────────────────────────────────────────────────────────

    def _get_client(self):
        """Lazy initialization του Gemini client."""
        if self._client is None:
            try:
                import google.generativeai as genai
                genai.configure(api_key=self.api_key)
                self._client = genai.GenerativeModel(
                    model_name=self.model,
                    system_instruction=SYSTEM_PROMPT,
                )
            except ImportError:
                raise ImportError(
                    "Η βιβλιοθήκη google-generativeai δεν είναι εγκατεστημένη. "
                    "Εκτέλεσε: pip install google-generativeai"
                )
        return self._client

    # ── Public API ───────────────────────────────────────────────────────────

    def extract(self, image_paths: List[Path],
                schema: Dict[str, Any],
                extra_instructions: str = "") -> ExtractionResult:
        """
        Κύρια μέθοδος εξαγωγής.

        :param image_paths:        Λίστα Path από Module 3 (μία ή περισσότερες σελίδες)
        :param schema:             JSON Schema dict από Module 4
        :param extra_instructions: Προαιρετικές οδηγίες χρήστη
        :returns:                  ExtractionResult με τα εξαγόμενα δεδομένα
        """
        start_time = time.time()
        result     = ExtractionResult()

        # ── Validation ───────────────────────────────────────────────────────
        if not image_paths:
            return self._error(result, "Δεν δόθηκαν εικόνες για επεξεργασία.",
                               ExtractionStatus.FAILED, start_time)

        missing = [p for p in image_paths if not Path(p).exists()]
        if missing:
            return self._error(result,
                f"Αρχεία δεν βρέθηκαν: {[str(p) for p in missing]}",
                ExtractionStatus.FAILED, start_time)

        if not schema or schema.get("type") != "object":
            return self._error(result, "Άκυρο JSON Schema.",
                               ExtractionStatus.FAILED, start_time)

        # ── Prompt Construction ───────────────────────────────────────────────
        prompt = self._build_prompt(schema, extra_instructions)

        # ── Retry Loop ───────────────────────────────────────────────────────
        last_error = ""
        for attempt in range(1, self.max_retries + 1):
            try:
                api_result = self._call_api(image_paths, prompt, schema)
                api_result.pages_processed = len(image_paths)
                api_result.processing_time = round(time.time() - start_time, 3)
                api_result.extracted_at    = datetime.utcnow().isoformat()
                return api_result

            except Exception as e:
                last_error = str(e)
                err_lower  = last_error.lower()

                # Μη-επαναλαμβανόμενα σφάλματα → άμεση επιστροφή
                if any(k in err_lower for k in
                       ["api_key", "invalid key", "permission", "401", "403"]):
                    return self._error(result, f"Άκυρο API Key: {last_error}",
                                       ExtractionStatus.INVALID_KEY, start_time)
                if "quota" in err_lower or "429" in err_lower:
                    return self._error(result, f"Quota υπερβάθηκε: {last_error}",
                                       ExtractionStatus.QUOTA_EXCEEDED, start_time)

                # Επαναλαμβανόμενα σφάλματα (network, timeout)
                if attempt < self.max_retries:
                    time.sleep(RETRY_DELAY * attempt)

        # Εξαντλήθηκαν οι προσπάθειες
        status = (ExtractionStatus.TIMEOUT
                  if "timeout" in last_error.lower()
                  else ExtractionStatus.NETWORK_ERROR)
        return self._error(result,
            f"Αποτυχία μετά από {self.max_retries} προσπάθειες: {last_error}",
            status, start_time)

    # ── API Call ─────────────────────────────────────────────────────────────

    def _call_api(self, image_paths: List[Path],
                  prompt: str, schema: Dict) -> ExtractionResult:
        """Κλήση στο Gemini API με Structured Outputs."""
        import google.generativeai as genai
        from google.generativeai.types import GenerationConfig

        client = self._get_client()

        # Φόρτωση εικόνων
        content_parts = []
        for img_path in image_paths:
            img_bytes = Path(img_path).read_bytes()
            suffix    = Path(img_path).suffix.lower().lstrip(".")
            mime_type = f"image/{'jpeg' if suffix == 'jpg' else suffix}"
            content_parts.append({
                "inline_data": {
                    "mime_type": mime_type,
                    "data":      base64.b64encode(img_bytes).decode()
                }
            })

        content_parts.append({"text": prompt})

        # Generation config με Structured Output
        gen_config = GenerationConfig(
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.0,    # Μηδενική δημιουργικότητα για ακρίβεια
            max_output_tokens=8192,
        )

        response = client.generate_content(
            contents=content_parts,
            generation_config=gen_config,
        )

        raw_text = response.text.strip()

        # Parse JSON απάντησης
        try:
            extracted = json.loads(raw_text)
        except json.JSONDecodeError as e:
            raise ValueError(f"Η απάντηση του AI δεν είναι έγκυρο JSON: {e}\n"
                             f"Raw: {raw_text[:500]}")

        result              = ExtractionResult()
        result.status       = ExtractionStatus.SUCCESS
        result.extracted_data = extracted
        result.raw_response = raw_text
        result.model_used   = self.model

        # Token usage (αν διαθέσιμο)
        try:
            result.tokens_used = response.usage_metadata.total_token_count
        except Exception:
            result.tokens_used = 0

        return result

    # ── Utilities ────────────────────────────────────────────────────────────

    def _build_prompt(self, schema: Dict, extra: str) -> str:
        """Κατασκευή prompt με το schema και προαιρετικές οδηγίες."""
        schema_str = json.dumps(schema, ensure_ascii=False, indent=2)
        prompt = (
            f"Εξάγαγε τα δεδομένα από το έγγραφο σύμφωνα με το παρακάτω JSON Schema:\n\n"
            f"```json\n{schema_str}\n```\n\n"
            f"Κανόνες:\n"
            f"- Επίστρεψε ΜΟΝΟ το JSON αντικείμενο, χωρίς markdown ή επεξηγήσεις.\n"
            f"- Αν ένα πεδίο δεν υπάρχει στο έγγραφο, χρησιμοποίησε null.\n"
            f"- Τα χρηματικά ποσά να είναι αριθμοί (float), όχι strings.\n"
            f"- Οι ημερομηνίες να είναι σε μορφή YYYY-MM-DD.\n"
        )
        if extra:
            prompt += f"\nΕπιπλέον οδηγίες: {extra}\n"
        return prompt

    @staticmethod
    def _error(result: ExtractionResult, message: str,
               status: ExtractionStatus,
               start_time: float) -> ExtractionResult:
        result.status          = status
        result.error_message   = message
        result.processing_time = round(time.time() - start_time, 3)
        result.extracted_at    = datetime.utcnow().isoformat()
        return result
