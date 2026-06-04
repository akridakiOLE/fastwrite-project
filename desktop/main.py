"""
FastWrite Desktop Launcher (Phase 1 PoC)

Εκκινεί το Flask backend τοπικά και ανοίγει native παράθυρο μέσω pywebview.
Στόχος: να επιβεβαιώσουμε ότι όλη η FastWrite ροή δουλεύει σε desktop app,
χωρίς να αγγίξουμε το web app στο production.

Τρέξιμο:
    cd C:\\Users\\User\\fastwrite-project
    venv\\Scripts\\python desktop\\main.py

Πρώτη φορά:
    - Δημιουργείται %APPDATA%\\FastWrite\\ με υποφακέλους
    - Κενή βάση δεδομένων σε %APPDATA%\\FastWrite\\data\\app.db
    - Πρέπει να έχεις βάλει Gemini API key στο %APPDATA%\\FastWrite\\secrets\\
"""
import os
import sys
import socket
import threading
import time
import logging
from pathlib import Path

# ── Logging για debugging ─────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("fastwrite-desktop")


# ── Setup application data folder (ΠΡΙΝ από import του main_api) ─────────
def setup_app_data_dir() -> Path:
    """Δημιουργεί τον φάκελο εφαρμογής στο %APPDATA% (Windows) / Library (Mac) / .local/share (Linux)."""
    if sys.platform == "win32":
        base = Path(os.environ["APPDATA"]) / "FastWrite"
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "FastWrite"
    else:
        base = Path.home() / ".local" / "share" / "FastWrite"

    base.mkdir(parents=True, exist_ok=True)
    for sub in ("data", "secrets", "uploads", "processed", "exports", "logs"):
        (base / sub).mkdir(exist_ok=True)
    return base


APP_DATA = setup_app_data_dir()
log.info("App data folder: %s", APP_DATA)


def _setup_file_logging(base: Path) -> None:
    """Diagnostics για το frozen .exe (windowed → stdout/stderr κρυμμένα).
    Γράφει logs + crashes σε αρχεία ώστε να διαγιγνώσκουμε .exe-only bugs
    (π.χ. το approve 'Failed to fetch'). No-op-safe σε κάθε αποτυχία."""
    import faulthandler
    import datetime as _dt
    from logging.handlers import RotatingFileHandler

    logs_dir = base / "logs"
    logs_dir.mkdir(exist_ok=True)

    # 1) Root logger → rotating file (πιάνει logging.* + werkzeug logs/tracebacks)
    try:
        fh = RotatingFileHandler(logs_dir / "fastwrite.log",
                                 maxBytes=2_000_000, backupCount=3, encoding="utf-8")
        fh.setLevel(logging.INFO)
        fh.setFormatter(logging.Formatter(
            "[%(asctime)s] %(levelname)s %(name)s: %(message)s"))
        root = logging.getLogger()
        root.setLevel(logging.INFO)
        root.addHandler(fh)
    except Exception:
        pass

    # 2) Redirect stdout/stderr → αρχείο (πιάνει print() π.χ. [APPROVE] +
    #    werkzeug tracebacks). Σε windowed .exe το sys.stdout/err είναι None.
    try:
        _stream = open(logs_dir / "stdio.log", "a", buffering=1, encoding="utf-8")
        sys.stdout = _stream
        sys.stderr = _stream
    except Exception:
        pass

    # 3) faulthandler → hard crashes / native segfaults (πιθανό αίτιο του
    #    "Failed to fetch": connection drop χωρίς HTTP response).
    try:
        _crash = open(logs_dir / "crash.log", "a", encoding="utf-8")
        _crash.write(f"\n=== session {_dt.datetime.now().isoformat()} ===\n")
        _crash.flush()
        faulthandler.enable(file=_crash, all_threads=True)
    except Exception:
        pass

    # 4) Uncaught exceptions (main thread + worker threads) → log με traceback
    def _hook(exc_type, exc, tb):
        logging.getLogger("uncaught").error("Uncaught exception",
                                            exc_info=(exc_type, exc, tb))
    sys.excepthook = _hook
    if hasattr(threading, "excepthook"):
        def _thook(args):
            logging.getLogger("uncaught.thread").error(
                "Uncaught thread exception",
                exc_info=(args.exc_type, args.exc_value, args.exc_traceback))
        threading.excepthook = _thook

    log.info("File logging enabled → %s", logs_dir / "fastwrite.log")


_setup_file_logging(APP_DATA)

# Set env var ΠΡΙΝ να γίνει import το main_api — αλλιώς πιάνει το παλιό /app/projects default
os.environ["FASTWRITE_BASE_DIR"] = str(APP_DATA)
# Phase 2: μαρκάρει mode = desktop ώστε το main_api να ενεργοποιήσει license enforcement
os.environ["FASTWRITE_MODE"] = "desktop"

# Προσθήκη του project root στο sys.path για να βρει τα modules
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# ── Εκκίνηση Flask σε background thread ──────────────────────────────────
def find_free_port() -> int:
    """Βρίσκει διαθέσιμη θύρα στο localhost."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for_server(host: str, port: int, timeout: float = 10.0) -> bool:
    """Περιμένει να σηκωθεί το Flask server. Επιστρέφει True αν συνδεθεί."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.2)
    return False


def run_flask(port: int) -> None:
    """Τρέχει το Flask app σε background thread."""
    # Το import γίνεται εδώ μέσα για να μην μπλοκάρει το start-up
    from main_api import app
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False, threaded=True)


# ── Main entry point ──────────────────────────────────────────────────────
def main() -> None:
    port = find_free_port()
    url = f"http://127.0.0.1:{port}/ui"
    log.info("Starting Flask backend on %s", url)

    flask_thread = threading.Thread(target=run_flask, args=(port,), daemon=True)
    flask_thread.start()

    if not wait_for_server("127.0.0.1", port, timeout=15.0):
        log.error("Flask δεν ξεκίνησε εντός 15 δευτερολέπτων. Έλεγξε τα logs.")
        sys.exit(1)

    log.info("Flask ξεκίνησε. Άνοιγμα native παραθύρου...")

    # Import pywebview εδώ ώστε να σπάσει με σαφές μήνυμα αν λείπει
    try:
        import webview
    except ImportError:
        log.error("Το pywebview δεν είναι εγκατεστημένο. Τρέξε: pip install -r requirements-desktop.txt")
        sys.exit(1)

    webview.create_window(
        title="FastWrite — AI Document Extractor",
        url=url,
        width=1400,
        height=900,
        min_size=(1024, 700),
        resizable=True,
    )
    webview.start()


if __name__ == "__main__":
    main()
