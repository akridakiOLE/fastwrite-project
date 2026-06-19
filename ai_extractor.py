"""
Module 5: AI Extractor — Google Gemini API (new google.genai SDK)
Μετάβαση από το deprecated google.generativeai στο google.genai.
"""

import json
import base64
import copy
import time
from pathlib import Path
from typing import Dict, Any, List
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


# ── Enums & Σταθερές ─────────────────────────────────────────────────────────

class ExtractionStatus(str, Enum):
    SUCCESS        = "success"
    FAILED         = "failed"
    INVALID_KEY    = "invalid_key"
    NETWORK_ERROR  = "network_error"
    TIMEOUT        = "timeout"
    QUOTA_EXCEEDED = "quota_exceeded"

GEMINI_MODEL    = "gemini-2.5-flash"   # Fallback default if perf_config unavailable
MAX_RETRIES     = 3
RETRY_DELAY     = 2.0
REQUEST_TIMEOUT = 60


def _resolve_model() -> str:
    """Runtime-configurable model (perf_config), with a static fallback.

    Lets the app switch flash <-> flash-lite via perf_settings.json with no
    rebuild. Explicit model= passed to AIExtractor always wins (e.g. diag tools).
    """
    try:
        from perf_config import get_model
        return get_model(GEMINI_MODEL)
    except Exception:
        return GEMINI_MODEL

