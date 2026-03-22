"""
Unit Tests - Module 6: InvoiceValidator & GenericValidator
Τροφοδοτεί με JSON όπου τα ποσά ΔΕΝ βγάζουν άθροισμα.
Επιβεβαιώνει ότι το σύστημα "πιάνει" το λάθος και αλλάζει status → "Needs Human Review".
Χωρίς κλήσεις δικτύου.
"""

import sys
import unittest

sys.path.insert(0, "/app/projects")

from validator import (
    InvoiceValidator, GenericValidator, ValidationResult,
    STATUS_VALIDATED, STATUS_REVIEW, TOLERANCE
)


# ── Βοηθητικά δεδομένα ────────────────────────────────────────────────────────

def valid_invoice() -> dict:
    """Ένα απόλυτα σωστό τιμολόγιο."""
    return {
        "invoice_number": "ΤΙΜ-2024-001",
        "invoice_date":   "2024-01-15",
        "vendor_afm":     "123456789",
        "buyer_afm":      "987654321",
        "net_amount":     100.00,
        "vat_rate":       24.0,
        "vat_amount":     24.00,
        "total_amount":   124.00,
        "discount":       0.0,
    }


class TestInvoiceValidatorSuccess(unittest.TestCase):
    """Ένα σωστό τιμολόγιο πρέπει να περνάει όλους τους κανόνες."""

    def setUp(self):
        self.v = InvoiceValidator()

    def test_valid_invoice_passes(self):
        result = self.v.validate(valid_invoice())
        self.assertTrue(result.is_valid,
            f"Αναμενόταν Validated αλλά βρέθηκαν errors: "
            f"{[e.to_dict() for e in result.errors]}")
        self.assertEqual(result.status, STATUS_VALIDATED)

    def test_valid_invoice_has_no_errors(self):
        result = self.v.validate(valid_invoice())
        self.assertEqual(len(result.errors), 0)

    def test_validated_at_is_set(self):
        result = self.v.validate(valid_invoice())
        self.assertNotEqual(result.validated_at, "")

    def test_rules_checked_greater_than_zero(self):
        result = self.v.validate(valid_invoice())
        self.assertGreater(result.rules_checked, 0)

    def test_to_dict_is_serializable(self):
        import json
        result = self.v.validate(valid_invoice())
        d = result.to_dict()
        json_str = json.dumps(d)   # δεν πρέπει να ρίξει exception
        self.assertIn("Validated", json_str)


class TestInvoiceValidatorMathErrors(unittest.TestCase):
    """
    Κεντρικά tests: λάθη στα μαθηματικά → "Needs Human Review".
    """

    def setUp(self):
        self.v = InvoiceValidator()

    def test_wrong_total_triggers_review(self):
        """net + vat ≠ total → status 'Needs Human Review'."""
        data = valid_invoice()
        data["total_amount"] = 999.99   # λάθος σύνολο
        result = self.v.validate(data)

        self.assertFalse(result.is_valid)
        self.assertEqual(result.status, STATUS_REVIEW)

    def test_wrong_total_error_mentions_math_check(self):
        """Το error rule πρέπει να είναι 'math_check'."""
        data = valid_invoice()
        data["total_amount"] = 200.00
        result = self.v.validate(data)

        math_errors = [e for e in result.errors if e.rule == "math_check"]
        self.assertGreater(len(math_errors), 0,
            "Δεν βρέθηκε κανένα math_check error")

    def test_wrong_vat_amount_triggers_review(self):
        """net × rate% ≠ vat_amount → Review."""
        data = valid_invoice()
        data["vat_amount"] = 50.00   # πρέπει να είναι 24.00
        result = self.v.validate(data)

        self.assertEqual(result.status, STATUS_REVIEW)
        math_errors = [e for e in result.errors if e.rule == "math_check"]
        self.assertGreater(len(math_errors), 0)

    def test_math_within_tolerance_passes(self):
        """Διαφορά εντός ±0.02€ → δεν πρέπει να αποτύχει."""
        data = valid_invoice()
        data["total_amount"] = 124.01   # +0.01€ ανοχή
        result = self.v.validate(data)

        math_errors = [e for e in result.errors if e.rule == "math_check"]
        self.assertEqual(len(math_errors), 0,
            f"Η ανοχή δεν γίνεται σεβαστή: {[e.message for e in math_errors]}")

    def test_math_outside_tolerance_fails(self):
        """Διαφορά > 0.02€ → πρέπει να αποτύχει."""
        data = valid_invoice()
        data["total_amount"] = 124.05   # +0.05€ εκτός ανοχής
        result = self.v.validate(data)

        math_errors = [e for e in result.errors if e.rule == "math_check"]
        self.assertGreater(len(math_errors), 0)

    def test_discount_considered_in_math(self):
        """net + vat - discount = total."""
        data = valid_invoice()
        data["net_amount"]   = 100.00
        data["vat_amount"]   = 24.00
        data["discount"]     = 10.00
        data["total_amount"] = 114.00   # 100 + 24 - 10 = 114
        result = self.v.validate(data)

        math_errors = [e for e in result.errors if e.rule == "math_check"]
        self.assertEqual(len(math_errors), 0,
            f"Η έκπτωση δεν υπολογίστηκε σωστά: {[e.message for e in math_errors]}")


