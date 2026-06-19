"""
perf_config.py — runtime performance settings (worker count, etc.).

Values are read from a small JSON file in the app data dir so they take effect
at RUNTIME (no rebuild, no restart needed) and can later be driven by the UI
Settings page ("Turbo mode").

File:  <BASE_DIR>/perf_settings.json     e.g.  {"max_workers": 16}
"""
import os
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_MAX_WORKERS = 8      # safe default (diag: ~2x over 4, no latency penalty)
_MIN_WORKERS, _MAX_WORKERS = 1, 64

DEFAULT_MODEL = "gemini-2.5-flash"   # accuracy-safe default
# Only models we have validated end-to-end. flash-lite: ~2x faster/call, cheaper;
# adopt as default ONLY after accuracy validation (see diag_benchmark).
_ALLOWED_MODELS = {"gemini-2.5-flash", "gemini-2.5-flash-lite"}

DEFAULT_DPI = 150   # validated: 100% accuracy == 300 DPI but ~5x faster render
# (diag_render_dpi: 300/200/150/100 all 100% on the 200-invoice benchmark; 150
# keeps margin for messy real-world scans). Render is the dominant pipeline wall.
_MIN_DPI, _MAX_DPI = 72, 600


def _settings_path() -> Path:
    base = Path(os.environ.get("FASTWRITE_BASE_DIR", "."))
    return base / "perf_settings.json"


def get_max_workers(default: int = DEFAULT_MAX_WORKERS) -> int:
    """Active worker count for parallel segmentation/extraction.

    Read fresh on every call, so editing perf_settings.json takes effect without
    restarting the app. Clamped to a sane range; falls back to default on any error.
    """
    try:
        p = _settings_path()
        if p.exists():
            cfg = json.loads(p.read_text(encoding="utf-8"))
            n = int(cfg.get("max_workers", default))
            return max(_MIN_WORKERS, min(n, _MAX_WORKERS))
    except Exception as e:
        logger.warning("[perf] failed to read max_workers (using %d): %s", default, e)
    return default


def get_model(default: str = DEFAULT_MODEL) -> str:
    """Active Gemini model for extraction.

    Read fresh on every call, so editing perf_settings.json ({"model": "..."})
    takes effect without rebuild/restart. Falls back to default if the file is
    missing, unreadable, or names a model not in the validated allow-list.
    """
    try:
        p = _settings_path()
        if p.exists():
            cfg = json.loads(p.read_text(encoding="utf-8"))
            m = str(cfg.get("model", default)).strip()
            if m in _ALLOWED_MODELS:
                return m
            if m:
                logger.warning("[perf] model %r not in allow-list; using %s", m, default)
    except Exception as e:
        logger.warning("[perf] failed to read model (using %s): %s", default, e)
    return default


def get_dpi(default: int = DEFAULT_DPI) -> int:
    """Active render DPI for PDF->PNG rasterisation.

    Read fresh on every call, so editing perf_settings.json ({"dpi": N}) takes
    effect without rebuild/restart. Clamped to a sane range; falls back to the
    default on any error. Explicit dpi passed to FileProcessor always wins.
    """
    try:
        p = _settings_path()
        if p.exists():
            cfg = json.loads(p.read_text(encoding="utf-8"))
            n = int(cfg.get("dpi", default))
            return max(_MIN_DPI, min(n, _MAX_DPI))
    except Exception as e:
        logger.warning("[perf] failed to read dpi (using %d): %s", default, e)
    return default
