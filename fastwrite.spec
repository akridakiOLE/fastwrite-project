# -*- mode: python ; coding: utf-8 -*-
"""
FastWrite Desktop — PyInstaller spec file (Phase 4)
====================================================

Build:
    venv\Scripts\activate
    pyinstaller fastwrite.spec --clean --noconfirm

Output:
    dist/FastWrite/FastWrite.exe   (onedir mode, faster startup)

Design decisions:
- onedir mode (όχι onefile) — γρηγορότερο startup, ευκολότερο debugging.
  Στο launch μπορούμε να ψεκάσουμε το ολόκληρο dist/FastWrite/ folder σαν ZIP.
- console=False — δεν θέλουμε μαύρο cmd window να ανοίγει μαζί.
- Embedded assets: static/, license_pubkey.pem.
- Excluded: tests, secrets/, venv/, build artifacts.
- Hidden imports: google-genai και τα submodules του, pdfplumber backends,
  cryptography rust bindings, bcrypt native.
"""

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules, collect_data_files, collect_all

# ── Project root ──────────────────────────────────────────────────────────
PROJECT_ROOT = Path(SPECPATH).resolve()

# ── Data files να ενσωματωθούν στο binary ────────────────────────────────
# Format: (source_path_on_disk, destination_path_inside_bundle)
datas = [
    (str(PROJECT_ROOT / "static"), "static"),
    (str(PROJECT_ROOT / "license_pubkey.pem"), "."),
]

# ── Binaries placeholder (γεμίζει από collect_all για numpy/pandas) ────
binaries = []

# ── Hidden imports (modules που το PyInstaller δεν εντοπίζει αυτόματα) ──
hiddenimports = []

# NumPy 2.x έχει αναδιαρθρωμένο _core/ και το standard hook δεν πιάνει
# όλα τα C extensions (π.χ. numpy._core._exceptions). Το collect_all
# εξασφαλίζει ότι κατεβαίνει ολόκληρο το package.
_numpy_datas, _numpy_binaries, _numpy_hiddenimports = collect_all("numpy")
datas += _numpy_datas
binaries += _numpy_binaries
hiddenimports += _numpy_hiddenimports

# Pandas εξαρτάται από numpy και έχει επίσης C extensions/cython modules.
_pandas_datas, _pandas_binaries, _pandas_hiddenimports = collect_all("pandas")
datas += _pandas_datas
binaries += _pandas_binaries
hiddenimports += _pandas_hiddenimports

# Google Gemini SDK — collect όλα τα submodules
hiddenimports += collect_submodules("google.genai")
hiddenimports += collect_submodules("google.api_core")
hiddenimports += collect_submodules("google.auth")

# pdfplumber dependencies
hiddenimports += [
    "pdfminer.high_level",
    "pdfminer.layout",
    "pdfminer.pdfdocument",
    "pdfminer.pdfinterp",
    "pdfminer.pdfpage",
    "pdfminer.pdfparser",
    "pdfminer.psparser",
    "pdfminer.utils",
]

# cryptography native bindings
hiddenimports += [
    "cryptography.hazmat.bindings._rust",
    "cryptography.hazmat.backends.openssl",
]

# bcrypt
hiddenimports += ["bcrypt._bcrypt"]

# Flask
hiddenimports += collect_submodules("flask")
hiddenimports += collect_submodules("werkzeug")

# pywebview — Windows backend (Edge WebView2)
hiddenimports += [
    "webview.platforms.winforms",
    "webview.platforms.edgechromium",
]

# Project's own modules — τα κάνουμε explicit για ασφάλεια
hiddenimports += [
    "main_api",
    "db_manager",
    "auth_manager",
    "key_manager",
    "file_processor",
    "schema_builder",
    "validator",
    "exporter",
    "ai_extractor",
    "batch_processor",
    "billing_manager",
    "license_manager",
    "email_service",
]

# ── Data files από third-party packages (templates κτλ.) ─────────────────
datas += collect_data_files("google.genai")
datas += collect_data_files("pdfplumber")
datas += collect_data_files("pypdfium2")

# ── Excludes — αρχεία/modules που ΔΕΝ θέλουμε στο build ──────────────────
excludes = [
    # Testing frameworks
    "pytest",
    "_pytest",
    "unittest.mock",  # ΔΕΝ εξαιρούμε όλο το unittest, μόνο mock
    # GUI frameworks που δεν χρησιμοποιούμε
    "tkinter",
    "PyQt5",
    "PyQt6",
    "PySide2",
    "PySide6",
    # Jupyter / IPython (αν τυχόν εγκαταστάθηκαν transitively)
    "IPython",
    "jupyter",
    "notebook",
    # Heavy ML libs που δεν χρειαζόμαστε
    "torch",
    "tensorflow",
    "sklearn",
    # Matplotlib (δεν έχουμε plots)
    "matplotlib",
]

# ── Analysis ──────────────────────────────────────────────────────────────
a = Analysis(
    [str(PROJECT_ROOT / "desktop" / "main.py")],
    pathex=[str(PROJECT_ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

# Αφαιρούμε διπλοεγγραφές (μειώνει μέγεθος)
pyz = PYZ(a.pure, a.zipped_data, cipher=None)

# ── Executable ────────────────────────────────────────────────────────────
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="FastWrite",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,                # UPX compression OFF — διευκολύνει το antivirus reputation
    console=False,            # Final: κανένα μαύρο cmd window — μόνο pywebview
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(PROJECT_ROOT / "icon.ico") if (PROJECT_ROOT / "icon.ico").exists() else None,
    version=str(PROJECT_ROOT / "version_info.txt") if (PROJECT_ROOT / "version_info.txt").exists() else None,
)

# ── Collect σε onedir bundle ──────────────────────────────────────────────
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="FastWrite",
)