class TestInvoiceValidatorTypeErrors(unittest.TestCase):
    """Λάθος τύποι δεδομένων → Review."""

    def setUp(self):
        self.v = InvoiceValidator()

    def test_string_in_numeric_field_triggers_review(self):
        """net_amount ως string → type error."""
        data = valid_invoice()
        data["net_amount"] = "εκατό ευρώ"
        result = self.v.validate(data)
        self.assertEqual(result.status, STATUS_REVIEW)
        type_errors = [e for e in result.errors if e.rule == "type_check"]
        self.assertGreater(len(type_errors), 0)

    def test_number_in_string_field_triggers_review(self):
        """vendor_afm ως int → type error."""
        data = valid_invoice()
        data["vendor_afm"] = 123456789   # int αντί string
        result = self.v.validate(data)
        type_errors = [e for e in result.errors if e.rule == "type_check"]
        self.assertGreater(len(type_errors), 0)


class TestInvoiceValidatorRangeErrors(unittest.TestCase):
    """Τιμές εκτός λογικού εύρους → Review."""

    def setUp(self):
        self.v = InvoiceValidator()

    def test_negative_net_amount_triggers_review(self):
        """Αρνητική καθαρή αξία → Review."""
        data = valid_invoice()
        data["net_amount"] = -50.00
        result = self.v.validate(data)
        self.assertEqual(result.status, STATUS_REVIEW)
        range_errors = [e for e in result.errors if e.rule == "range_check"]
        self.assertGreater(len(range_errors), 0)

    def test_negative_total_triggers_review(self):
        data = valid_invoice()
        data["total_amount"] = -1.00
        result = self.v.validate(data)
        self.assertEqual(result.status, STATUS_REVIEW)

    def test_vat_rate_over_100_triggers_review(self):
        """ΦΠΑ > 100% → Review."""
        data = valid_invoice()
        data["vat_rate"] = 150.0
        result = self.v.validate(data)
        self.assertEqual(result.status, STATUS_REVIEW)

    def test_total_less_than_net_triggers_review(self):
        """total < net → Review."""
        data = valid_invoice()
        data["total_amount"] = 50.00   # μικρότερο από net_amount=100
        result = self.v.validate(data)
        range_errors = [e for e in result.errors if e.rule == "range_check"]
        self.assertGreater(len(range_errors), 0)

    def test_zero_total_generates_warning(self):
        """total = 0 → warning (όχι error)."""
        data = valid_invoice()
        data["net_amount"]   = 0.0
        data["vat_amount"]   = 0.0
        data["total_amount"] = 0.0
        result = self.v.validate(data)
        zero_warnings = [w for w in result.warnings if w.rule == "zero_amount"]
        self.assertGreater(len(zero_warnings), 0)


class TestInvoiceValidatorFormatErrors(unittest.TestCase):
    """Λάθος formats (ΑΦΜ, ημερομηνία) → Review."""

    def setUp(self):
        self.v = InvoiceValidator()

    def test_afm_with_less_than_9_digits_triggers_review(self):
        """ΑΦΜ με 8 ψηφία → format error."""
        data = valid_invoice()
        data["vendor_afm"] = "12345678"   # 8 ψηφία
        result = self.v.validate(data)
        fmt_errors = [e for e in result.errors if e.rule == "format_check"]
        self.assertGreater(len(fmt_errors), 0)

    def test_afm_with_letters_triggers_review(self):
        """ΑΦΜ με γράμματα → format error."""
        data = valid_invoice()
        data["vendor_afm"] = "12345678X"
        result = self.v.validate(data)
        fmt_errors = [e for e in result.errors if e.rule == "format_check"]
        self.assertGreater(len(fmt_errors), 0)

    def test_valid_afm_passes(self):
        """Σωστό ΑΦΜ 9 ψηφίων → κανένα format error."""
        data = valid_invoice()
        data["vendor_afm"] = "123456789"
        result = self.v.validate(data)
        afm_errors = [e for e in result.errors
                      if e.rule == "format_check" and "afm" in e.field]
        self.assertEqual(len(afm_errors), 0)

    def test_wrong_date_format_triggers_review(self):
        """Ημερομηνία σε λάθος format → Review."""
        data = valid_invoice()
        data["invoice_date"] = "15/01/2024"   # λάθος format
        result = self.v.validate(data)
        fmt_errors = [e for e in result.errors if e.rule == "format_check"]
        self.assertGreater(len(fmt_errors), 0)

    def test_invalid_calendar_date_triggers_review(self):
        """Ημερομηνία που δεν υπάρχει → Review."""
        data = valid_invoice()
        data["invoice_date"] = "2024-13-45"   # μήνας 13, μέρα 45
        result = self.v.validate(data)
        fmt_errors = [e for e in result.errors if e.rule == "format_check"]
        self.assertGreater(len(fmt_errors), 0)

    def test_correct_date_format_passes(self):
        """Σωστή ημερομηνία YYYY-MM-DD → κανένα error."""
        data = valid_invoice()
        data["invoice_date"] = "2024-06-30"
        result = self.v.validate(data)
        date_errors = [e for e in result.errors
                       if e.rule == "format_check" and "date" in e.field]
        self.assertEqual(len(date_errors), 0)


