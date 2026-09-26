@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  S2 = "Geia sou," XORIS onoma + 24 mines tirisi leads + resend mono gia dokimi
echo        Kamia allagi stin efarmogi. Metavasi vasis: schema\km_leads.sql (CREATE IF NOT EXISTS).
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes...
findstr /c:"KM-LEADS" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"/api/km/lista" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-LEADS-RETENTION" src\km.js >nul
if errorlevel 1 goto nm
echo    OK

echo [2/5] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
echo    OK

echo [3/5] Tests + apodeixeis metallaxis...
node --experimental-sqlite tests\leads.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10) do (
  node --experimental-sqlite tests\leads.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%T in (ref pinakas h11b mail cleanup feedback verify v88) do (
  node --experimental-sqlite tests\%%T.test.mjs
  if errorlevel 1 goto tf
)
node --experimental-sqlite tests\pinakas.test.mjs --mutate
if errorlevel 1 goto mf
node --experimental-sqlite tests\cleanup.test.mjs --mutate
if errorlevel 1 goto mf
echo    OK

echo [5/5] Staging kai push...
git add src\km.js tests\leads.test.mjs tests\cleanup.test.mjs tools\leads_csv.mjs
if errorlevel 1 goto failed
git add deploy_vS2_leads.bat commit_S2.txt
if errorlevel 1 goto failed
git commit -F commit_S2.txt
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
