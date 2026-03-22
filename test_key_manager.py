"""
Unit Tests - Module 2: KeyManager
Χρησιμοποιεί προσωρινό directory (tempfile). Χωρίς κλήσεις δικτύου.
"""

import sys
import unittest
import tempfile
import os
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, "/app/projects")

from key_manager import KeyManager


class TestKeyManagerEncryptDecrypt(unittest.TestCase):
    """Tests κρυπτογράφησης / αποκρυπτογράφησης."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.km = KeyManager(key_dir=self.tmp_dir)

    def test_encrypt_returns_different_value(self):
        """Το encrypted token ΔΕΝ πρέπει να ίδιο με το plaintext."""
        plaintext = "fake_key_123"
        token = self.km.encrypt(plaintext)
        self.assertNotEqual(token, plaintext)

    def test_decrypt_returns_original(self):
        """Κύκλος encrypt → decrypt επιστρέφει το αρχικό κείμενο."""
        plaintext = "fake_key_123"
        token = self.km.encrypt(plaintext)
        result = self.km.decrypt(token)
        self.assertEqual(result, plaintext)

    def test_fernet_token_format(self):
        """Τα Fernet tokens ξεκινούν πάντα με 'gAAAAA'."""
        token = self.km.encrypt("any_secret_value")
        self.assertTrue(token.startswith("gAAAAA"),
                        f"Μη έγκυρο Fernet format: {token[:10]}")

    def test_encrypt_unicode(self):
        """Κρυπτογράφηση Unicode κειμένου (π.χ. ελληνικά)."""
        plaintext = "κλειδί_δοκιμής_αβγδ_123"
        token = self.km.encrypt(plaintext)
        self.assertEqual(self.km.decrypt(token), plaintext)


class TestKeyManagerStorage(unittest.TestCase):
    """Tests αποθήκευσης / ανάκτησης keys από δίσκο."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.km = KeyManager(key_dir=self.tmp_dir)

    def test_save_and_get_key(self):
        """Αποθήκευση και ανάκτηση fake key."""
        self.km.save_key("gemini", "fake_key_123")
        retrieved = self.km.get_key("gemini")
        self.assertEqual(retrieved, "fake_key_123")

    def test_stored_value_is_not_plaintext(self):
        """Το αποθηκευμένο value δεν πρέπει να είναι plaintext."""
        fake_key = "fake_key_123"
        self.km.save_key("gemini", fake_key)

        # Διαβάζουμε απευθείας το αρχείο
        import json
        store_file = Path(self.tmp_dir) / ".api_keys.enc"
        store = json.loads(store_file.read_text())

        self.assertIn("gemini", store)
        # Το stored value ΔΕΝ πρέπει να περιέχει το plaintext
        self.assertNotEqual(store["gemini"], fake_key)
        self.assertNotIn("fake_key_123", store["gemini"])

    def test_stored_file_permissions(self):
        """Το αρχείο keys πρέπει να έχει permissions 600."""
        self.km.save_key("gemini", "fake_key_123")
        store_file = Path(self.tmp_dir) / ".api_keys.enc"
        mode = oct(os.stat(store_file).st_mode)[-3:]
        self.assertEqual(mode, "600", f"Λάθος permissions: {mode} (αναμένεται 600)")

    def test_machine_key_file_permissions(self):
        """Το machine key αρχείο πρέπει να έχει permissions 600."""
        machine_key = Path(self.tmp_dir) / ".machine.key"
        self.assertTrue(machine_key.exists())
        mode = oct(os.stat(machine_key).st_mode)[-3:]
        self.assertEqual(mode, "600", f"Λάθος permissions: {mode} (αναμένεται 600)")

    def test_key_persists_after_reload(self):
        """Το key επιβιώνει μετά από επανεκκίνηση του KeyManager."""
        self.km.save_key("gemini", "persistent_key_456")

        # Νέο instance, ίδιο directory → φορτώνει το ίδιο machine key
        km2 = KeyManager(key_dir=self.tmp_dir)
        retrieved = km2.get_key("gemini")
        self.assertEqual(retrieved, "persistent_key_456")

    def test_multiple_services(self):
        """Αποθήκευση keys για πολλαπλές υπηρεσίες."""
        self.km.save_key("gemini", "gemini_fake_key")
        self.km.save_key("openai", "openai_fake_key")

        self.assertEqual(self.km.get_key("gemini"), "gemini_fake_key")
        self.assertEqual(self.km.get_key("openai"), "openai_fake_key")

        services = self.km.list_services()
        self.assertIn("gemini", services)
        self.assertIn("openai", services)

    def test_delete_key(self):
        """Διαγραφή αποθηκευμένου key."""
        self.km.save_key("gemini", "fake_key_123")
        self.km.delete_key("gemini")
        self.assertFalse(self.km.has_key("gemini"))

    def test_overwrite_key(self):
        """Αντικατάσταση υπάρχοντος key."""
        self.km.save_key("gemini", "old_key")
        self.km.save_key("gemini", "new_key")
        self.assertEqual(self.km.get_key("gemini"), "new_key")


