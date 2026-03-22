"""
Unit Tests - Module 5: AIExtractor
ΑΥΣΤΗΡΟ MOCKING — Μηδέν πραγματικές κλήσεις στο Gemini API.
Χρησιμοποιεί unittest.mock για προσομοίωση:
  - Επιτυχημένης εξαγωγής
  - Άκυρου API Key
  - Network failure / timeout
  - Quota exceeded
  - Κατεστραμμένης JSON απάντησης
"""

import sys
import json
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock, PropertyMock

sys.path.insert(0, "/app/projects")

from ai_extractor import (
    AIExtractor, ExtractionResult, ExtractionStatus,
    GEMINI_MODEL, SYSTEM_PROMPT
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_dummy_image(tmp_dir: str) -> Path:
    """Δημιουργεί ένα μικρό dummy PNG για χρήση στα tests."""
    from PIL import Image
    img_path = Path(tmp_dir) / "test_page.png"
    img = Image.new("RGB", (100, 100), color=(255, 255, 255))
    img.save(str(img_path), format="PNG")
    return img_path


def make_invoice_schema() -> dict:
    """Επιστρέφει ένα βασικό τιμολόγιο JSON Schema."""
    return {
        "type": "object",
        "properties": {
            "invoice_number": {"type": "string"},
            "vendor_afm":     {"type": "string"},
            "net_amount":     {"type": "number"},
            "vat_amount":     {"type": "number"},
            "total_amount":   {"type": "number"},
            "invoice_date":   {"type": "string", "format": "date"},
        },
        "required": ["invoice_number", "total_amount"],
        "additionalProperties": False,
    }


def make_mock_response(json_data: dict, tokens: int = 150) -> MagicMock:
    """Κατασκευάζει mock Gemini response αντικείμενο."""
    mock_resp = MagicMock()
    mock_resp.text = json.dumps(json_data, ensure_ascii=False)
    mock_resp.usage_metadata.total_token_count = tokens
    return mock_resp


# ── Tests: Αρχικοποίηση ──────────────────────────────────────────────────────

class TestAIExtractorInit(unittest.TestCase):

    def test_valid_init(self):
        """Αρχικοποίηση με έγκυρο key."""
        ex = AIExtractor(api_key="fake_key_abc123")
        self.assertEqual(ex.model, GEMINI_MODEL)
        self.assertEqual(ex.max_retries, 3)

    def test_empty_key_raises(self):
        """Κενό key → ValueError."""
        with self.assertRaises(ValueError):
            AIExtractor(api_key="")

    def test_whitespace_key_raises(self):
        """Whitespace key → ValueError."""
        with self.assertRaises(ValueError):
            AIExtractor(api_key="   ")

    def test_custom_model(self):
        """Custom model name."""
        ex = AIExtractor(api_key="key", model="gemini-2.0-flash")
        self.assertEqual(ex.model, "gemini-2.0-flash")


# ── Tests: Επιτυχημένη Εξαγωγή ───────────────────────────────────────────────

class TestAIExtractorSuccess(unittest.TestCase):

    def setUp(self):
        self.tmp_dir   = tempfile.mkdtemp()
        self.img_path  = make_dummy_image(self.tmp_dir)
        self.schema    = make_invoice_schema()
        self.extractor = AIExtractor(api_key="fake_gemini_key_xyz")

        # Προκαθορισμένη απάντηση AI
        self.expected_data = {
            "invoice_number": "ΤΙΜ-2024-001",
            "vendor_afm":     "123456789",
            "net_amount":     100.00,
            "vat_amount":     24.00,
            "total_amount":   124.00,
            "invoice_date":   "2024-01-15",
        }

    def _make_patched_extractor(self):
        """Επιστρέφει patcher που κάνει mock το _call_api."""
        mock_result        = ExtractionResult()
        mock_result.status = ExtractionStatus.SUCCESS
        mock_result.extracted_data = self.expected_data
        mock_result.raw_response   = json.dumps(self.expected_data)
        mock_result.model_used     = GEMINI_MODEL
        mock_result.tokens_used    = 150
        return mock_result

    @patch("ai_extractor.AIExtractor._call_api")
    def test_successful_extraction_returns_ok(self, mock_call):
        """Επιτυχής εξαγωγή → status SUCCESS."""
        mock_call.return_value = self._make_patched_extractor()

        result = self.extractor.extract(
            image_paths=[self.img_path],
            schema=self.schema
        )

        self.assertTrue(result.is_ok())
        self.assertEqual(result.status, ExtractionStatus.SUCCESS)

    @patch("ai_extractor.AIExtractor._call_api")
    def test_extracted_data_matches_mock(self, mock_call):
        """Τα εξαγόμενα δεδομένα ταυτίζονται με το mock."""
        mock_call.return_value = self._make_patched_extractor()

        result = self.extractor.extract(
            image_paths=[self.img_path],
            schema=self.schema
        )

        self.assertEqual(result.extracted_data["invoice_number"], "ΤΙΜ-2024-001")
        self.assertEqual(result.extracted_data["total_amount"],   124.00)
        self.assertEqual(result.extracted_data["vat_amount"],     24.00)

    @patch("ai_extractor.AIExtractor._call_api")
    def test_model_used_is_set(self, mock_call):
        """Το model_used συμπληρώνεται σωστά."""
        mock_call.return_value = self._make_patched_extractor()
        result = self.extractor.extract([self.img_path], self.schema)
        self.assertEqual(result.model_used, GEMINI_MODEL)

    @patch("ai_extractor.AIExtractor._call_api")
    def test_pages_processed_count(self, mock_call):
        """Το pages_processed αντικατοπτρίζει τον αριθμό εικόνων."""
        mock_call.return_value = self._make_patched_extractor()
        result = self.extractor.extract([self.img_path], self.schema)
        self.assertEqual(result.pages_processed, 1)

    @patch("ai_extractor.AIExtractor._call_api")
    def test_extracted_at_timestamp_is_set(self, mock_call):
        """Το extracted_at timestamp συμπληρώνεται."""
        mock_call.return_value = self._make_patched_extractor()
        result = self.extractor.extract([self.img_path], self.schema)
        self.assertNotEqual(result.extracted_at, "")

    @patch("ai_extractor.AIExtractor._call_api")
    def test_to_dict_serializable(self, mock_call):
        """to_dict() παράγει JSON-serializable dict."""
        mock_call.return_value = self._make_patched_extractor()
        result = self.extractor.extract([self.img_path], self.schema)
        d = result.to_dict()
        json_str = json.dumps(d)   # δεν πρέπει να ρίξει exception
        self.assertIn("success", json_str)


# ── Tests: Διαχείριση Σφαλμάτων API ─────────────────────────────────────────

class TestAIExtractorAPIErrors(unittest.TestCase):

    def setUp(self):
        self.tmp_dir   = tempfile.mkdtemp()
        self.img_path  = make_dummy_image(self.tmp_dir)
        self.schema    = make_invoice_schema()
        self.extractor = AIExtractor(api_key="fake_key", max_retries=2)

    @patch("ai_extractor.AIExtractor._call_api",
           side_effect=Exception("API_KEY invalid 403 permission denied"))
    def test_invalid_api_key_returns_invalid_key_status(self, mock_call):
        """Άκυρο API key → status INVALID_KEY (χωρίς retry)."""
        result = self.extractor.extract([self.img_path], self.schema)

        self.assertFalse(result.is_ok())
        self.assertEqual(result.status, ExtractionStatus.INVALID_KEY)
        self.assertIn("API Key", result.error_message)
        # Να ΜΗΝ έχει γίνει retry (1 μόνο κλήση)
        self.assertEqual(mock_call.call_count, 1)

    @patch("ai_extractor.AIExtractor._call_api",
           side_effect=Exception("quota exceeded 429"))
    def test_quota_exceeded_returns_correct_status(self, mock_call):
        """Quota exceeded → status QUOTA_EXCEEDED."""
        result = self.extractor.extract([self.img_path], self.schema)

        self.assertFalse(result.is_ok())
        self.assertEqual(result.status, ExtractionStatus.QUOTA_EXCEEDED)
        self.assertEqual(mock_call.call_count, 1)

    @patch("ai_extractor.time.sleep")   # mock sleep για ταχύτητα
    @patch("ai_extractor.AIExtractor._call_api",
           side_effect=ConnectionError("Network unreachable"))
    def test_network_error_retries_and_fails(self, mock_call, mock_sleep):
        """Network error → γίνονται retries → status NETWORK_ERROR."""
        result = self.extractor.extract([self.img_path], self.schema)

        self.assertFalse(result.is_ok())
        self.assertEqual(result.status, ExtractionStatus.NETWORK_ERROR)
        # max_retries=2 → 2 κλήσεις
        self.assertEqual(mock_call.call_count, 2)

    @patch("ai_extractor.time.sleep")
    @patch("ai_extractor.AIExtractor._call_api",
           side_effect=TimeoutError("Request timeout"))
    def test_timeout_error_returns_timeout_status(self, mock_call, mock_sleep):
        """Timeout → status TIMEOUT."""
        result = self.extractor.extract([self.img_path], self.schema)

        self.assertFalse(result.is_ok())
        self.assertEqual(result.status, ExtractionStatus.TIMEOUT)

    @patch("ai_extractor.time.sleep")
    @patch("ai_extractor.AIExtractor._call_api")
    def test_retry_succeeds_on_second_attempt(self, mock_call, mock_sleep):
        """1η κλήση αποτυγχάνει, 2η πετυχαίνει → SUCCESS."""
        good_result              = ExtractionResult()
        good_result.status       = ExtractionStatus.SUCCESS
        good_result.extracted_data = {"invoice_number": "001", "total_amount": 50.0}
        good_result.model_used   = GEMINI_MODEL

        mock_call.side_effect = [
            ConnectionError("temporary failure"),
            good_result
        ]

        result = self.extractor.extract([self.img_path], self.schema)

        self.assertTrue(result.is_ok())
        self.assertEqual(mock_call.call_count, 2)


# ── Tests: Validation εισόδων ─────────────────────────────────────────────────

class TestAIExtractorInputValidation(unittest.TestCase):

    def setUp(self):
        self.tmp_dir   = tempfile.mkdtemp()
        self.img_path  = make_dummy_image(self.tmp_dir)
        self.schema    = make_invoice_schema()
        self.extractor = AIExtractor(api_key="fake_key")

    def test_empty_image_list_returns_error(self):
        """Κενή λίστα εικόνων → status FAILED."""
        result = self.extractor.extract([], self.schema)
        self.assertFalse(result.is_ok())
        self.assertEqual(result.status, ExtractionStatus.FAILED)

    def test_missing_image_file_returns_error(self):
        """Μη υπαρκτό αρχείο → status FAILED."""
        result = self.extractor.extract(
            [Path("/tmp/ghost_file.png")], self.schema
        )
        self.assertFalse(result.is_ok())
        self.assertIn("ghost_file", result.error_message)

    def test_invalid_schema_returns_error(self):
        """Άκυρο schema → status FAILED."""
        bad_schema = {"type": "array", "items": {}}
        result = self.extractor.extract([self.img_path], bad_schema)
        self.assertFalse(result.is_ok())
        self.assertEqual(result.status, ExtractionStatus.FAILED)

    def test_empty_schema_returns_error(self):
        """Κενό schema → status FAILED."""
        result = self.extractor.extract([self.img_path], {})
        self.assertFalse(result.is_ok())


# ── Tests: Prompt Construction ────────────────────────────────────────────────

class TestAIExtractorPrompt(unittest.TestCase):

    def setUp(self):
        self.extractor = AIExtractor(api_key="fake_key")
        self.schema    = make_invoice_schema()

    def test_prompt_contains_schema(self):
        """Το prompt περιλαμβάνει το JSON Schema."""
        prompt = self.extractor._build_prompt(self.schema, "")
        self.assertIn("invoice_number", prompt)
        self.assertIn("total_amount",   prompt)

    def test_prompt_contains_extra_instructions(self):
        """Οι extra instructions προστίθενται στο prompt."""
        prompt = self.extractor._build_prompt(
            self.schema, "Χρησιμοποίησε ευρωπαϊκό format ημερομηνίας."
        )
        self.assertIn("ευρωπαϊκό format", prompt)

    def test_prompt_without_extra_instructions(self):
        """Χωρίς extra instructions, το prompt παράγεται κανονικά."""
        prompt = self.extractor._build_prompt(self.schema, "")
        self.assertIn("JSON Schema", prompt)
        self.assertNotIn("Επιπλέον οδηγίες", prompt)

    def test_prompt_includes_null_instruction(self):
        """Το prompt οδηγεί το AI να επιστρέφει null για λείπουσα πεδία."""
        prompt = self.extractor._build_prompt(self.schema, "")
        self.assertIn("null", prompt)


# ── Tests: ExtractionResult ───────────────────────────────────────────────────

class TestExtractionResult(unittest.TestCase):

    def test_default_status_is_failed(self):
        r = ExtractionResult()
        self.assertFalse(r.is_ok())

    def test_success_status_is_ok(self):
        r        = ExtractionResult()
        r.status = ExtractionStatus.SUCCESS
        self.assertTrue(r.is_ok())

    def test_to_dict_contains_required_keys(self):
        r = ExtractionResult()
        d = r.to_dict()
        for key in ["status", "extracted_data", "error_message",
                    "model_used", "pages_processed", "processing_time"]:
            self.assertIn(key, d)

    def test_status_values_are_strings(self):
        """Τα ExtractionStatus values είναι strings για JSON serialization."""
        self.assertIsInstance(ExtractionStatus.SUCCESS.value,        str)
        self.assertIsInstance(ExtractionStatus.INVALID_KEY.value,    str)
        self.assertIsInstance(ExtractionStatus.NETWORK_ERROR.value,  str)
        self.assertIsInstance(ExtractionStatus.QUOTA_EXCEEDED.value, str)


if __name__ == "__main__":
    print("=" * 60)
    print("MODULE 5 - Unit Tests: AIExtractor (The Brain)")
    print("⚠️  ΑΥΣΤΗΡΟ MOCKING — Μηδέν πραγματικές κλήσεις API")
    print("=" * 60)

    loader = unittest.TestLoader()
    suite  = unittest.TestSuite()
    suite.addTests(loader.loadTestsFromTestCase(TestAIExtractorInit))
    suite.addTests(loader.loadTestsFromTestCase(TestAIExtractorSuccess))
    suite.addTests(loader.loadTestsFromTestCase(TestAIExtractorAPIErrors))
    suite.addTests(loader.loadTestsFromTestCase(TestAIExtractorInputValidation))
    suite.addTests(loader.loadTestsFromTestCase(TestAIExtractorPrompt))
    suite.addTests(loader.loadTestsFromTestCase(TestExtractionResult))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 60)
    if result.wasSuccessful():
        total = result.testsRun
        print(f"✅ ΕΠΙΤΥΧΙΑ: {total}/{total} tests πέρασαν!")
        print("✅ Module 5 είναι έτοιμο. Μπορούμε να προχωρήσουμε στο Module 6.")
    else:
        failures = len(result.failures) + len(result.errors)
        print(f"❌ ΑΠΟΤΥΧΙΑ: {failures} tests απέτυχαν.")
        sys.exit(1)
    print("=" * 60)
