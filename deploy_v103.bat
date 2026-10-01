@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\fastwrite-project
echo.
echo  v103 = POLITIKI APORRITOU v2.1 (ellinika) sto /legal/privacy, i v1.2 (EN) menei sto /legal/privacy-en.
echo         MONO selides tou site - KAMIA allagi efarmogis/server/vasis. O voithos MENEI KRYFOS.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/3] Deiktes pou PREPEI na yparxoun...
findstr /c:"<html lang=\"el\">" site\legal\privacy.html >nul
if errorlevel 1 goto nm
findstr /c:"id=\"aa8\"" site\legal\privacy.html >nul
if errorlevel 1 goto nm
findstr /c:"Anthropic PBC" site\legal\privacy.html >nul
if errorlevel 1 goto nm
findstr /c:"/legal/privacy-en" site\legal\privacy.html >nul
if errorlevel 1 goto nm
findstr /c:"Notice (1 October 2026)" site\legal\privacy-en.html >nul
if errorlevel 1 goto nm
findstr /c:"var AG_PUBLIC = false;" site\kostometro\app.js >nul
if errorlevel 1 goto nm
echo    OK

echo [2/3] Frouroi + apodeixeis metallaxis...
node tests\legal_v21.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8) do (
  node tests\legal_v21.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
echo    OK

echo [3/3] Staging kai push...
git add site\legal\privacy.html site\legal\privacy-en.html tools\build_privacy.py tests\legal_v21.test.mjs deploy_v103.bat commit_v103.txt
if errorlevel 1 goto failed
git commit -F commit_v103.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo ================================
echo.
pause
exit /b 0

:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike. ******** & echo.
pause
exit /b 1
:mf
echo. & echo  ******** APODEIXI METALLAXIS APETYXE. ******** & echo.
pause
exit /b 1
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE. ******** & echo.
pause
exit /b 1
