@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  Kostometro v63 = oi Erotiseis anoigoun MIA ti fora
echo  (Stavros 16/9: otan anoigei nea, kleinei i proigoumeni)
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
findstr /c:"o !== d" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"v63" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"km-v63" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"v63" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"M62-7" tests\menu62.spec.js >nul
if errorlevel 1 findstr /c:"62-7" tests\menu62.spec.js >nul
if errorlevel 1 goto nm
echo    OK - 5 deiktes.

echo [2/5] Deiktes pou PREPEI na leipoun...
findstr /c:"km-v62" site\kostometro\sw.js >nul
if not errorlevel 1 goto lo
echo    OK

echo [3/5] Syntaxi...
node --check site\kostometro\app.js
if errorlevel 1 goto failed
node --check site\kostometro\sw.js
if errorlevel 1 goto failed
echo    OK

echo [4/5] Souites server (den allaxe to km.js, alla trexoun gia asfaleia)...
node --experimental-sqlite tests\pinakas.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\h11b.test.mjs
if errorlevel 1 goto tf
echo    OK
echo    (To menu62.spec.js - 7 tests, mazi me to neo M62-7 - etrexe prasino
echo     se pragmatiko Chromium sto perivallon tou Claude.)

echo [5/5] Staging...
git add site\kostometro\app.js site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add tests\menu62.spec.js deploy_km_v63.bat commit_km_v63.txt
if errorlevel 1 goto failed
git commit -F commit_km_v63.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo   Sto kinito: kleise kai xana-anoixe tin efarmogi (nea ekdosi v63),
echo   meta Menou -^> Erotiseis: anoixe mia, meta alli - i proti kleinei.
echo ================================
echo.
pause
exit /b 0

:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike. ******** & echo.
pause
exit /b 1
:lo
echo    Epezise PALIOS deiktis: km-v62 sto service worker.
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