SYSTEM_PROMPT = """You are an expert data extraction specialist.
Analyze the document image and extract ONLY the requested fields.
Return EXCLUSIVELY valid JSON according to the given schema.
If a field is not found in the document, return null.
Do not add explanations or comments outside JSON."""


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class ExtractionResult:
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
    Εξαγωγή δεδομένων μέσω Google Gemini API (νέο google.genai SDK).
    """

    def __init__(self, api_key: str, model: str = None,
                 max_retries: int = MAX_RETRIES):
        if not api_key or not api_key.strip():
            raise ValueError("Το API key δεν μπορεί να είναι κενό.")
        self.api_key     = api_key.strip()
        # Explicit model wins; otherwise resolve from runtime config (perf_config).
        self.model       = (model or "").strip() or _resolve_model()
        self.max_retries = max_retries
        self._client     = None

    def _get_client(self):
        """Lazy initialization του Gemini client με νέο SDK."""
        if self._client is None:
            try:
                from google import genai
                self._client = genai.Client(api_key=self.api_key)
            except ImportError:
                raise ImportError(
                    "Η βιβλιοθήκη google-genai δεν είναι εγκατεστημένη. "
                    "Εκτέλεσε: pip install google-genai"
                )
        return self._client

    def extract(self, image_paths: List[Path],
                schema: Dict[str, Any],
                extra_instructions: str = "",
                skip_confidence: bool = False) -> ExtractionResult:
        start_time = time.time()
        result     = ExtractionResult()

        if not image_paths:
            return self._error(result, "Δεν δόθηκαν εικόνες.",
                               ExtractionStatus.FAILED, start_time)

        missing = [p for p in image_paths if not Path(p).exists()]
        if missing:
            return self._error(result,
                f"Αρχεία δεν βρέθηκαν: {[str(p) for p in missing]}",
                ExtractionStatus.FAILED, start_time)

        if not schema or schema.get("type") != "object":
            return self._error(result, "Άκυρο JSON Schema.",
                               ExtractionStatus.FAILED, start_time)

        prompt = self._build_prompt(schema, extra_instructions,
                                    skip_confidence=skip_confidence)

        last_error = ""
        last_rate_limited = False
        for attempt in range(1, self.max_retries + 1):
            try:
                api_result = self._call_api(image_paths, prompt, schema,
                                            skip_confidence=skip_confidence)
                api_result.pages_processed = len(image_paths)
                api_result.processing_time = round(time.time() - start_time, 3)
                api_result.extracted_at    = datetime.utcnow().isoformat()
                return api_result

            except Exception as e:
                last_error = str(e)
                err_lower  = last_error.lower()

                # Permanent auth errors — do not retry
                if any(k in err_lower for k in
                       ["api_key", "invalid key", "permission", "401", "403"]):
                    return self._error(result, f"Άκυρο API Key: {last_error}",
                                       ExtractionStatus.INVALID_KEY, start_time)

                # B8: 429 / quota / rate-limit are usually TRANSIENT (per-minute
                # RPM, especially under parallel batch) → retry with backoff
                # instead of failing immediately; give up only after max_retries.
                last_rate_limited = ("quota" in err_lower or "429" in err_lower
                                     or "resource_exhausted" in err_lower
                                     or "rate limit" in err_lower)

                if attempt < self.max_retries:
                    backoff = RETRY_DELAY * attempt
                    if last_rate_limited:
                        # wait longer so the per-minute RPM window can free up
                        backoff = max(backoff, RETRY_DELAY * 3)
                    time.sleep(backoff)

        # Retries exhausted
        if last_rate_limited:
            return self._error(result,
                f"Quota υπερβάθηκε μετά από {self.max_retries} προσπάθειες: {last_error}",
                ExtractionStatus.QUOTA_EXCEEDED, start_time)
        status = (ExtractionStatus.TIMEOUT
                  if "timeout" in last_error.lower()
                  else ExtractionStatus.NETWORK_ERROR)
        return self._error(result,
            f"Αποτυχία μετά από {self.max_retries} προσπάθειες: {last_error}",
            status, start_time)

    def _call_api(self, image_paths: List[Path],
                  prompt: str, schema: Dict,
                  skip_confidence: bool = False) -> ExtractionResult:
        """Κλήση με νέο google.genai SDK."""
        from google import genai
        from google.genai import types

        client = self._get_client()

        # Φόρτωση εικόνων
        content_parts = []
        for img_path in image_paths:
            img_bytes = Path(img_path).read_bytes()
            suffix    = Path(img_path).suffix.lower().lstrip(".")
            mime_type = f"image/{'jpeg' if suffix == 'jpg' else suffix}"
            content_parts.append(
                types.Part.from_bytes(data=img_bytes, mime_type=mime_type)
            )
        content_parts.append(prompt)

        # Clean schema — αφαίρεση additionalProperties
        clean_schema = copy.deepcopy(schema)
        def _ds(o):
            if isinstance(o, dict):
                o.pop("additionalProperties", None)
                o.pop("$schema", None)
                for v in list(o.values()): _ds(v)
            elif isinstance(o, list):
                for i in o: _ds(i)
        _ds(clean_schema)

        # Προσθήκη _confidence_pct στο schema — ζητάμε self-assessment
        # Εξαίρεση: lightweight detection calls (π.χ. supplier detection)
        # δεν χρειάζονται confidence και μπερδεύουν το model.
        if not skip_confidence and "properties" in clean_schema:
            clean_schema["properties"]["_confidence_pct"] = {
                "type": "number",
                "description": "Overall confidence score 0-100 for the entire extraction. "
                               "100 = all fields clearly readable, 0 = unreadable document. "
                               "Consider: text clarity, completeness, ambiguous values."
            }

        # Generation config
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=clean_schema,
            temperature=0.0,
            max_output_tokens=8192,
        )

        response = client.models.generate_content(
            model=self.model,
            contents=content_parts,
            config=config,
        )

        raw_text = response.text.strip() if response.text else ""

        try:
            extracted = json.loads(raw_text)
        except json.JSONDecodeError as e:
            raise ValueError(
                f"Η απάντηση του AI δεν είναι έγκυρο JSON: {e}\n"
                f"Raw: {raw_text[:500]}"
            )

        result                = ExtractionResult()
        result.status         = ExtractionStatus.SUCCESS
        result.extracted_data = extracted
        result.raw_response   = raw_text
        result.model_used     = self.model

        try:
            result.tokens_used = response.usage_metadata.total_token_count
        except Exception:
            result.tokens_used = 0

        return result

    def _build_prompt(self, schema: Dict, extra: str,
                      skip_confidence: bool = False) -> str:
        schema_str = json.dumps(schema, ensure_ascii=False, indent=2)
        prompt = (
            f"Extract the data from the document according to the JSON Schema below:\n\n"
            f"```json\n{schema_str}\n```\n\n"
            f"Rules:\n"
            f"- Return ONLY the JSON object, no markdown or explanations.\n"
            f"- If a field is not present in the document, use null.\n"
            f"- Monetary amounts must be numbers (float), not strings.\n"
            f"- Dates must be in YYYY-MM-DD format.\n"
        )
        if not skip_confidence:
            prompt += (
                f"- For _confidence_pct: rate your overall confidence in the extraction from 0 to 100.\n"
                f"  Score HIGH (90-100) if all text is clear and unambiguous.\n"
                f"  Score MEDIUM (60-89) if some fields are unclear or estimated.\n"
                f"  Score LOW (0-59) if the document is poor quality or many fields are missing.\n"
            )
        if extra:
            prompt += f"\nAdditional instructions: {extra}\n"
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

    # ── Tour Mode: Bounding box extraction (Sprint 1.1) ──────────────────────
    def extract_bboxes(self, image_paths: List[Path],
                       extracted_values: Dict[str, Any]) -> Dict[str, Any]:
        """
        Tour Mode: Βρίσκει bounding boxes ανά πεδίο μέσα στο PNG.
        Καλείται ΜΕΤΑ από το κανονικό extract() — δέχεται τα ήδη εξαχθέντα values
        και ζητάει από το Gemini τη θέση του καθενός μέσα στην εικόνα.

        Επιστρέφει:
            {
              "field_name": {"x": 0.12, "y": 0.34, "w": 0.20, "h": 0.04, "page": 1},
              ...
            }
        Όλες οι συντεταγμένες είναι normalized 0-1 (% του πλάτους/ύψους του PNG).
        Αν αποτύχει ή κάποιο πεδίο δεν εντοπιστεί, επιστρέφει κενό dict ή παραλείπει πεδίο.
        """
        if not image_paths or not extracted_values:
            return {}

        # Φιλτράρισμα: μόνο scalar values (όχι arrays όπως line_items)
        scalars = {k: v for k, v in extracted_values.items()
                   if not isinstance(v, (list, dict)) and v not in (None, "", "null")
                   and not k.startswith("_")}
        if not scalars:
            return {}

        # Schema: λίστα από bbox objects
        bbox_schema = {
            "type": "object",
            "properties": {
                "boxes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "field": {"type": "string", "description": "Field name"},
                            "page":  {"type": "integer", "description": "1-indexed page"},
                            "ymin":  {"type": "number", "description": "Top edge (0-1000 normalized)"},
                            "xmin":  {"type": "number", "description": "Left edge (0-1000 normalized)"},
                            "ymax":  {"type": "number", "description": "Bottom edge (0-1000 normalized)"},
                            "xmax":  {"type": "number", "description": "Right edge (0-1000 normalized)"},
                        },
                        "required": ["field", "page", "ymin", "xmin", "ymax", "xmax"]
                    }
                }
            },
            "required": ["boxes"]
        }

        # Build prompt
        fields_list = "\n".join(f'- {k}: "{v}"' for k, v in scalars.items())
        prompt = (
            "For EACH of the following fields, locate it inside the document image(s) "
            "and return its bounding box.\n\n"
            f"Fields with their already-extracted values:\n{fields_list}\n\n"
            "Rules:\n"
            "- Return bbox as [ymin, xmin, ymax, xmax] normalized to 0-1000 scale.\n"
            "- ymin/ymax are the top/bottom Y coordinates (0=top of page, 1000=bottom).\n"
            "- xmin/xmax are the left/right X coordinates (0=left, 1000=right).\n"
            "- page is 1-indexed. If only 1 image given, use page=1.\n"
            "- Locate the VALUE of each field (not the label).\n"
            "- If a field cannot be located, skip it (do NOT include it).\n"
            "- Return ONLY the JSON object."
        )

        try:
            from google import genai
            from google.genai import types

            client = self._get_client()

            content_parts = []
            for img_path in image_paths:
                img_bytes = Path(img_path).read_bytes()
                suffix    = Path(img_path).suffix.lower().lstrip(".")
                mime_type = f"image/{'jpeg' if suffix == 'jpg' else suffix}"
                content_parts.append(
                    types.Part.from_bytes(data=img_bytes, mime_type=mime_type)
                )
            content_parts.append(prompt)

            config = types.GenerateContentConfig(
                system_instruction="You are a spatial analysis specialist. Locate text in document images.",
                response_mime_type="application/json",
                response_schema=bbox_schema,
                temperature=0.0,
                max_output_tokens=2048,
            )

            response = client.models.generate_content(
                model=self.model,
                contents=content_parts,
                config=config,
            )

            raw = response.text.strip() if response.text else ""
            data = json.loads(raw)
            boxes = data.get("boxes", [])

            # Μετατροπή σε normalized 0-1 (από 0-1000 του Gemini)
            result = {}
            for b in boxes:
                fname = b.get("field")
                if not fname or fname not in scalars:
                    continue
                ymin = b.get("ymin", 0) / 1000.0
                xmin = b.get("xmin", 0) / 1000.0
                ymax = b.get("ymax", 0) / 1000.0
                xmax = b.get("xmax", 0) / 1000.0
                # Sanity check
                if ymax <= ymin or xmax <= xmin:
                    continue
                result[fname] = {
                    "x":    round(xmin, 4),
                    "y":    round(ymin, 4),
                    "w":    round(xmax - xmin, 4),
                    "h":    round(ymax - ymin, 4),
                    "page": int(b.get("page", 1))
                }
            return result

        except Exception as e:
            # Soft fail: log και επιστροφή κενού. Δεν χαλάει το data extraction.
            import logging
            logging.getLogger(__name__).warning(
                "extract_bboxes failed (soft): %s", e
            )
            return {}
