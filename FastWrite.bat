@echo off
REM FastWrite Desktop launcher (Phase 1 PoC)
REM Double-click για άνοιγμα της εφαρμογής
REM Place a shortcut to this file on your Desktop for one-click launch

cd /d "%~dp0"
call venv\Scripts\activate.bat
python desktop\main.py