class TestKeyManagerErrorHandling(unittest.TestCase):
    """Tests διαχείρισης σφαλμάτων — χωρίς κλήσεις δικτύου."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.km = KeyManager(key_dir=self.tmp_dir)

    def test_get_nonexistent_key_raises(self):
        """Ανάκτηση key που δεν υπάρχει → KeyError."""
        with self.assertRaises(KeyError):
            self.km.get_key("nonexistent_service")

    def test_save_empty_key_raises(self):
        """Αποθήκευση κενού key → ValueError."""
        with self.assertRaises(ValueError):
            self.km.save_key("gemini", "")

    def test_save_whitespace_key_raises(self):
        """Αποθήκευση key από κενά → ValueError."""
        with self.assertRaises(ValueError):
            self.km.save_key("gemini", "   ")

    def test_delete_nonexistent_key_raises(self):
        """Διαγραφή key που δεν υπάρχει → KeyError."""
        with self.assertRaises(KeyError):
            self.km.delete_key("does_not_exist")

    def test_has_key_false_when_missing(self):
        """has_key επιστρέφει False για άγνωστη υπηρεσία."""
        self.assertFalse(self.km.has_key("unknown"))

    def test_has_key_true_after_save(self):
        """has_key επιστρέφει True μετά από save."""
        self.km.save_key("gemini", "fake_key_123")
        self.assertTrue(self.km.has_key("gemini"))

    @patch("key_manager.Fernet.decrypt", side_effect=Exception("Invalid token"))
    def test_corrupted_token_raises_value_error(self, mock_decrypt):
        """Κατεστραμμένο token → ValueError (mock, χωρίς δίκτυο)."""
        self.km.save_key("gemini", "fake_key_123")
        with self.assertRaises(ValueError):
            self.km.get_key("gemini")


if __name__ == "__main__":
    print("=" * 60)
    print("MODULE 2 - Unit Tests: KeyManager (BYOK)")
    print("=" * 60)

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    suite.addTests(loader.loadTestsFromTestCase(TestKeyManagerEncryptDecrypt))
    suite.addTests(loader.loadTestsFromTestCase(TestKeyManagerStorage))
    suite.addTests(loader.loadTestsFromTestCase(TestKeyManagerErrorHandling))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 60)
    if result.wasSuccessful():
        total = result.testsRun
        print(f"✅ ΕΠΙΤΥΧΙΑ: {total}/{total} tests πέρασαν!")
        print("✅ Module 2 είναι έτοιμο. Μπορούμε να προχωρήσουμε στο Module 3.")
    else:
        failures = len(result.failures) + len(result.errors)
        print(f"❌ ΑΠΟΤΥΧΙΑ: {failures} tests απέτυχαν.")
        sys.exit(1)
    print("=" * 60)
