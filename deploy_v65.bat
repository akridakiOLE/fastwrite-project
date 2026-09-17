@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v65 = O KODIKOS SYSTASIS ANIKEI STON LOGARIASMO, OXI STI SYSKEVI
echo        + i othoni epivravevsis, DYO katastaseis me simaia apo ton server.
echo.
echo  !! PROSOXI SEIRA: I METAVASI VASIS TREXEI PRIN TON WORKER.
echo     To neo register grafei ref_code. Xoris ti stili, KATHE eggrafi = 500.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/7] Deiktes pou PREPEI na yparxoun...
findstr /c:"ensureRefCode" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"/api/km/ref" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"function proLive" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"ref_code" schema\km_ref.sql >nul
if errorlevel 1 goto nm
findstr /c:"km-v65" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"data-pro" site\kostometro\index.html >nul
if errorlevel 1 goto nm
echo    OK - 6 deiktes.

echo [2/7] Deiktes pou PREPEI na leipoun (i palindromisi tis 17/9)...
findstr /c:"id.replace('km_', '').replace('hc_', '').slice(-8)" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"Prosklisies pou esteiles" site\kostometro\index.html >nul
if not errorlevel 1 goto lo
echo    OK

echo [3/7] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
node --check site\kostometro\app.js
if errorlevel 1 goto failed
node --check site\kostometro\sw.js
if errorlevel 1 goto failed
echo    OK

echo [4/7] Oles oi souites...
for %%T in (ref pinakas h11b mail cleanup feedback) do (
  node --experimental-sqlite tests\%%T.test.mjs
  if errorlevel 1 goto tf
)
node tests\ref_ui.test.mjs
if errorlevel 1 goto tf
echo    OK

echo [5/7] Apodeixi metallaxis - MIA METALLAXI TI FORA...
for %%N in (1 2 3 4 5) do (
  node --experimental-sqlite tests\ref.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6) do (
  node tests\ref_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\pinakas.test.mjs --mutate
if errorlevel 1 goto mf
node --experimental-sqlite tests\h11b.test.mjs --mutate
if errorlevel 1 goto mf
echo    OK

echo [6/7] METAVASI VASIS - PRIN ton worker...
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --file=schema/km_ref.sql > migrate_ref_out.txt 2>&1
if errorlevel 1 goto migf
findstr /c:"ref_code" migrate_ref_out.txt >nul
type migrate_ref_out.txt
echo    Elegxos oti i stili yparxei ONTOS...
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --command "SELECT COUNT(*) AS n FROM pragma_table_info('km_accounts') WHERE name='ref_code'" > migrate_ref_verify.txt 2>&1
type migrate_ref_verify.txt
findstr /c:"1" migrate_ref_verify.txt >nul
if errorlevel 1 goto migf
echo    OK - i stili yparxei.

echo [7/7] Staging kai push...
git add src\km.js schema\km_ref.sql
if errorlevel 1 goto failed
git add tests\ref.test.mjs tests\ref_ui.test.mjs tests\pinakas.test.mjs tests\h11b.test.mjs
if errorlevel 1 goto failed
git add site\kostometro\index.html site\kostometro\app.js site\kostometro\app.css
if errorlevel 1 goto failed
git add site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add deploy_v65.bat commit_v65.txt
if errorlevel 1 goto failed
git commit -F commit_v65.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo   Meta, se PRAGMATIKI syskevi:
echo     1. fastwrite.tech/kostometro/ -^> Menou -^> Kalese
echo     2. O syndesmos prepei na exei 10 kefalaia/psifia meta to ?ref=
echo     3. Anoixe ton IDIO syndesmo se ALLI syskevi -^> "Anoixan" = 1
echo     4. Anoixe ton XANA sti idia -^> paramenei 1 (de-duplication)
echo     5. "Energes systaseis" prepei na leei "-", OXI 0.
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
:migf
echo. & echo  ******** I METAVASI VASIS APETYXE - O WORKER DEN ANEVIKE. ******** & echo.
echo  Dialexe: diorthose ti metavasi, i kane git checkout sta arxeia.
pause
exit /b 1
:lo
echo    Epezise PALIOS deiktis (kodikos apo syskevi, i "esteiles" ston metriti).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
