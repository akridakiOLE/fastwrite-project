"""
Unit Tests - Module 7: DocumentExporter
Δημιουργεί DataFrame με εικονικά τιμολόγια, κάνει εξαγωγή σε CSV/XLSX,
διαβάζει τα αρχεία από τον δίσκο και επιβεβαιώνει ακρίβεια δεδομένων.
Χωρίς κλήσεις δικτύου.
"""

import sys
import csv
import json
import unittest
import tempfile
from pathlib import Path

sys.path.insert(0, "/app/projects")

from exporter import DocumentExporter, ExportResult, SearchResult


# ── Βοηθητικά δεδομένα ────────────────────────────────────────────────────────

def make_sample_records(n: int = 5) -> list:
    """Δημιουργεί n εικονικά τιμολόγια."""
    statuses = ["Validated", "Needs Human Review", "Pending",
                "Validated", "Validated"]
    records  = []
    for i in range(n):
        records.append({
            "id":             i + 1,
            "filename":       f"invoice_{i+1:03d}.pdf",
            "status":         statuses[i % len(statuses)],
            "invoice_number": f"ΤΙΜ-2024-{i+1:03d}",
            "invoice_date":   f"2024-{(i % 12) + 1:02d}-15",
            "vendor_afm":     f"10000000{i}",
            "buyer_afm":      f"20000000{i}",
            "net_amount":     round(100.0 * (i + 1), 2),
            "vat_rate":       24.0,
            "vat_amount":     round(24.0 * (i + 1), 2),
            "total_amount":   round(124.0 * (i + 1), 2),
            "discount":       0.0,
            "created_at":     f"2024-01-{i+1:02d}T10:00:00",
        })
    return records


# ── Tests: CSV Εξαγωγή ────────────────────────────────────────────────────────

