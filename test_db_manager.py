"""
Unit Tests - Module 1: DatabaseManager
Χρησιμοποιεί in-memory SQLite. Δεν απαιτεί σύνδεση στο διαδίκτυο.
"""

import sys
import os
import unittest

# Ensure the project root is in the path
sys.path.insert(0, "/app/projects")

from db_manager import DatabaseManager


class TestDatabaseManagerDocuments(unittest.TestCase):
    """Tests για τη διαχείριση εγγράφων (documents table)."""

    def setUp(self):
        """Δημιουργία in-memory DB πριν από κάθε test."""
        self.db = DatabaseManager(db_path=":memory:")

    def tearDown(self):
        self.db.close()

    def test_insert_and_get_document(self):
        """Εισαγωγή εγγράφου και ανάκτησή του."""
        doc_id = self.db.insert_document(
            filename="τιμολόγιο_001.pdf",
            file_path="/tmp/τιμολόγιο_001.pdf",
            schema_name="invoice_schema"
        )
        self.assertIsInstance(doc_id, int)
        self.assertGreater(doc_id, 0)

        doc = self.db.get_document(doc_id)
        self.assertIsNotNone(doc)
        self.assertEqual(doc["filename"], "τιμολόγιο_001.pdf")
        self.assertEqual(doc["status"], "Pending")
        self.assertEqual(doc["schema_name"], "invoice_schema")

    def test_update_document_status(self):
        """Ενημέρωση status εγγράφου."""
        doc_id = self.db.insert_document(filename="doc_002.pdf")
        self.db.update_document_status(doc_id, "Processed", '{"afm": "123456789"}')

        doc = self.db.get_document(doc_id)
        self.assertEqual(doc["status"], "Processed")
        self.assertIn("afm", doc["result_json"])

    def test_delete_document(self):
        """Διαγραφή εγγράφου."""
        doc_id = self.db.insert_document(filename="temp_doc.pdf")
        self.db.delete_document(doc_id)

        doc = self.db.get_document(doc_id)
        self.assertIsNone(doc)

    def test_list_documents(self):
        """Λίστα εγγράφων, με και χωρίς φίλτρο status."""
        self.db.insert_document(filename="a.pdf")
        doc_b = self.db.insert_document(filename="b.pdf")
        self.db.update_document_status(doc_b, "Review")

        all_docs = self.db.list_documents()
        self.assertEqual(len(all_docs), 2)

        pending = self.db.list_documents(status="Pending")
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]["filename"], "a.pdf")

        review = self.db.list_documents(status="Review")
        self.assertEqual(len(review), 1)

    def test_get_nonexistent_document(self):
        """Ανάκτηση μη-υπαρκτού εγγράφου επιστρέφει None."""
        doc = self.db.get_document(99999)
        self.assertIsNone(doc)

    def test_document_status_review(self):
        """Ορισμός status σε 'Needs Human Review'."""
        doc_id = self.db.insert_document(filename="suspect.pdf")
        self.db.update_document_status(doc_id, "Needs Human Review")
        doc = self.db.get_document(doc_id)
        self.assertEqual(doc["status"], "Needs Human Review")


class TestDatabaseManagerSettings(unittest.TestCase):
    """Tests για τις ρυθμίσεις χρήστη (settings table)."""

    def setUp(self):
        self.db = DatabaseManager(db_path=":memory:")

    def tearDown(self):
        self.db.close()

    def test_set_and_get_string_setting(self):
        self.db.set_setting("language", "el")
        val = self.db.get_setting("language")
        self.assertEqual(val, "el")

    def test_set_and_get_dict_setting(self):
        config = {"theme": "dark", "page_size": "A4"}
        self.db.set_setting("ui_config", config)
        val = self.db.get_setting("ui_config")
        self.assertEqual(val["theme"], "dark")

    def test_get_missing_setting_returns_default(self):
        val = self.db.get_setting("nonexistent_key", default="fallback")
        self.assertEqual(val, "fallback")

    def test_upsert_setting(self):
        """Ενημέρωση υπάρχουσας ρύθμισης (upsert)."""
        self.db.set_setting("output_dir", "/tmp/old")
        self.db.set_setting("output_dir", "/tmp/new")
        val = self.db.get_setting("output_dir")
        self.assertEqual(val, "/tmp/new")


class TestDatabaseManagerTemplates(unittest.TestCase):
    """Tests για τα templates εξαγωγής πεδίων."""

    def setUp(self):
        self.db = DatabaseManager(db_path=":memory:")

    def tearDown(self):
        self.db.close()

    def test_save_and_get_template(self):
        fields = [
            {"name": "ΑΦΜ", "type": "string"},
            {"name": "Σύνολο ΦΠΑ", "type": "number"},
            {"name": "Ημερομηνία", "type": "date"},
        ]
        self.db.save_template("invoice_v1", fields)
        tmpl = self.db.get_template("invoice_v1")
        self.assertIsNotNone(tmpl)
        self.assertEqual(tmpl["name"], "invoice_v1")
        self.assertEqual(len(tmpl["fields"]), 3)
        self.assertEqual(tmpl["fields"][0]["name"], "ΑΦΜ")

    def test_list_templates(self):
        self.db.save_template("schema_a", [{"name": "x", "type": "string"}])
        self.db.save_template("schema_b", [{"name": "y", "type": "number"}])
        templates = self.db.list_templates()
        self.assertEqual(len(templates), 2)

    def test_get_nonexistent_template(self):
        tmpl = self.db.get_template("does_not_exist")
        self.assertIsNone(tmpl)

    def test_upsert_template(self):
        """Ενημέρωση υπάρχοντος template."""
        self.db.save_template("schema_v1", [{"name": "A", "type": "string"}])
        self.db.save_template("schema_v1", [{"name": "B", "type": "number"}])
        tmpl = self.db.get_template("schema_v1")
        self.assertEqual(tmpl["fields"][0]["name"], "B")


class TestDatabaseManagerContextManager(unittest.TestCase):
    """Test χρήσης ως context manager."""

    def test_context_manager(self):
        with DatabaseManager(db_path=":memory:") as db:
            doc_id = db.insert_document(filename="ctx_test.pdf")
            doc = db.get_document(doc_id)
            self.assertIsNotNone(doc)
        # Μετά το with, η σύνδεση είναι κλειστή
        self.assertIsNone(db.conn)


if __name__ == "__main__":
    print("=" * 60)
    print("MODULE 1 - Unit Tests: DatabaseManager")
    print("=" * 60)

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    suite.addTests(loader.loadTestsFromTestCase(TestDatabaseManagerDocuments))
    suite.addTests(loader.loadTestsFromTestCase(TestDatabaseManagerSettings))
    suite.addTests(loader.loadTestsFromTestCase(TestDatabaseManagerTemplates))
    suite.addTests(loader.loadTestsFromTestCase(TestDatabaseManagerContextManager))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 60)
    if result.wasSuccessful():
        total = result.testsRun
        print(f"✅ ΕΠΙΤΥΧΙΑ: {total}/{total} tests πέρασαν!")
        print("✅ Module 1 είναι έτοιμο. Μπορούμε να προχωρήσουμε στο Module 2.")
    else:
        failures = len(result.failures) + len(result.errors)
        print(f"❌ ΑΠΟΤΥΧΙΑ: {failures} tests απέτυχαν.")
        sys.exit(1)
    print("=" * 60)
