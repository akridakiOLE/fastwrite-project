@echo off
REM ========================================================================
REM FastWrite Desktop — Windows Build Script (Phase 4)
REM ========================================================================
REM Double-click ή τρέξε από VS Code terminal:
REM    .\build_desktop.bat
REM
REM Output:
REM    dist\FastWrite\FastWrite.exe   (μαζί με όλα τα dependencies)
REM ========================================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo [1/6] Activate virtual environment...
if not exist "venv\Scripts\activate.bat" (
    echo ERROR: venv\Scripts\activate.bat not found.
    echo Run: python -m venv venv ^&^& venv\Scripts\activate ^&^& pip install -r requirements-desktop.txt
    exit /b 1
)
call venv\Scripts\activate.bat

echo.
echo [2/6] Verify PyInstaller is installed...
python -c "import PyInstaller; print('PyInstaller', PyInstaller.__version__)" 2>nul
if errorlevel 1 (
    echo PyInstaller missing. Installing...
    pip install pyinstaller==6.11.0
    if errorlevel 1 (
        echo ERROR: pip install pyinstaller failed.
        exit /b 1
    )
)

echo.
echo [3/6] Clean previous build artifacts...
if exist "build" rmdir /s /q build
if exist "dist" rmdir /s /q dist

echo.
echo [4/6] py_compile sanity check on critical modules...
python -m py_compile main_api.py desktop\main.py license_manager.py perf_config.py file_processor.py ai_extractor.py batch_processor.py db_manager.py
if errorlevel 1 (
    echo ERROR: py_compile failed. Fix syntax errors before building.
    exit /b 1
)

echo.
echo [5/6] Run PyInstaller (this takes 2-5 minutes)...
pyinstaller fastwrite.spec --clean --noconfirm
if errorlevel 1 (
    echo ERROR: PyInstaller build failed.
    exit /b 1
)

echo.
echo [6/6] Copy bundled sample invoices (Samples\ next to FastWrite.exe)...
xcopy /y /i /q samples dist\FastWrite\Samples\
if errorlevel 1 (
    echo ERROR: copying samples failed.
    exit /b 1
)
copy /y FastWrite_Quick_Start_Guide.pdf dist\FastWrite\ >nul
if errorlevel 1 (
    echo ERROR: copying quick start guide failed.
    exit /b 1
)

echo.
echo ========================================================================
echo BUILD COMPLETE
echo ========================================================================
echo.
echo Output folder:   dist\FastWrite\
echo Executable:      dist\FastWrite\FastWrite.exe
echo.
echo Smoke test:
echo    1. Make sure %%APPDATA%%\FastWrite\secrets\gemini.key exists
echo    2. Double-click dist\FastWrite\FastWrite.exe
echo    3. The pywebview window should open with the FastWrite UI
echo.
echo To distribute, ZIP the entire dist\FastWrite\ folder.
echo.
endlocal