class TestExporterCSV(unittest.TestCase):

    def setUp(self):
        self.tmp_dir  = tempfile.mkdtemp()
        self.exporter = DocumentExporter(export_dir=self.tmp_dir)
        self.records  = make_sample_records(5)

    def test_csv_export_creates_file(self):
        """Η εξαγωγή CSV δημιουργεί αρχείο στον δίσκο."""
        result = self.exporter.export_csv(self.records, filename="test_out.csv")
        self.assertTrue(result.success, f"Error: {result.error}")
        self.assertTrue(result.file_path.exists())

    def test_csv_record_count_matches(self):
        """Ο αριθμός εγγραφών στο CSV ταιριάζει με την είσοδο."""
        result = self.exporter.export_csv(self.records)
        self.assertEqual(result.record_count, 5)

    def test_csv_data_accuracy(self):
        """Τα δεδομένα στο CSV είναι ακριβή."""
        result = self.exporter.export_csv(
            self.records, filename="accuracy_test.csv"
        )
        self.assertTrue(result.success)

        # Διαβάζουμε το CSV από τον δίσκο
        rows = []
        with open(result.file_path, encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            rows   = list(reader)

        self.assertEqual(len(rows), 5)

        # Ελέγχουμε το πρώτο record
        first = rows[0]
        self.assertEqual(first["filename"],       "invoice_001.pdf")
        self.assertEqual(first["invoice_number"], "ΤΙΜ-2024-001")
        self.assertEqual(float(first["total_amount"]), 124.0)

    def test_csv_has_correct_headers(self):
        """Το CSV περιέχει τις αναμενόμενες επικεφαλίδες."""
        result = self.exporter.export_csv(self.records)
        with open(result.file_path, encoding="utf-8-sig") as f:
            headers = csv.DictReader(f).fieldnames

        for col in ["filename", "status", "total_amount", "invoice_number"]:
            self.assertIn(col, headers, f"Λείπει η στήλη: {col}")

    def test_csv_with_column_filter(self):
        """Εξαγωγή CSV με συγκεκριμένες στήλες μόνο."""
        cols   = ["id", "filename", "total_amount"]
        result = self.exporter.export_csv(self.records, columns=cols)
        with open(result.file_path, encoding="utf-8-sig") as f:
            headers = csv.DictReader(f).fieldnames

        self.assertEqual(set(headers), set(cols))

    def test_csv_empty_records_returns_error(self):
        """Κενή λίστα → αποτυχία με error message."""
        result = self.exporter.export_csv([])
        self.assertFalse(result.success)
        self.assertNotEqual(result.error, "")

    def test_csv_exported_at_is_set(self):
        """Το exported_at timestamp συμπληρώνεται."""
        result = self.exporter.export_csv(self.records)
        self.assertNotEqual(result.exported_at, "")

    def test_csv_greek_characters_preserved(self):
        """Τα ελληνικά χαρακτήρες διατηρούνται σωστά (UTF-8 BOM)."""
        records = [{"filename": "τιμολόγιο.pdf",
                    "status": "Επικυρωμένο",
                    "total_amount": 100.0}]
        result = self.exporter.export_csv(records)
        with open(result.file_path, encoding="utf-8-sig") as f:
            content = f.read()
        self.assertIn("τιμολόγιο", content)


# ── Tests: XLSX Εξαγωγή ──────────────────────────────────────────────────────

class TestExporterXLSX(unittest.TestCase):

    def setUp(self):
        self.tmp_dir  = tempfile.mkdtemp()
        self.exporter = DocumentExporter(export_dir=self.tmp_dir)
        self.records  = make_sample_records(5)

    def test_xlsx_export_creates_file(self):
        """Η εξαγωγή XLSX δημιουργεί αρχείο."""
        result = self.exporter.export_xlsx(self.records, filename="test.xlsx")
        self.assertTrue(result.success, f"Error: {result.error}")
        self.assertTrue(result.file_path.exists())
        self.assertEqual(result.file_path.suffix, ".xlsx")

    def test_xlsx_record_count_matches(self):
        """Ο αριθμός εγγραφών στο XLSX ταιριάζει."""
        result = self.exporter.export_xlsx(self.records)
        self.assertEqual(result.record_count, 5)

    def test_xlsx_data_accuracy(self):
        """Τα δεδομένα στο XLSX είναι ακριβή (pandas read_excel)."""
        result = self.exporter.export_xlsx(
            self.records, filename="data_check.xlsx"
        )
        self.assertTrue(result.success)

        import pandas as pd
        df = pd.read_excel(result.file_path)

        self.assertEqual(len(df), 5)
        self.assertEqual(df.iloc[0]["filename"], "invoice_001.pdf")
        self.assertAlmostEqual(df.iloc[0]["total_amount"], 124.0, places=1)

    def test_xlsx_has_correct_headers(self):
        """Το XLSX περιέχει τις αναμενόμενες επικεφαλίδες."""
        import pandas as pd
        result  = self.exporter.export_xlsx(self.records)
        df      = pd.read_excel(result.file_path)
        headers = list(df.columns)

        for col in ["filename", "status", "total_amount"]:
            self.assertIn(col, headers)

    def test_xlsx_empty_records_returns_error(self):
        """Κενή λίστα → αποτυχία."""
        result = self.exporter.export_xlsx([])
        self.assertFalse(result.success)

    def test_xlsx_custom_sheet_name(self):
        """Custom sheet name."""
        import openpyxl
        result = self.exporter.export_xlsx(
            self.records, sheet_name="Τιμολόγια 2024"
        )
        wb     = openpyxl.load_workbook(result.file_path)
        self.assertIn("Τιμολόγια 2024", wb.sheetnames)

    def test_xlsx_file_not_empty(self):
        """Το XLSX αρχείο δεν είναι κενό."""
        result = self.exporter.export_xlsx(self.records)
        self.assertGreater(result.file_path.stat().st_size, 0)


# ── Tests: JSON Εξαγωγή ──────────────────────────────────────────────────────

class TestExporterJSON(unittest.TestCase):

    def setUp(self):
        self.tmp_dir  = tempfile.mkdtemp()
        self.exporter = DocumentExporter(export_dir=self.tmp_dir)
        self.records  = make_sample_records(3)

    def test_json_export_creates_file(self):
        result = self.exporter.export_json(self.records, filename="out.json")
        self.assertTrue(result.success)
        self.assertTrue(result.file_path.exists())

    def test_json_data_accuracy(self):
        """Τα δεδομένα στο JSON είναι ακριβή."""
        result = self.exporter.export_json(self.records)
        loaded = json.loads(result.file_path.read_text(encoding="utf-8"))
        self.assertEqual(len(loaded), 3)
        self.assertEqual(loaded[0]["invoice_number"], "ΤΙΜ-2024-001")

    def test_json_empty_records_returns_error(self):
        result = self.exporter.export_json([])
        self.assertFalse(result.success)


# ── Tests: Αναζήτηση ─────────────────────────────────────────────────────────

class TestExporterSearch(unittest.TestCase):

    def setUp(self):
        self.exporter = DocumentExporter(export_dir=tempfile.mkdtemp())
        self.records  = make_sample_records(5)

    def test_search_no_filters_returns_all(self):
        """Χωρίς φίλτρα → επιστρέφει όλα τα records."""
        result = self.exporter.search(self.records)
        self.assertEqual(result.total_count, 5)

    def test_search_by_filename(self):
        """Αναζήτηση κειμένου σε filename."""
        result = self.exporter.search(self.records, query="invoice_001")
        self.assertEqual(result.total_count, 1)
        self.assertEqual(result.records[0]["filename"], "invoice_001.pdf")

    def test_search_by_status_validated(self):
        """Φίλτρο status=Validated."""
        result = self.exporter.search(
            self.records, status_filter="Validated"
        )
        for r in result.records:
            self.assertEqual(r["status"], "Validated")

    def test_search_by_status_review(self):
        """Φίλτρο status=Needs Human Review."""
        result = self.exporter.search(
            self.records, status_filter="Needs Human Review"
        )
        for r in result.records:
            self.assertEqual(r["status"], "Needs Human Review")

    def test_search_by_min_amount(self):
        """Φίλτρο min_amount."""
        result = self.exporter.search(self.records, min_amount=400.0)
        for r in result.records:
            self.assertGreaterEqual(r["total_amount"], 400.0)

    def test_search_by_max_amount(self):
        """Φίλτρο max_amount."""
        result = self.exporter.search(self.records, max_amount=300.0)
        for r in result.records:
            self.assertLessEqual(r["total_amount"], 300.0)

    def test_search_by_amount_range(self):
        """Φίλτρο min+max amount."""
        result = self.exporter.search(
            self.records, min_amount=200.0, max_amount=400.0
        )
        for r in result.records:
            self.assertGreaterEqual(r["total_amount"], 200.0)
            self.assertLessEqual(r["total_amount"],   400.0)

    def test_search_by_date_from(self):
        """Φίλτρο date_from."""
        result = self.exporter.search(self.records, date_from="2024-03-15")
        for r in result.records:
            self.assertGreaterEqual(r["invoice_date"], "2024-03-15")

    def test_search_no_results(self):
        """Αναζήτηση χωρίς αποτελέσματα."""
        result = self.exporter.search(self.records, query="ΑΥΤΟ_ΔΕΝ_ΥΠΑΡΧΕΙ")
        self.assertEqual(result.total_count, 0)
        self.assertEqual(result.records, [])

    def test_search_filters_used_populated(self):
        """Το filters_used περιέχει τα χρησιμοποιηθέντα φίλτρα."""
        result = self.exporter.search(
            self.records, status_filter="Validated", min_amount=100.0
        )
        self.assertIn("status",     result.filters_used)
        self.assertIn("min_amount", result.filters_used)
        self.assertNotIn("date_from", result.filters_used)


# ── Tests: Στατιστικά ─────────────────────────────────────────────────────────

class TestExporterStats(unittest.TestCase):

    def setUp(self):
        self.exporter = DocumentExporter(export_dir=tempfile.mkdtemp())
        self.records  = make_sample_records(5)

    def test_stats_total_count(self):
        """Σωστό συνολικό πλήθος."""
        stats = self.exporter.summary_stats(self.records)
        self.assertEqual(stats["total"], 5)

    def test_stats_by_status(self):
        """Σωστό πλήθος ανά status."""
        stats = self.exporter.summary_stats(self.records)
        self.assertIn("by_status", stats)
        self.assertGreater(stats["by_status"].get("Validated", 0), 0)

    def test_stats_sum_total_amount(self):
        """Σωστό άθροισμα total_amount."""
        stats    = self.exporter.summary_stats(self.records)
        expected = sum(r["total_amount"] for r in self.records)
        self.assertAlmostEqual(stats["sum_total_amount"], expected, places=1)

    def test_stats_empty_records(self):
        """Κενά records → total=0."""
        stats = self.exporter.summary_stats([])
        self.assertEqual(stats["total"], 0)

    def test_stats_date_range(self):
        """Σωστό εύρος ημερομηνιών."""
        stats = self.exporter.summary_stats(self.records)
        self.assertIn("date_range", stats)
        self.assertIn("from", stats["date_range"])
        self.assertIn("to",   stats["date_range"])


# ── Tests: ExportResult ───────────────────────────────────────────────────────

class TestExportResult(unittest.TestCase):

    def test_to_dict_contains_required_keys(self):
        r = ExportResult(success=True, format="csv", record_count=10)
        d = r.to_dict()
        for k in ["success", "file_path", "format", "record_count",
                  "error", "exported_at"]:
            self.assertIn(k, d)

    def test_to_dict_serializable(self):
        r = ExportResult(success=True, format="xlsx",
                         file_path=Path("/tmp/test.xlsx"))
        d = json.dumps(r.to_dict())   # δεν πρέπει να ρίξει exception
        self.assertIn("xlsx", d)


if __name__ == "__main__":
    print("=" * 60)
    print("MODULE 7 - Unit Tests: DocumentExporter (Export & Search)")
    print("=" * 60)

    loader = unittest.TestLoader()
    suite  = unittest.TestSuite()
    suite.addTests(loader.loadTestsFromTestCase(TestExporterCSV))
    suite.addTests(loader.loadTestsFromTestCase(TestExporterXLSX))
    suite.addTests(loader.loadTestsFromTestCase(TestExporterJSON))
    suite.addTests(loader.loadTestsFromTestCase(TestExporterSearch))
    suite.addTests(loader.loadTestsFromTestCase(TestExporterStats))
    suite.addTests(loader.loadTestsFromTestCase(TestExportResult))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 60)
    if result.wasSuccessful():
        total = result.testsRun
        print(f"✅ ΕΠΙΤΥΧΙΑ: {total}/{total} tests πέρασαν!")
        print("✅ Module 7 είναι έτοιμο. Μπορούμε να προχωρήσουμε στο Module 8.")
    else:
        failures = len(result.failures) + len(result.errors)
        print(f"❌ ΑΠΟΤΥΧΙΑ: {failures} tests απέτυχαν.")
        sys.exit(1)
    print("=" * 60)
