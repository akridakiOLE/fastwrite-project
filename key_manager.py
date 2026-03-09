"""
Module 2: Ασφαλής Διαχείριση BYOK (Bring Your Own Key)
Κρυπτογραφεί και αποθηκεύει τοπικά το Google Gemini API Key.
Χρησιμοποιεί Fernet symmetric encryption (βιβλιοθήκη: cryptography).
Το κλειδί κρυπτογράφησης παράγεται από το μηχάνημα (machine key) και
αποθηκεύεται σε αρχείο με περιορισμένα permissions (chmod 600).
"""

import os
import json
from pathlib import Path
from cryptography.fernet import Fernet


# ── Paths ────────────────────────────────────────────────────────────────────
DEFAULT_KEY_DIR   = Path("/app/projects/secrets")
MACHINE_KEY_FILE  = DEFAULT_KEY_DIR / ".machine.key"
ENCRYPTED_API_FILE = DEFAULT_KEY_DIR / ".api_keys.enc"


class KeyManager:
    """
    Διαχείριση κρυπτογραφημένης αποθήκευσης API keys.

    Ροή:
      1. Κατά την πρώτη εκτέλεση παράγεται ένα Fernet key (machine key)
         και αποθηκεύεται με chmod 600.
      2. Κάθε API key κρυπτογραφείται με αυτό το machine key.
      3. Τα κρυπτογραφημένα keys αποθηκεύονται σε JSON αρχείο.
    """

    def __init__(self, key_dir: Path = None):
        self.key_dir = Path(key_dir) if key_dir else DEFAULT_KEY_DIR
        self.machine_key_file  = self.key_dir / ".machine.key"
        self.encrypted_api_file = self.key_dir / ".api_keys.enc"

        self.key_dir.mkdir(parents=True, exist_ok=True)
        self._fernet = Fernet(self._load_or_create_machine_key())

    # ── Machine Key ──────────────────────────────────────────────────────────

    def _load_or_create_machine_key(self) -> bytes:
        """
        Φορτώνει το machine key από δίσκο ή δημιουργεί νέο αν δεν υπάρχει.
        Αποθηκεύεται με permissions 600 (μόνο ο owner μπορεί να διαβάσει).
        """
        if self.machine_key_file.exists():
            return self.machine_key_file.read_bytes().strip()

        # Δημιουργία νέου Fernet key
        new_key = Fernet.generate_key()
        self.machine_key_file.write_bytes(new_key)

        # Περιορισμός permissions: μόνο ο owner
        os.chmod(self.machine_key_file, 0o600)
        return new_key

    # ── Encrypt / Decrypt ────────────────────────────────────────────────────

    def encrypt(self, plaintext: str) -> str:
        """Κρυπτογράφηση string → επιστρέφει base64 string."""
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, token: str) -> str:
        """Αποκρυπτογράφηση base64 string → επιστρέφει plaintext."""
        return self._fernet.decrypt(token.encode()).decode()

    # ── Storage ──────────────────────────────────────────────────────────────

    def _load_store(self) -> dict:
        """Φορτώνει το JSON αρχείο με τα κρυπτογραφημένα keys."""
        if not self.encrypted_api_file.exists():
            return {}
        try:
            return json.loads(self.encrypted_api_file.read_text())
        except (json.JSONDecodeError, IOError):
            return {}

    def _save_store(self, store: dict):
        """Αποθηκεύει το JSON αρχείο με permissions 600."""
        self.encrypted_api_file.write_text(json.dumps(store, indent=2))
        os.chmod(self.encrypted_api_file, 0o600)

    # ── Public API ───────────────────────────────────────────────────────────

    def save_key(self, service: str, api_key: str):
        """
        Αποθηκεύει κρυπτογραφημένα το API key για τη δεδομένη υπηρεσία.
        :param service: π.χ. 'gemini', 'openai'
        :param api_key: το plaintext API key
        """
        if not api_key or not api_key.strip():
            raise ValueError("Το API key δεν μπορεί να είναι κενό.")

        store = self._load_store()
        store[service] = self.encrypt(api_key.strip())
        self._save_store(store)

    def get_key(self, service: str) -> str:
        """
        Ανακτά και αποκρυπτογραφεί το API key για τη δεδομένη υπηρεσία.
        :raises KeyError: αν δεν υπάρχει το service
        :raises ValueError: αν η αποκρυπτογράφηση αποτύχει
        """
        store = self._load_store()
        if service not in store:
            raise KeyError(f"Δεν βρέθηκε API key για την υπηρεσία: '{service}'")
        try:
            return self.decrypt(store[service])
        except Exception as e:
            raise ValueError(f"Αποτυχία αποκρυπτογράφησης για '{service}': {e}")

    def delete_key(self, service: str):
        """Διαγράφει το αποθηκευμένο key για τη δεδομένη υπηρεσία."""
        store = self._load_store()
        if service not in store:
            raise KeyError(f"Δεν βρέθηκε API key για: '{service}'")
        del store[service]
        self._save_store(store)

    def list_services(self) -> list:
        """Επιστρέφει τη λίστα των υπηρεσιών που έχουν αποθηκευμένο key."""
        return list(self._load_store().keys())

    def has_key(self, service: str) -> bool:
        """Επιστρέφει True αν υπάρχει αποθηκευμένο key για τη δεδομένη υπηρεσία."""
        return service in self._load_store()

    def key_is_plaintext(self, service: str) -> bool:
        """
        Ελέγχει ότι το αποθηκευμένο token ΔΕΝ είναι plaintext.
        Χρησιμοποιείται για επαλήθευση ότι η κρυπτογράφηση δούλεψε.
        """
        store = self._load_store()
        if service not in store:
            return False
        # Αν το stored value είναι ίδιο με το original plaintext → πρόβλημα
        # Εδώ απλώς ελέγχουμε ότι δεν μοιάζει με plaintext key format
        stored = store[service]
        # Fernet tokens ξεκινάνε πάντα με 'gAAAAA'
        return not stored.startswith("gAAAAA")
