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

GEMINI_MODEL    = "gemini-2.5-flash"   # Latest stable model
MAX_RETRIES     = 3
RETRY_DELAY     = 2.0
REQUEST_TIMEOUT = 60

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

    def __init__(self, api_key: str, model: str = GEMINI_MODEL,
                 max_retries: int = MAX_RETRIES):
        if not api_key or not api_key.strip():
            raise ValueError("Το API key δεν μπορεί να είναι κενό.")
        self.api_key     = api_key.strip()
        self.model       = model
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
                extra_instructions: str = "") -> ExtractionResult:
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

        prompt = self._build_prompt(schema, extra_instructions)

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

                if any(k in err_lower for k in
                       ["api_key", "invalid key", "permission", "401", "403"]):
                    return self._error(result, f"Άκυρο API Key: {last_error}",
                                       ExtractionStatus.INVALID_KEY, start_time)
                if "quota" in err_lower or "429" in err_lower:
                    return self._error(result, f"Quota υπερβάθηκε: {last_error}",
                                       ExtractionStatus.QUOTA_EXCEEDED, start_time)

                if attempt < self.max_retries:
                    time.sleep(RETRY_DELAY * attempt)

        status = (ExtractionStatus.TIMEOUT
                  if "timeout" in last_error.lower()
                  else ExtractionStatus.NETWORK_ERROR)
        return self._error(result,
            f"Αποτυχία μετά από {self.max_retries} προσπάθειες: {last_error}",
            status, start_time)

    def _call_api(self, image_paths: List[Path],
                  prompt: str, schema: Dict) -> ExtractionResult:
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
        if "properties" in clean_schema:
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

    def _build_prompt(self, schema: Dict, extra: str) -> str:
        schema_str = json.dumps(schema, ensure_ascii=False, indent=2)
        prompt = (
            f"Extract the data from the document according to the JSON Schema below:\n\n"
            f"```json\n{schema_str}\n```\n\n"
            f"Rules:\n"
            f"- Return ONLY the JSON object, no markdown or explanations.\n"
            f"- If a field is not present in the document, use null.\n"
            f"- Monetary amounts must be numbers (float), not strings.\n"
            f"- Dates must be in YYYY-MM-DD format.\n"
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
