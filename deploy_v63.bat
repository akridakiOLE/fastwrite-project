@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v63 = PINAKAS ELEGXOU SE KLIMAKA
echo        filtra + selidopoiisi + ALITHINO synolo + index se DYO vaseis.
echo        Kanonas Stavros 16/9: sxediazoume gia to MEGALO, oxi gia simera.
echo.

if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/7] Deiktes pou PREPEI na yparxoun...
findstr /c:"function pkFilters" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"accounts_total: list.total" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"async function kmAccounts" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"function fwQuery" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"accounts_total" main_api.py >nul
if errorlevel 1 goto nm
findstr /c:"FROM_SQL" main_api.py >nul
if errorlevel 1 goto nm
findstr /c:"idx_documents_user" db_manager.py >nul
if errorlevel 1 goto nm
findstr /c:"idx_km_accounts_live_created" schema\km_pinakas.sql >nul
if errorlevel 1 goto nm
findstr /c:"function renderKmAcc" site\pinakas\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id=\"acc-more\"" site\pinakas\index.html >nul
if errorlevel 1 goto nm
findstr /c:"pk-v3" site\pinakas\sw.js >nul
if errorlevel 1 goto nm
echo    OK - 11 deiktes.

echo [2/7] Deiktes pou PREPEI na leipoun...
findstr /c:"pk-v2" site\pinakas\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"LIMIT 500`" src\km.js >nul
if not errorlevel 1 goto lo
findstr /c:"ORDER BY u.created_at DESC LIMIT 300" main_api.py >nul
if not errorlevel 1 goto lo
findstr /c:"n=' + Date.now()" site\pinakas\app.js >nul
if not errorlevel 1 goto lo
echo    OK

echo [3/7] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
node --check site\pinakas\app.js
if errorlevel 1 goto failed
node --check site\pinakas\sw.js
if errorlevel 1 goto failed
python -m py_compile main_api.py
if errorlevel 1 goto failed
python -m py_compile db_manager.py
if errorlevel 1 goto failed
echo    OK

echo [4/7] METAVASI VASIS D1 - PRIN to deploy (index, kamia stili)...
echo       (--command, OXI --file: to endpoint /d1/.../import gyrnaei
echo        Authentication error 10000 me ayto to OAuth token - 16/9/2026)
set D1=npx --yes wrangler d1 execute fastwrite-beta-downloads --remote
call %D1% --command "CREATE INDEX IF NOT EXISTS idx_km_accounts_live_created ON km_accounts (deleted, created); CREATE INDEX IF NOT EXISTS idx_km_accounts_source ON km_accounts (source); CREATE INDEX IF NOT EXISTS idx_km_accounts_ref ON km_accounts (ref); CREATE INDEX IF NOT EXISTS idx_km_accounts_country ON km_accounts (country); CREATE INDEX IF NOT EXISTS idx_km_accounts_plan ON km_accounts (plan); CREATE INDEX IF NOT EXISTS idx_km_accounts_lastsync ON km_accounts (last_sync); CREATE INDEX IF NOT EXISTS idx_km_device_links_seen ON km_device_links (last_seen);" > migrate_pinakas_out.txt 2>&1
if errorlevel 1 goto migshow
echo    Ektelestike. Tora i APODEIXI - ta metrame sti ZONTANI vasi:
call %D1% --command "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name" > migrate_verify_out.txt 2>&1
if errorlevel 1 goto migshow
findstr /c:"idx_km_accounts_live_created" migrate_verify_out.txt >nul
if errorlevel 1 goto migmissing
findstr /c:"idx_km_device_links_seen" migrate_verify_out.txt >nul
if errorlevel 1 goto migmissing
echo    OK - ta index yparxoun ONTOS sti vasi (metrithikan, den ypotethikan):
findstr /c:"idx_" migrate_verify_out.txt

echo [5/7] Oles oi souites (allaxe to km.js - trexoun OLES)...
node --experimental-sqlite tests\pinakas.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\h11b.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\mail.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\cleanup.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\feedback.test.mjs
if errorlevel 1 goto tf

echo [6/7] Apodeixi metallaxis (6 metallaxeis - prepei na kokkinisei)...
node --experimental-sqlite tests\pinakas.test.mjs --mutate
if errorlevel 1 goto mf
node --experimental-sqlite tests\h11b.test.mjs --mutate
if errorlevel 1 goto mf
echo    OK

echo [7/7] Staging - riti lista...
git add src\km.js main_api.py db_manager.py schema\km_pinakas.sql
if errorlevel 1 goto failed
git add site\pinakas\index.html site\pinakas\app.js site\pinakas\sw.js site\pinakas\manifest.webmanifest
if errorlevel 1 goto failed
git add tests\pinakas.test.mjs hetzner_pinakas.sh deploy_hetzner.bat
if errorlevel 1 goto failed
git add deploy_v63.bat commit_v63.txt
if errorlevel 1 goto failed
git commit -F commit_v63.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed

echo.
echo ================================
echo   OK - Cloudflare ~2 lepta. META, MIA fora:
echo.
echo   deploy_hetzner.bat   (ferni to neo main_api.py + db_manager.py
echo                         ston server kai kanei restart)
echo.
echo   Meta anoixe fastwrite.tech/pinakas:
echo    - kato apo kathe lista: "deixno 100 apo N"
echo    - koumpi "Ki allous"
echo    - "Filtra": imerominia, email, pigi, systasi, xora, katastasi
echo ================================
echo.
pause
exit /b 0

:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike. ******** & echo.
pause
exit /b 1
:mf
echo. & echo  ******** APODEIXI METALLAXIS APETYXE - ta test den elegxoun tipota. ******** & echo.
pause
exit /b 1
:migshow
echo.
type migrate_pinakas_out.txt
echo.
echo  ******** I METAVASI D1 APETYXE - tipota den anevike. ********
echo  Stile mou tis teleytaies grammes parapano.
echo.
pause
exit /b 1
:migmissing
echo.
type migrate_verify_out.txt
echo.
echo  ******** I entoli perase alla ta index DEN fainontai sti vasi. ********
echo  Tipota den anevike. Ayto einai to eidos lathous pou krivetai - stile mou to parapano.
echo.
pause
exit /b 1
:lo
echo    Epezise PALIOS deiktis (pk-v2, LIMIT 500, LIMIT 300, i to palio cache-bust).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis - ta arxeia ston disko den einai to set tis v63.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
