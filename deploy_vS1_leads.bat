@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  S1 = LISTA LEADS + APOSTOLI + SELIDA "MENO / FEVGO" (server mono)
echo        Kamia allagi stin efarmogi. Metavasi vasis: schema\km_leads.sql (CREATE IF NOT EXISTS).
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes...
findstr /c:"KM-LEADS" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"/api/km/lista" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"CREATE TABLE IF NOT EXISTS km_leads" schema\km_leads.sql >nul
if errorlevel 1 goto nm
echo    OK

echo [2/5] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
echo    OK

echo [3/5] Tests + apodeixeis metallaxis...
node --experimental-sqlite tests\leads.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8) do (
  node --experimental-sqlite tests\leads.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%T in (ref pinakas h11b mail cleanup feedback verify v88) do (
  node --experimental-sqlite tests\%%T.test.mjs
  if errorlevel 1 goto tf
)
node --experimental-sqlite tests\pinakas.test.mjs --mutate
if errorlevel 1 goto mf
echo    OK

echo [4/5] Metavasi vasis PRIN to deploy...
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --file schema\km_leads.sql
if errorlevel 1 goto failed
echo    OK

echo [5/5] Staging kai push...
git add src\km.js schema\km_leads.sql tests\leads.test.mjs tools\leads_csv.mjs
if errorlevel 1 goto failed
git add deploy_vS1_leads.bat commit_S1.txt
if errorlevel 1 goto failed
git commit -F commit_S1.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo   OK - Cloudflare ~2 lepta.
exit /b 0

:tf
echo  ******** TESTS FAILED - tipota den anevike. ********
exit /b 1
:mf
echo  ******** APODEIXI METALLAXIS APETYXE. ********
exit /b 1
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo  ******** APETYXE - tipota den anevike. ********
exit /b 1
