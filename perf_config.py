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