class TestInvoiceValidatorPresence(unittest.TestCase):
    """Υποχρεωτικά πεδία που λείπουν → Review."""

    def setUp(self):
        self.v = InvoiceValidator()

    def test_missing_total_amount_triggers_review(self):
        """Απουσία total_amount → Review."""
        data = valid_invoice()
        del data["total_amount"]
        result = self.v.validate(data)
        self.assertEqual(result.status, STATUS_REVIEW)
        req_errors = [e for e in result.errors if e.rule == "required_field"]
        self.assertGreater(len(req_errors), 0)

    def test_missing_optional_fields_generate_warnings(self):
        """Απουσία συνιστώμενων πεδίων → warnings, όχι errors."""
        data = {"total_amount": 100.0}   # μόνο το υποχρεωτικό
        result = self.v.validate(data)
        self.assertGreater(len(result.warnings), 0)


class TestGenericValidator(unittest.TestCase):
    """Tests για τον GenericValidator."""

    def setUp(self):
        self.v = GenericValidator()
        self.schema = {
            "type": "object",
            "properties": {
                "name":   {"type": "string"},
                "amount": {"type": "number"},
                "count":  {"type": "integer"},
            },
            "required": ["name", "amount"],
            "additionalProperties": False,
        }

    def test_valid_data_passes(self):
        data   = {"name": "Test", "amount": 50.5, "count": 3}
        result = self.v.validate(data, self.schema)
        self.assertTrue(result.is_valid)
        self.assertEqual(result.status, STATUS_VALIDATED)

    def test_missing_required_field_triggers_review(self):
        data   = {"name": "Test"}   # λείπει "amount"
        result = self.v.validate(data, self.schema)
        self.assertFalse(result.is_valid)
        self.assertEqual(result.status, STATUS_REVIEW)

    def test_wrong_type_triggers_review(self):
        data   = {"name": 123, "amount": 50.5}   # name πρέπει να είναι string
        result = self.v.validate(data, self.schema)
        self.assertFalse(result.is_valid)


if __name__ == "__main__":
    print("=" * 60)
    print("MODULE 6 - Unit Tests: Validation Engine")
    print("=" * 60)

    loader = unittest.TestLoader()
    suite  = unittest.TestSuite()
    suite.addTests(loader.loadTestsFromTestCase(TestInvoiceValidatorSuccess))
    suite.addTests(loader.loadTestsFromTestCase(TestInvoiceValidatorMathErrors))
    suite.addTests(loader.loadTestsFromTestCase(TestInvoiceValidatorTypeErrors))
    suite.addTests(loader.loadTestsFromTestCase(TestInvoiceValidatorRangeErrors))
    suite.addTests(loader.loadTestsFromTestCase(TestInvoiceValidatorFormatErrors))
    suite.addTests(loader.loadTestsFromTestCase(TestInvoiceValidatorPresence))
    suite.addTests(loader.loadTestsFromTestCase(TestGenericValidator))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 60)
    if result.wasSuccessful():
        total = result.testsRun
        print(f"✅ ΕΠΙΤΥΧΙΑ: {total}/{total} tests πέρασαν!")
        print("✅ Module 6 είναι έτοιμο. Μπορούμε να προχωρήσουμε στο Module 7.")
    else:
        failures = len(result.failures) + len(result.errors)
        print(f"❌ ΑΠΟΤΥΧΙΑ: {failures} tests απέτυχαν.")
        sys.exit(1)
    print("=" * 60)
