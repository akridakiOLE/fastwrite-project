@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  PINAKAS ELEGXOU - 4 veltioseis
echo    D4 palia paketa EFYGAN . D2 eikonidio imerologiou ORATO
echo    D1 fragma ekkinisis (telos to anavosvima) . D3 selidopoiisi KATA KLEIDI
echo  KAMIA metavasi vasis.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
findstr /c:"data-gate" site\pinakas\index.html >nul
if errorlevel 1 goto nm
findstr /c:"calendar-picker-indicator" site\pinakas\index.html >nul
if errorlevel 1 goto nm
findstr /c:"function accN" site\pinakas\app.js >nul
if errorlevel 1 goto nm
findstr /c:"a.rowid < ?" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"pk-v4" site\pinakas\sw.js >nul
if errorlevel 1 goto nm
echo    OK - 5 deiktes.

echo [2/5] Deiktes pou PREPEI na leipoun...
findstr /c:"id=\"f-plans\"" site\pinakas\index.html >nul
if not errorlevel 1 goto lo
findstr /c:"id=\"g-plan\"" site\pinakas\index.html >nul
if not errorlevel 1 goto lo
findstr /c:"ORDER BY a.created DESC LIMIT ? OFFSET ?" src\km.js >nul
if not errorlevel 1 goto lo
echo    OK

echo [3/5] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
node --check site\pinakas\app.js
if errorlevel 1 goto failed
node --check site\pinakas\sw.js
if errorlevel 1 goto failed
echo    OK

echo [4/5] Oles oi souites + apodeixeis metallaxis...
for %%T in (ref pinakas h11b mail cleanup feedback) do (
  node --experimental-sqlite tests\%%T.test.mjs
  if errorlevel 1 goto tf
)
node tests\ref_ui.test.mjs
if errorlevel 1 goto tf
node tests\pinakas_ui.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10) do (
  node --experimental-sqlite tests\ref.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15) do (
  node tests\ref_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6) do (
  node tests\pinakas_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\pinakas.test.mjs --mutate
if errorlevel 1 goto mf
node --experimental-sqlite tests\h11b.test.mjs --mutate
if errorlevel 1 goto mf
echo    OK

echo [5/5] Staging kai push...
git add src\km.js site\pinakas\index.html site\pinakas\app.js site\pinakas\sw.js
if errorlevel 1 goto failed
git add tests\pinakas.test.mjs tests\pinakas_ui.test.mjs
if errorlevel 1 goto failed
git add deploy_pinakas.bat commit_pinakas.txt
if errorlevel 1 goto failed
git commit -F commit_pinakas.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo   D1: anoixe ton /pinakas/ APO TO EIKONIDIO (PWA), oxi apo karte,la
echo       -^> KAMIA othoni kleidiou den prepei na anavosvisei.
echo   D2: patise MESA sto pedio imerominias -^> anoigei to imerologio.
echo   D3: "Ki allous" me 1.240 logariasmous -^> i teleftaia selida
echo       prepei na erxetai oso grigora oso i proti.
echo   D4: kamia mpara "syndromes ana plano", kanena filtro "Plano".
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
:lo
echo    Epezise PALIOS deiktis (paketa i OFFSET).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
