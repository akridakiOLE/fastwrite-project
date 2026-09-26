@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v93 = "SYNEXEIA SE..." MONO GIA ARITHMOUS POU EFTASAN STO support@
echo.
echo        Metavasi vasis: schema\km_support.sql (CREATE IF NOT EXISTS, neos pinakas km_support_tickets).
echo        Kamia allagi mystikon.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/7] Deiktes pou PREPEI na yparxoun...
findstr /c:"KM-SUP-CASE" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-SUP-ARRIVED" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-SUP-ARRIVED" src\worker.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-SUP-ARRIVED" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-SUP-ARRIVED" tools\support\support_autoreply.gs >nul
if errorlevel 1 goto nm
findstr /c:"CREATE TABLE IF NOT EXISTS km_support_tickets" schema\km_support.sql >nul
if errorlevel 1 goto nm
findstr /c:"KM-SUP-CASE" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"hp-cases" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:".hp-cases" site\kostometro\app.css >nul
if errorlevel 1 goto nm
findstr /c:"km-v93" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"\"v\": \"v93\"" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"CREATE TABLE IF NOT EXISTS km_support_seq" schema\km_support.sql >nul
if errorlevel 1 goto nm
findstr /c:"KM_SUPPORT_KEY" tools\support\support_autoreply.gs >nul
if errorlevel 1 goto nm
echo    OK

echo [2/7] Deiktes pou PREPEI na leipoun...
findstr /c:"km-v92" site\kostometro\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"function newTicket" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"AIza" site\kostometro\index.html >nul
if not errorlevel 1 goto lo
findstr /c:"AIza" tools\support\support_autoreply.gs >nul
if not errorlevel 1 goto lo
echo    OK

echo [3/7] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
node --check src\worker.js
if errorlevel 1 goto failed
node --check site\kostometro\app.js
if errorlevel 1 goto failed
node --check site\kostometro\sw.js
if errorlevel 1 goto failed
node --check site\pinakas\app.js
if errorlevel 1 goto failed
echo    OK

echo [4/7] Souites + apodeixeis metallaxis, MIA TI FORA...
node --experimental-sqlite tests\v93.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 11) do (
  node --experimental-sqlite tests\v93.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\v92.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13) do (
  node --experimental-sqlite tests\v92.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node tests\v89.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9) do (
  node tests\v89.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\v88.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9) do (
  node --experimental-sqlite tests\v88.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node tests\v87.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4) do (
  node tests\v87.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node tests\v86.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4) do (
  node tests\v86.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node tests\v85.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16) do (
  node tests\v85.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\verify.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13) do (
  node --experimental-sqlite tests\verify.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node tests\verify_ui.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8) do (
  node tests\verify_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node tests\ai78.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33) do (
  node tests\ai78.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%T in (ref pinakas h11b mail cleanup feedback leads) do (
  node --experimental-sqlite tests\%%T.test.mjs
  if errorlevel 1 goto tf
)
node tests\ref_ui.test.mjs
if errorlevel 1 goto tf
node tests\pinakas_ui.test.mjs
if errorlevel 1 goto tf
node tests\install_ui.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10) do (
  node --experimental-sqlite tests\ref.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16) do (
  node tests\ref_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6) do (
  node tests\pinakas_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29) do (
  node tests\install_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\pinakas.test.mjs --mutate
if errorlevel 1 goto mf
node --experimental-sqlite tests\h11b.test.mjs --mutate
if errorlevel 1 goto mf
echo    OK

echo [5/7] Metavasi vasis PRIN to deploy...
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --file schema\km_support.sql
if errorlevel 1 goto failed
echo    OK

echo [6/7] Mystiko: kamia allagi (KM_SUPPORT_KEY yparxei apo ti v92).

echo [7/7] Staging kai push...
git add site\kostometro\app.js site\kostometro\index.html site\kostometro\app.css site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add src\km.js src\worker.js schema\km_support.sql tools\support\support_autoreply.gs
if errorlevel 1 goto failed
git add tests\v93.test.mjs tests\v92.test.mjs
if errorlevel 1 goto failed
git add deploy_v93.bat commit_v93.txt
if errorlevel 1 goto failed
git commit -F commit_v93.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo ================================
echo.
exit /b 0

:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike. ******** & echo.
exit /b 1
:mf
echo. & echo  ******** APODEIXI METALLAXIS APETYXE. ******** & echo.
exit /b 1
:lo
echo    Epezise PALIOS deiktis (km-v92, newTicket, AIza).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE. ******** & echo.
exit /b 1
