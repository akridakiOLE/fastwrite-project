@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v67 = O SYSTIMENOS APOFASIZEI AN THA FANEI TO EMAIL TOU
echo        Sygkatathesi stin eggrafi + lista sti "Kalese".
echo.
echo  !! PROSOXI SEIRA: I METAVASI VASIS TREXEI PRIN TON WORKER.
echo     To neo register grafei ref_share. Xoris ti stili, KATHE eggrafi = 500.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/7] Deiktes pou PREPEI na yparxoun...
findstr /c:"ref_share" schema\km_ref2.sql >nul
if errorlevel 1 goto nm
findstr /c:"CASE WHEN ref_share = 1 THEN email ELSE NULL END" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"function renderRefList" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id=\"ref-consent\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:".consent .chk" site\kostometro\app.css >nul
if errorlevel 1 goto nm
findstr /c:"km-v67" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
echo    OK - 6 deiktes.

echo [2/7] Deiktes pou PREPEI na leipoun...
findstr /c:"id=\"ref-share\" checked" site\kostometro\index.html >nul
if not errorlevel 1 goto lo
findstr /c:"who.innerHTML" site\kostometro\app.js >nul
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

echo [5/7] 19 apodeixeis metallaxis - MIA TI FORA...
for %%N in (1 2 3 4 5 6 7) do (
  node --experimental-sqlite tests\ref.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12) do (
  node tests\ref_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\pinakas.test.mjs --mutate
if errorlevel 1 goto mf
node --experimental-sqlite tests\h11b.test.mjs --mutate
if errorlevel 1 goto mf
echo    OK

echo [6/7] METAVASI VASIS - PRIN ton worker...
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --file=schema/km_ref2.sql > migrate_ref2_out.txt 2>&1
if errorlevel 1 goto migf
type migrate_ref2_out.txt
echo    Elegxos oti i stili yparxei ONTOS...
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --command "SELECT COUNT(*) AS n FROM pragma_table_info('km_accounts') WHERE name='ref_share'" > migrate_ref2_verify.txt 2>&1
type migrate_ref2_verify.txt
findstr /c:"1" migrate_ref2_verify.txt >nul
if errorlevel 1 goto migf
echo    OK - i stili yparxei.

echo [7/7] Staging kai push...
git add src\km.js schema\km_ref2.sql
if errorlevel 1 goto failed
git add site\kostometro\index.html site\kostometro\app.js site\kostometro\app.css
if errorlevel 1 goto failed
git add site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add tests\ref.test.mjs tests\ref_ui.test.mjs tests\pinakas.test.mjs tests\h11b.test.mjs
if errorlevel 1 goto failed
git add deploy_v67.bat commit_v67.txt report_ref.bat
if errorlevel 1 goto failed
git commit -F commit_v67.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo   I DOKIMI (kleise OLA ta incognito prota):
echo     1. Neo incognito -^> o syndesmos sou me ?ref=
echo     2. Rythmiseis -^> Ekdosi = v67 PRIN synexiseis
echo     3. Stin othoni email prepei na fainetai to koutaki,
echo        ASYMPLIROTO. Kane eggrafi XORIS na to tsekareis.
echo     4. Kinito -^> Kalese: "Eggrafi #N - 19/09", XORIS email.
echo     5. Xana, se NEO incognito, ME to koutaki tsekarismeno.
echo     6. Kinito -^> Kalese: tora fainetai to email.
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
pause
exit /b 1
:lo
echo    Epezise APAGOREYMENOS deiktis (proepilegmeno koutaki i innerHTML).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
