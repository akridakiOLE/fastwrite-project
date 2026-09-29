@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v98 = SYNDESI ME GOOGLE / MICROSOFT (KM-OAUTH)
echo.
echo        Metavasi vasis: schema\km_oauth.sql (CREATE IF NOT EXISTS, 1 neos pinakas).
echo        Mystika: GOOGLE_CLIENT_SECRET + MS_CLIENT_SECRET PREPEI na yparxoun (SECRETS_OAUTH.bat).
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/7] Deiktes pou PREPEI na yparxoun...
findstr /c:"KM-OAUTH" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-SERVER-V98-OAUTH" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"DELETE FROM km_oauth_states WHERE state_hash = ? RETURNING" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"oauth_google: 1" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-OAUTH" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"function oauthTake" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id=\"go-google\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"id=\"go-microsoft\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"KM-OAUTH" site\kostometro\app.css >nul
if errorlevel 1 goto nm
findstr /c:"km-v98" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"\"v\": \"v98\"" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"GOOGLE_CLIENT_ID" wrangler.toml >nul
if errorlevel 1 goto nm
findstr /c:"MS_CLIENT_ID" wrangler.toml >nul
if errorlevel 1 goto nm
findstr /c:"keep_vars = true" wrangler.toml >nul
if errorlevel 1 goto nm
findstr /c:"CREATE TABLE IF NOT EXISTS km_oauth_states" schema\km_oauth.sql >nul
if errorlevel 1 goto nm
findstr /c:"KM-FUNNEL" src\km.js >nul
if errorlevel 1 goto nm
echo    OK

echo [2/7] Deiktes pou PREPEI na leipoun (kanena mystiko se arxeio pou anevainei)...
findstr /c:"km-v97" site\kostometro\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"GOCSPX" src\km.js >nul
if not errorlevel 1 goto lo
findstr /c:"GOCSPX" wrangler.toml >nul
if not errorlevel 1 goto lo
findstr /c:"GOCSPX" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"GOCSPX" site\kostometro\index.html >nul
if not errorlevel 1 goto lo
findstr /c:"CLIENT_SECRET =" wrangler.toml >nul
if not errorlevel 1 goto lo
findstr /c:"sk-ant" src\km.js >nul
if not errorlevel 1 goto lo
findstr /c:"sk-ant" wrangler.toml >nul
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
echo    OK

echo [4/7] Souites + apodeixeis metallaxis...
node --experimental-sqlite tests\v98.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12) do (
  node --experimental-sqlite tests\v98.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%T in (v97 v95 v94 v93 v92 v88 verify ref pinakas h11b mail cleanup feedback leads) do (
  node --experimental-sqlite tests\%%T.test.mjs
  if errorlevel 1 goto tf
)
for %%T in (v95_ui gs95 v89 v87 v86 v85 verify_ui ai78 ref_ui pinakas_ui install_ui) do (
  node tests\%%T.test.mjs
  if errorlevel 1 goto tf
)
for %%N in (1 2 3 4 5 6 7 8 9) do (
  node --experimental-sqlite tests\v97.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13) do (
  node --experimental-sqlite tests\verify.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
echo    OK

echo [5/7] Mystika sti Cloudflare (onomata mono)...
call npx --yes wrangler secret list > secrets_list_out.txt 2>&1
findstr /c:"GOOGLE_CLIENT_SECRET" secrets_list_out.txt >nul
if errorlevel 1 goto ns
findstr /c:"MS_CLIENT_SECRET" secrets_list_out.txt >nul
if errorlevel 1 goto ns
echo    OK

echo [6/7] Metavasi vasis PRIN to deploy...
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --file schema\km_oauth.sql
if errorlevel 1 goto failed
echo    OK

echo [7/7] Staging kai push...
git add site\kostometro\app.js site\kostometro\index.html site\kostometro\app.css site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add src\km.js schema\km_oauth.sql wrangler.toml tests\v98.test.mjs
if errorlevel 1 goto failed
git add deploy_v98.bat commit_v98.txt SECRETS_OAUTH.bat deploy_v000_anthropic_check.bat
if errorlevel 1 goto failed
git commit -F commit_v98.txt
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
:ns
echo. & echo  ******** LEIPOUN TA MYSTIKA - trexe prota SECRETS_OAUTH.bat. Tipota den anevike. ******** & echo.
pause
exit /b 1
:lo
echo    Epezise PALIOS deiktis i MYSTIKO (km-v97, GOCSPX, sk-ant, CLIENT_SECRET).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE. ******** & echo.
pause
exit /b 1
