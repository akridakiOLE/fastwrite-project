"""
Unit Tests - Module 3: FileProcessor
Δημιουργεί dummy PDF μέσω κώδικα (PyMuPDF), το περνάει από τον processor,
και επιβεβαιώνει ότι παράχθηκε αρχείο εικόνας .png.
Χωρίς κλήσεις δικτύου.
"""

import sys
import unittest
import tempfile
import os
from pathlib import Path

sys.path.insert(0, "/app/projects")

from file_processor import FileProcessor, ProcessedFile, SUPPORTED_FORMATS


# ── Helpers ──────────────────────────────────────────────────────────────────

def create_dummy_pdf(path: Path, num_pages: int = 1):
    """Δημιουργεί ένα dummy PDF με reportlab."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4

    c = canvas.Canvas(str(path), pagesize=A4)
    for i in range(num_pages):
        c.setFont("Helvetica", 24)
        c.drawString(72, 700, f"Test Page {i + 1}")
        c.setFont("Helvetica", 14)
        c.drawString(72, 660, "AFM: 123456789 | Total: 100.00 EUR")
        c.showPage()
    c.save()


def create_dummy_png(path: Path, width: int = 100, height: int = 100):
    """Δημιουργεί ένα λευκό dummy PNG με Pillow."""
    from PIL import Image
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    img.save(str(path), format="PNG")


def create_dummy_jpeg(path: Path):
    """Δημιουργεί ένα dummy JPEG."""
    from PIL import Image
    img = Image.new("RGB", (200, 200), color=(200, 180, 160))
    img.save(str(path), format="JPEG")


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestFileProcessorPDF(unittest.TestCase):
    """Tests μετατροπής PDF → PNG."""

    def setUp(self):
        self.tmp_dir  = tempfile.mkdtemp()
        self.out_dir  = Path(self.tmp_dir) / "output"
        self.processor = FileProcessor(output_dir=self.out_dir, dpi=72)  # 72dpi για ταχύτητα

    def test_single_page_pdf_creates_png(self):
        """Ένα μονοσέλιδο PDF παράγει 1 αρχείο .png."""
        pdf_path = Path(self.tmp_dir) / "invoice_001.pdf"
        create_dummy_pdf(pdf_path, num_pages=1)

        result = self.processor.process(pdf_path)

        self.assertTrue(result.is_ok(), f"Error: {result.error_message}")
        self.assertEqual(result.file_type, "pdf")
        self.assertEqual(result.page_count, 1)
        self.assertEqual(len(result.pages), 1)

        # Το αρχείο εικόνας υπάρχει στον δίσκο
        self.assertTrue(result.pages[0].exists())
        self.assertEqual(result.pages[0].suffix.lower(), ".png")

    def test_multi_page_pdf_creates_multiple_pngs(self):
        """Ένα 3-σέλιδο PDF παράγει 3 αρχεία .png."""
        pdf_path = Path(self.tmp_dir) / "multi_page.pdf"
        create_dummy_pdf(pdf_path, num_pages=3)

        result = self.processor.process(pdf_path)

        self.assertTrue(result.is_ok(), f"Error: {result.error_message}")
        self.assertEqual(result.page_count, 3)
        self.assertEqual(len(result.pages), 3)

        for page_path in result.pages:
            self.assertTrue(page_path.exists(), f"Λείπει: {page_path}")
            self.assertEqual(page_path.suffix.lower(), ".png")

    def test_pdf_pages_are_nonzero_size(self):
        """Τα παραγόμενα PNG έχουν μέγεθος > 0 bytes."""
        pdf_path = Path(self.tmp_dir) / "size_check.pdf"
        create_dummy_pdf(pdf_path, num_pages=1)

        result = self.processor.process(pdf_path)
        self.assertTrue(result.is_ok())

        for page_path in result.pages:
            size = page_path.stat().st_size
            self.assertGreater(size, 0, f"Κενό αρχείο: {page_path}")

    def test_pdf_output_naming_convention(self):
        """Τα αρχεία εξόδου ακολουθούν το format page_XXXX.png."""
        pdf_path = Path(self.tmp_dir) / "naming.pdf"
        create_dummy_pdf(pdf_path, num_pages=2)

        result = self.processor.process(pdf_path)
        self.assertTrue(result.is_ok())

        names = [p.name for p in result.pages]
        self.assertIn("page_0001.png", names)
        self.assertIn("page_0002.png", names)


class TestFileProcessorImages(unittest.TestCase):
    """Tests επεξεργασίας εικόνων (PNG, JPEG)."""

    def setUp(self):
        self.tmp_dir   = tempfile.mkdtemp()
        self.out_dir   = Path(self.tmp_dir) / "output"
        self.processor = FileProcessor(output_dir=self.out_dir)

    def test_png_input_produces_png_output(self):
        """Εισαγωγή PNG → έξοδος PNG."""
        png_path = Path(self.tmp_dir) / "receipt.png"
        create_dummy_png(png_path)

        result = self.processor.process(png_path)

        self.assertTrue(result.is_ok(), f"Error: {result.error_message}")
        self.assertEqual(result.file_type, "image")
        self.assertEqual(result.page_count, 1)
        self.assertTrue(result.pages[0].exists())
        self.assertEqual(result.pages[0].suffix.lower(), ".png")

    def test_jpeg_input_produces_png_output(self):
        """Εισαγωγή JPEG → έξοδος PNG (κανονικοποίηση)."""
        jpg_path = Path(self.tmp_dir) / "scan.jpg"
        create_dummy_jpeg(jpg_path)

        result = self.processor.process(jpg_path)

        self.assertTrue(result.is_ok(), f"Error: {result.error_message}")
        self.assertEqual(result.page_count, 1)
        self.assertEqual(result.pages[0].suffix.lower(), ".png")


class TestFileProcessorErrors(unittest.TestCase):
    """Tests διαχείρισης σφαλμάτων."""

    def setUp(self):
        self.tmp_dir   = tempfile.mkdtemp()
        self.out_dir   = Path(self.tmp_dir) / "output"
        self.processor = FileProcessor(output_dir=self.out_dir)

    def test_missing_file_returns_error(self):
        """Μη υπαρκτό αρχείο → status 'error'."""
        result = self.processor.process("/tmp/does_not_exist.pdf")
        self.assertFalse(result.is_ok())
        self.assertEqual(result.status, "error")
        self.assertIn("δεν βρέθηκε", result.error_message.lower())

    def test_unsupported_format_returns_error(self):
        """Μη υποστηριζόμενη κατάληξη → status 'error'."""
        bad_file = Path(self.tmp_dir) / "document.docx"
        bad_file.write_text("dummy content")

        result = self.processor.process(bad_file)
        self.assertFalse(result.is_ok())
        self.assertIn("docx", result.error_message.lower())

    def test_batch_processing(self):
        """Batch επεξεργασία: 2 PDF → 2 αποτελέσματα."""
        paths = []
        for i in range(2):
            p = Path(self.tmp_dir) / f"batch_{i}.pdf"
            create_dummy_pdf(p, num_pages=1)
            paths.append(p)

        results = self.processor.process_batch(paths)
        self.assertEqual(len(results), 2)
        for r in results:
            self.assertTrue(r.is_ok(), f"Error: {r.error_message}")

    def test_processed_at_is_set(self):
        """Το processed_at timestamp συμπληρώνεται μετά την επεξεργασία."""
        pdf_path = Path(self.tmp_dir) / "ts_check.pdf"
        create_dummy_pdf(pdf_path)

        result = self.processor.process(pdf_path)
        self.assertTrue(result.is_ok())
        self.assertNotEqual(result.processed_at, "")


class TestFileProcessorSupportedFormats(unittest.TestCase):
    """Tests για τα υποστηριζόμενα formats."""

    def test_pdf_in_supported_formats(self):
        self.assertIn(".pdf", SUPPORTED_FORMATS)

    def test_image_formats_in_supported(self):
        for fmt in [".png", ".jpg", ".jpeg"]:
            self.assertIn(fmt, SUPPORTED_FORMATS)

    def test_unsupported_formats_not_in_set(self):
        for fmt in [".docx", ".txt", ".xlsx", ".mp4"]:
            self.assertNotIn(fmt, SUPPORTED_FORMATS)


if __name__ == "__main__":
    print("=" * 60)
    print("MODULE 3 - Unit Tests: FileProcessor")
    print("=" * 60)

    loader = unittest.TestLoader()
    suite  = unittest.TestSuite()
    suite.addTests(loader.loadTestsFromTestCase(TestFileProcessorPDF))
    suite.addTests(loader.loadTestsFromTestCase(TestFileProcessorImages))
    suite.addTests(loader.loadTestsFromTestCase(TestFileProcessorErrors))
    suite.addTests(loader.loadTestsFromTestCase(TestFileProcessorSupportedFormats))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 60)
    if result.wasSuccessful():
        total = result.testsRun
        print(f"✅ ΕΠΙΤΥΧΙΑ: {total}/{total} tests πέρασαν!")
        print("✅ Module 3 είναι έτοιμο. Μπορούμε να προχωρήσουμε στο Module 4.")
    else:
        failures = len(result.failures) + len(result.errors)
        print(f"❌ ΑΠΟΤΥΧΙΑ: {failures} tests απέτυχαν.")
        sys.exit(1)
    print("=" * 60)
