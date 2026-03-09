"""
Module 3: Μηχανισμός Ingestion & Προεπεξεργασίας Αρχείων
Δέχεται PDF, PNG, JPEG αρχεία.
Τα PDF μετατρέπονται σε εικόνες υψηλής ανάλυσης (300 DPI) μέσω PyMuPDF.
Οι εικόνες επιστρέφονται ως λίστα Path objects έτοιμα για το AI module.
"""

import shutil
from pathlib import Path
from typing import List
from dataclasses import dataclass, field
from datetime import datetime

try:
    import pypdfium2 as pdfium
    PYPDFIUM2_AVAILABLE = True
except ImportError:
    PYPDFIUM2_AVAILABLE = False

try:
    from PIL import Image
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False


# ── Constants ────────────────────────────────────────────────────────────────
SUPPORTED_IMAGE_FORMATS = {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}
SUPPORTED_FORMATS       = {".pdf"} | SUPPORTED_IMAGE_FORMATS
DEFAULT_DPI             = 300
DEFAULT_OUTPUT_DIR      = Path("/app/projects/processed")


@dataclass
class ProcessedFile:
    """Αποτέλεσμα επεξεργασίας ενός αρχείου."""
    original_path : Path
    output_dir    : Path
    pages         : List[Path] = field(default_factory=list)
    page_count    : int        = 0
    file_type     : str        = ""          # "pdf" | "image"
    status        : str        = "pending"   # "ok" | "error"
    error_message : str        = ""
    processed_at  : str        = ""

    def is_ok(self) -> bool:
        return self.status == "ok"


class FileProcessor:
    """
    Κύριο υποσύστημα επεξεργασίας αρχείων.

    Υποστηριζόμενες λειτουργίες:
      - PDF  → λίστα PNG εικόνων ανά σελίδα (300 DPI)
      - PNG / JPEG / κ.λπ. → αντιγραφή/κανονικοποίηση στον output dir
    """

    def __init__(self, output_dir: Path = None, dpi: int = DEFAULT_DPI):
        self.output_dir = Path(output_dir) if output_dir else DEFAULT_OUTPUT_DIR
        self.dpi = dpi
        self.output_dir.mkdir(parents=True, exist_ok=True)

    # ── Public ───────────────────────────────────────────────────────────────

    def process(self, file_path: str | Path) -> ProcessedFile:
        """
        Επεξεργασία αρχείου. Επιστρέφει ProcessedFile με λίστα εικόνων.
        :param file_path: Διαδρομή στο αρχείο εισόδου
        """
        path = Path(file_path)
        result = ProcessedFile(
            original_path=path,
            output_dir=self.output_dir,
        )

        # ── Έλεγχοι εισόδου ─────────────────────────────────────────────────
        if not path.exists():
            return self._error(result, f"Το αρχείο δεν βρέθηκε: {path}")

        suffix = path.suffix.lower()
        if suffix not in SUPPORTED_FORMATS:
            return self._error(result,
                f"Μη υποστηριζόμενη μορφή: '{suffix}'. "
                f"Αποδεκτά: {sorted(SUPPORTED_FORMATS)}")

        # ── Δρομολόγηση ──────────────────────────────────────────────────────
        try:
            if suffix == ".pdf":
                return self._process_pdf(path, result)
            else:
                return self._process_image(path, result)
        except Exception as e:
            return self._error(result, str(e))

    def process_batch(self, file_paths: List[str | Path]) -> List[ProcessedFile]:
        """Επεξεργασία λίστας αρχείων."""
        return [self.process(p) for p in file_paths]

    # ── PDF Processing ───────────────────────────────────────────────────────

    def _process_pdf(self, path: Path, result: ProcessedFile) -> ProcessedFile:
        """Μετατροπή PDF → PNG εικόνες ανά σελίδα (via pypdfium2)."""
        if not PYPDFIUM2_AVAILABLE:
            return self._error(result,
                "Η βιβλιοθήκη pypdfium2 δεν είναι εγκατεστημένη. "
                "Εκτέλεσε: pip install pypdfium2")

        result.file_type = "pdf"
        job_dir = self._make_job_dir(path)

        doc = pdfium.PdfDocument(str(path))
        try:
            scale = self.dpi / 72.0   # 72 DPI είναι το default του PDF

            for page_num in range(len(doc)):
                page   = doc[page_num]
                bitmap = page.render(scale=scale, rotation=0)
                pil_img = bitmap.to_pil()

                out_file = job_dir / f"page_{page_num + 1:04d}.png"
                pil_img.save(str(out_file), format="PNG")
                result.pages.append(out_file)
        finally:
            doc.close()

        result.page_count   = len(result.pages)
        result.status       = "ok"
        result.processed_at = datetime.utcnow().isoformat()
        return result

    # ── Image Processing ─────────────────────────────────────────────────────

    def _process_image(self, path: Path, result: ProcessedFile) -> ProcessedFile:
        """Κανονικοποίηση εικόνας → PNG στον output dir."""
        result.file_type = "image"

        job_dir  = self._make_job_dir(path)
        out_file = job_dir / f"{path.stem}.png"

        if PILLOW_AVAILABLE:
            # Μετατροπή σε RGB PNG (αφαίρεση alpha channel αν χρειάζεται)
            with Image.open(path) as img:
                if img.mode not in ("RGB", "L"):
                    img = img.convert("RGB")
                img.save(str(out_file), format="PNG")
        else:
            # Fallback: απλή αντιγραφή αν δεν υπάρχει Pillow
            shutil.copy2(path, out_file)

        result.pages        = [out_file]
        result.page_count   = 1
        result.status       = "ok"
        result.processed_at = datetime.utcnow().isoformat()
        return result

    # ── Utilities ────────────────────────────────────────────────────────────

    def _make_job_dir(self, source_path: Path) -> Path:
        """Δημιουργεί μοναδικό υποφάκελο για κάθε αρχείο που επεξεργαζόμαστε."""
        ts      = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
        job_dir = self.output_dir / f"{source_path.stem}_{ts}"
        job_dir.mkdir(parents=True, exist_ok=True)
        return job_dir

    @staticmethod
    def _error(result: ProcessedFile, message: str) -> ProcessedFile:
        result.status        = "error"
        result.error_message = message
        result.processed_at  = datetime.utcnow().isoformat()
        return result

    @staticmethod
    def get_supported_formats() -> set:
        return SUPPORTED_FORMATS.copy()
