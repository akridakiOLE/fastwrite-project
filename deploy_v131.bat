@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\fastwrite-project
echo.
echo  v131 = K3 eisodos apo tin efarmogi katastimatos (RFC 8252) + CORS kelyfous
echo         + logariasmos elegxou appreview@ (KM_REVIEW_CODE).
echo         Kodikas etoimos apo tin kentriki (v131_code.tgz, sha256 08444bff...).
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/8] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
node --check src\worker.js
if errorlevel 1 goto failed
echo    OK

echo [2/8] v131 + metallaxeis 1-10 (exit 0 = piastike)...
node --experimental-sqlite tests\v131.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10) do (
  node --experimental-sqlite tests\v131.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
echo    OK

echo [3/8] v98 + metallaxeis 1-10 kai 12 (i 11 einai idi xalasmeni apo ti v116)...
node --experimental-sqlite tests\v98.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 12) do (
  node --experimental-sqlite tests\v98.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
echo    OK

echo [4/8] v118 / v129 / v130...
node --experimental-sqlite tests\v118.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\v129.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\v130.test.mjs
if errorlevel 1 goto tf
echo    OK

echo [5/8] D1 PRIN to deploy - logariasmos Cloudflare...
call npx --yes wrangler whoami > "%TEMP%\v131_d1_out.txt" 2>&1
if errorlevel 1 goto d1
type "%TEMP%\v131_d1_out.txt"
findstr /i /c:"not authenticated" "%TEMP%\v131_d1_out.txt" >nul
if not errorlevel 1 goto d1

echo    ALTER TABLE km_oauth_states ADD COLUMN app_ch ...
call npx --yes wrangler d1 execute DB --remote --command="ALTER TABLE km_oauth_states ADD COLUMN app_ch TEXT" --yes > "%TEMP%\v131_d1_out.txt" 2>&1
set RC_ALTER=%errorlevel%
type "%TEMP%\v131_d1_out.txt"
if "%RC_ALTER%"=="0" goto alter_ok
findstr /i /c:"duplicate column" "%TEMP%\v131_d1_out.txt" >nul
if errorlevel 1 goto d1
echo    (duplicate column = egine idi, dekto)
:alter_ok

echo    CREATE TABLE/INDEX km_oauth_handoff ...
call npx --yes wrangler d1 execute DB --remote --command="CREATE TABLE IF NOT EXISTS km_oauth_handoff (h_hash TEXT PRIMARY KEY, app_ch TEXT NOT NULL, frag TEXT NOT NULL, created TEXT NOT NULL); CREATE INDEX IF NOT EXISTS idx_km_oauth_handoff_created ON km_oauth_handoff(created)" --yes
if errorlevel 1 goto d1

echo    Epalithefsi sqlite_master + stili app_ch ...
call npx --yes wrangler d1 execute DB --remote --command="SELECT name FROM sqlite_master" --yes > "%TEMP%\v131_d1_out.txt" 2>&1
if errorlevel 1 goto d1
findstr /c:"idx_km_oauth_handoff_created" "%TEMP%\v131_d1_out.txt" >nul
if errorlevel 1 goto d1
findstr /c:"km_oauth_handoff" "%TEMP%\v131_d1_out.txt" >nul
if errorlevel 1 goto d1
call npx --yes wrangler d1 execute DB --remote --command="SELECT COUNT(app_ch) AS n FROM km_oauth_states" --yes
if errorlevel 1 goto d1
echo    OK - vasi etoimi

echo [6/8] git add (RITI lista) + commit + push...
git add src\km.js src\worker.js schema\km_oauth.sql schema\km_k3.sql tests\v131.test.mjs tests\v98.test.mjs deploy_v131.bat commit_v131.txt
if errorlevel 1 goto failed
git commit -F commit_v131.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo    OK

echo [7/8] wrangler deploy...
call npx --yes wrangler deploy
if errorlevel 1 goto failed
echo    OK

echo [8/8] Mystiko KM_REVIEW_CODE (apo secrets\, ektos git)...
if not exist "secrets\km_review_code.txt" goto ns
type secrets\km_review_code.txt | call npx --yes wrangler secret put KM_REVIEW_CODE
if errorlevel 1 goto ns
call npx --yes wrangler secret list > "%TEMP%\v131_secrets_out.txt" 2>&1
findstr /c:"KM_REVIEW_CODE" "%TEMP%\v131_secrets_out.txt" >nul
if errorlevel 1 goto ns
echo    OK - to onoma yparxei sti lista (i timi den typonetai)

echo.
echo  Teleftaies ekdoseis:
call npx --yes wrangler deployments list
echo.
echo ================================
echo   OK - v131 - K3 + CORS + appreview@
echo ================================
exit /b 0

:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike, i vasi den agixtike. ******** & echo.
exit /b 1
:mf
echo. & echo  ******** APODEIXI METALLAXIS APETYXE - tipota den anevike, i vasi den agixtike. ******** & echo.
exit /b 1
:d1
echo. & echo  ******** D1 APETYXE - kodikas DEN anevike (oute git oute deploy). ******** & echo.
exit /b 1
:ns
echo. & echo  ******** O KODIKAS v131 ANEVIKE, alla to mystiko KM_REVIEW_CODE OXI. ********
echo  ******** O logariasmos elegxou menei kleistos mexri na mpei to mystiko. ******** & echo.
exit /b 2
:failed
echo. & echo  ******** APETYXE. ******** & echo.
exit /b 1
